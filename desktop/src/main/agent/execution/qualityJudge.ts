import { LlmClient, type LlmCallOptions } from '../../llm/client'
import { parseLlmJson } from '../../../shared/util/object'
import { isAbortError } from '../../../shared/abort'
import type { LlmJudgeVerdict } from '../../../shared/types'

/**
 * LLM-as-Judge 的**异步评审层**（DD-19 剩余项，章节侧专用）。
 *
 * ## 职责分工（与 `shared/agent/qualityGate.ts` 配合）
 * - `qualityGate.ts::evaluateChapterDraft`：确定性门（validateCeshu + 立项完成度），
 *   纯同步、不调 LLM、可单测 —— 这是**主**结论。
 * - 本模块 `runLlmJudge`：**辅助**维度（毒性/可读性/创意），必须由 main 层发起 LLM 调用
 *   （shared 层禁 import main，铁律），结果再交给 `applyJudge` 合并进 verdict。
 *
 * ## 保密合规（DD-0b）
 * judge 复用与正文生成**同一份** `callOpts`（含 `StoredLlmConfig`），
 * `LlmClient.generate` 内部 `resolveConfig → effectiveProvider` 会无视 `stored.provider`、
 * 强制本地 Ollama —— 即保密模式下 judge 也**物理不触云端**，无需本模块额外判断。
 * 若本地无模型导致调用失败，被下方 try/catch 降级为 `null`，不阻断正文生成。
 *
 * ## 降级铁律（与取消的例外）
 * judge 是**辅助**，**绝不允许**因自身业务失败（网络/解析/超时）拖垮或阻断正文生成：
 * 这类异常一律返回 `null`，由 `applyJudge` 原样返回确定性 verdict。
 * **唯一例外是「取消」**：用户点「停止」导致的 `AbortError` 会**继续向上抛**，
 * 让整次单发生成如实报「已停止」——否则正文已白跑、面板却显示成功（判官这步
 * 最长可占满 180s 超时窗口，不抛等于让停止按钮失灵）。
 */

const judgeClient = new LlmClient()

const JUDGE_SYSTEM = [
  '你是游戏策划案的辅助审阅专家，对 AI 生成的单个章节内容做轻量评审。',
  '你只负责机器判定不了的维度：内容是否违规（毒性）、文字是否通顺（可读性）、设计是否有新意（创意）。',
  '不要重写内容，只输出严格 JSON，不要任何解释性文字或 Markdown 代码块标记。',
  'JSON 字段：',
  '  "toxicity": "safe" 或 "flagged"（flagged = 含暴力/涉政/色情等合规红线内容）',
  '  "readability": 0-10 整数（文字通顺度，越高越通顺）',
  '  "creativity": 0-10 整数（设计新意，越高越有亮点）',
  '  "score": 0-100 整数（综合印象分，仅供参考，不与策划书自动评分混用）',
  '  "comment": 一句话中文短评（≤40 字，指出亮点或风险）'
].join('\n')

/** 把生成的字段组装成 judge 的评审对象（只给字段名→值，控制输入体量省 token） */
function buildJudgePrompt(chapter: string, fields: Record<string, unknown>): string {
  const entries = Object.entries(fields)
    .map(([key, value]) => {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      // 单字段截断，避免超长文本撑爆 judge 上下文
      const clipped = text.length > 600 ? `${text.slice(0, 600)}…（已截断）` : text
      return `- ${key}: ${clipped}`
    })
    .join('\n')
  return `章节：${chapter}\nAI 生成内容：\n${entries}\n\n请按系统指令评审并只输出 JSON。`
}

/** 把 LLM 原始 JSON 规整成 `LlmJudgeVerdict`；字段不可信时返回 `null`（触发降级） */
function normalizeJudge(raw: unknown): LlmJudgeVerdict | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  const toxicity = obj.toxicity === 'flagged' ? 'flagged' : obj.toxicity === 'safe' ? 'safe' : null
  // 毒性是 judge 的核心价值，字段不可信时宁可降级也不要误标
  if (toxicity === null) return null

  const clamp = (value: unknown, lo: number, hi: number, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return fallback
    return Math.min(hi, Math.max(lo, n))
  }

  const comment = typeof obj.comment === 'string' ? obj.comment.slice(0, 120) : ''
  return {
    toxicity,
    readability: clamp(obj.readability, 0, 10, 0),
    creativity: clamp(obj.creativity, 0, 10, 0),
    score: Math.round(clamp(obj.score, 0, 100, 0)),
    comment
  }
}

/**
 * 异步发起一次轻量 judge 评审。
 *
 * @param callOpts 与正文生成同源的 LLM 调用配置（自动遵守保密约束）
 * @param chapter 章节 key（仅作评审上下文）
 * @param fields AI 生成的章节字段（judge 的评审对象）
 * @param signal 取消信号（由单发 harness 传入，与正文生成共用同一张取消表）。给了就**可被「停止」打断**。
 * @returns 规整后的 verdict；任何**业务**失败（未配置/网络/解析）一律返回 `null`
 * @throws 取消（`AbortError`）时**向上抛**，不吞——见下方「取消 ≠ 失败」说明。
 */
export async function runLlmJudge(
  callOpts: LlmCallOptions,
  chapter: string,
  fields: Record<string, unknown>,
  signal?: AbortSignal
): Promise<LlmJudgeVerdict | null> {
  try {
    if (callOpts.config === undefined) return null
    const { content } = await judgeClient.generate(JUDGE_SYSTEM, buildJudgePrompt(chapter, fields), {
      ...callOpts,
      ...(signal !== undefined ? { signal } : {})
    })
    return normalizeJudge(parseLlmJson(content))
  } catch (error) {
    // 取消 ≠ 失败：judge 被「停止」打断时**必须**把 AbortError 继续抛给 harness，
    // 否则整次生成会被当成「成功、judge 恰好失败」降级为 null —— 用户点了停止却看到成功，
    // 且正文已经白跑（判官这步最长可占 180s 超时窗口）。
    // 其余一切异常（未配置/网络/解析）仍按降级铁律返回 null，绝不阻断正文生成。
    if (isAbortError(error)) throw error
    return null
  }
}
