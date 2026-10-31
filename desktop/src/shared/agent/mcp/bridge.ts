import { RISK_LEVEL, type RiskLevel, type SkillProtocol, type SkillResult } from '../config'
import type { McpCallResult, McpRiskLevel, McpToolInfo } from './types'

/**
 * MCP 工具 → `SkillProtocol` 的**纯桥接**（Slice 18）。
 *
 * 为什么走桥接而不是给 MCP 单开一套工具通路：`SkillDispatcher` 已经统一了
 * 注册 / 模糊匹配 / 审批门 / 工具面分组 / 档位限量 / 操作日志。把 MCP 工具转成
 * `SkillProtocol` 后，这些**全部零改动复用**——MCP 只是「技能的另一个来源」。
 */

/** 配置里的风险档 → 风险等级 */
const MCP_RISK_MAP: Record<McpRiskLevel, RiskLevel> = {
  read: RISK_LEVEL.READ_ONLY,
  write: RISK_LEVEL.DATA_WRITE,
  filesystem: RISK_LEVEL.FILE_SYSTEM,
  network: RISK_LEVEL.NETWORK,
  system: RISK_LEVEL.SYSTEM
}

/**
 * 工具名分词边界：把下划线/连字符/空白当作分隔符（MCP 工具名多为 `snake_case`，
 * 用 `\b` 会因为 `_` 是单词字符而失效，故用「非字母」边界）。
 */
const WORD_EDGE = (words: string): RegExp => new RegExp(`(^|[^a-z])(${words})(?![a-z])`, 'i')

/** 危险工具名（含这些词 → SYSTEM，每次调用需用户二次确认） */
const DANGEROUS_NAME = WORD_EDGE('shell|exec|execute|command|spawn|write|delete|remove|kill|rm|run')
/** 只读工具名（含这些词 → READ_ONLY，无需确认） */
const READONLY_NAME = WORD_EDGE('read|get|list|search|fetch|query|view|stat')

/**
 * 计算一个 MCP 工具的风险等级：
 * 1. 配置显式指定 `risk` → 用它（推荐：给 shell 类服务器配 `system`）；
 * 2. 否则按工具名启发式：危险词 → SYSTEM、只读词 → READ_ONLY、其余 → DATA_WRITE。
 *
 * 为什么需要它：MCP 工具是**动态**的，`TOOL_RISK_MAP` 是编译期常量覆盖不到；
 * 不登记就一律走 `DEFAULT_TOOL_RISK`（DATA_WRITE），shell 类工具会被静默放行。
 */
export function mcpToolRisk(toolName: string, configured?: McpRiskLevel): RiskLevel {
  if (configured !== undefined) return MCP_RISK_MAP[configured]
  if (DANGEROUS_NAME.test(toolName)) return RISK_LEVEL.SYSTEM
  if (READONLY_NAME.test(toolName)) return RISK_LEVEL.READ_ONLY
  return RISK_LEVEL.DATA_WRITE
}

/** MCP 工具 id 前缀（`mcp.<server>.<tool>`），便于分组与风险映射识别 */
export const MCP_TOOL_PREFIX = 'mcp.'

export function mcpToolId(server: string, tool: string): string {
  return `${MCP_TOOL_PREFIX}${server}.${tool}`
}

/** 调 MCP 工具的函数（由 manager 注入，通常是 `(s,t,a) => client(s).callTool(t,a)`） */
export type McpCallTool = (server: string, tool: string, args: Record<string, unknown>) => Promise<McpCallResult>

/**
 * 把一个 MCP 工具转成技能。
 *
 * - `parametersSchema` 直接复用 MCP 的 `inputSchema`（已是 JSON Schema）；
 * - `execute` 调 `callTool`，把 MCP 的文本内容拼成 `message`；`isError` 映射为 `success`；
 * - 异常统一收敛成 `success:false`（不把异常抛给 Brain 循环）。
 */
export function mcpToolToSkill(tool: McpToolInfo, callTool: McpCallTool): SkillProtocol {
  return {
    id: mcpToolId(tool.server, tool.name),
    description: tool.description.trim() !== '' ? tool.description : `MCP 工具：${tool.server}/${tool.name}`,
    version: '0.1.0',
    parametersSchema: tool.inputSchema,
    tags: ['mcp', tool.server],
    async execute(params: Record<string, unknown>): Promise<SkillResult> {
      try {
        const result = await callTool(tool.server, tool.name, params)
        const text = (result.content ?? [])
          .filter((item) => item.type === 'text' && typeof item.text === 'string')
          .map((item) => item.text as string)
          .join('\n')
          .trim()
        const failed = result.isError === true
        return {
          success: !failed,
          message: text !== '' ? text : failed ? 'MCP 工具返回错误' : '（MCP 工具无文本输出）',
          data: result
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: `MCP 工具调用失败：${message}`, error: message }
      }
    }
  }
}
