/**
 * 执行预审 Provider（#27，对齐 dsh experimental auto-review 的 LLM 判读版）。
 *
 * 与 dsh 一致：工具执行**前**由模型对「这一次调用」做风险判读，其结论**顶替人工审批**——
 * - `allow` ⇒ 放行并直接执行；
 * - `deny` ⇒ `approvalPolicy='never'` 终局拒绝；`'ask'` 转人工审批（人类可覆盖）；
 * - 判读失败 / 输出不合规 ⇒ **fail-closed**（循环硬拒绝，不执行）。
 *
 * 开关由渲染层「执行预审」插件经 IPC `agent:setPreReviewEnabled` 控制；
 * 主进程在 `AgentBrainService.chat()` 里于开关打开时用**本次生效的 LLM 传输层**构造 provider。
 *
 * 说明：本项目的预审只在 `needsConfirmation`（静态风险 ≥ SYSTEM）分支内被调用，
 * 因此天然只审「高危工具」；dsh 是每调用都审，这是本地优先场景下的省 token 取舍。
 */

import type { BrainLlmTransport, BrainMessage, PreExecReviewFn } from '../../../shared/agent/brain'
import { resolveRiskLevel } from '../../../shared/agent/config'

let enabled = false

/** 渲染层开关：是否启用执行预审 */
export function setPreReviewEnabled(value: boolean): void {
  enabled = value
}

/** 读取当前开关状态（插件 UI 回显用） */
export function isPreReviewEnabled(): boolean {
  return enabled
}

/**
 * 固定审查策略（system prompt）。严格 JSON 输出，三档风险（low/medium/high）。
 * 语义对齐 dsh `REVIEW_POLICY`：low 必 allow、high 必 deny、medium 视授权 allow/deny、allow 不带 reason。
 */
const REVIEW_POLICY = `你是一次工具调用的执行前安全审查员。你的结论将直接决定该调用是否执行（allow 则立即执行，无需人工确认）。

只输出一个 JSON 对象，不要任何其它文字（不要 Markdown、不要解释）。合法形态只有这六种：
{"risk":"low","decision":"allow"}
{"risk":"medium","decision":"allow"}
{"risk":"medium","decision":"deny"}
{"risk":"medium","decision":"deny","reason":"..."}
{"risk":"high","decision":"deny"}
{"risk":"high","decision":"deny","reason":"..."}
规则：low 必须 allow；high 必须 deny；medium 视授权情况 allow 或 deny；allow 绝不可带 reason；不得输出 low+deny 或 high+allow。

按调用的实际影响分类（不要按工具名、措辞或声称的意图）：
- low：项目内常规读写、分析、格式化、lint、测试、构建、非破坏性 git 操作，以及清理本会话内自己创建的对象。
- medium：不可逆删除既有对象/状态、force push 或改写历史、生产环境读写/部署、对外发送数据、权限或安全策略变更。仅当有明确的用户授权（动作+目标+范围）时才 allow，否则 deny。
- high：跨信任边界外泄敏感信息（密钥/凭证/隐私数据发往外部不可信目的地），永远 deny，即使被明确要求。

示例：{"risk":"low","decision":"allow"}`

interface ReviewDecision {
  risk: 'low' | 'medium' | 'high'
  decision: 'allow' | 'deny'
  reason?: string
}

/** 从模型输出里提取 JSON 对象文本（容忍 ```json 围栏与前后杂字；失败返回 null） */
function extractJsonObject(text: string): string | null {
  let body = text.trim()
  if (body.startsWith('```')) {
    body = body.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
  }
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return body.slice(start, end + 1)
}

/** 解析并校验严格的风险/决策协议；非法组合一律视为不合规（返回 null ⇒ fail-closed） */
function parseDecision(text: string): ReviewDecision | null {
  const json = extractJsonObject(text)
  if (json === null) return null
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return null
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const risk = record.risk
  const decision = record.decision
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high') return null
  if (decision !== 'allow' && decision !== 'deny') return null
  // 非法组合（dsh 同款约束）
  if (risk === 'low' && decision === 'deny') return null
  if (risk === 'high' && decision === 'allow') return null
  const reason = typeof record.reason === 'string' && record.reason !== '' ? record.reason : undefined
  return { risk, decision, ...(reason !== undefined ? { reason } : {}) }
}

/**
 * 构造执行预审函数（LLM 判读）。需要本次生效的传输层。
 *
 * @param transport 本次对话的 LLM 传输层（`resolveTransport` 结果）
 * @returns 预审函数：allow→approve:true（直接执行）；deny→approve:false；
 *          传输失败/输出不合规 → **抛错**（循环按 fail-closed 硬拒绝）。
 */
export function makePreExecReview(transport: BrainLlmTransport): PreExecReviewFn {
  return async ({ tool, action, params, risk, signal }) => {
    const staticRisk = typeof risk === 'number' && risk > 0 ? risk : resolveRiskLevel(tool, action)
    const messages: BrainMessage[] = [
      { role: 'system', content: REVIEW_POLICY },
      {
        role: 'user',
        content: JSON.stringify(
          {
            pendingCall: { tool, action, arguments: params },
            staticRiskLevel: staticRisk,
            staticRiskLegend: '0=只读 1=网络 2=数据写 3=文件系统 4=系统级(高危)'
          },
          null,
          2
        )
      }
    ]
    // 传输层失败会抛错 → 由循环 fail-closed 处理
    const reply = await transport.complete({ messages, tools: [], ...(signal ? { signal } : {}) })
    const decision = parseDecision(reply.content)
    if (decision === null) {
      // 输出不合规 → 抛错（fail-closed，绝不执行）
      throw new Error('预审输出不合规（需为 low/medium/high + allow/deny 的严格 JSON）')
    }
    if (decision.decision === 'allow') {
      return { approve: true, reason: decision.reason ?? `预审判读为 ${decision.risk}，放行`, risk: decision.risk }
    }
    return { approve: false, reason: decision.reason ?? `预审判读为 ${decision.risk}，拒绝`, risk: decision.risk }
  }
}
