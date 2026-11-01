import { RISK_LEVEL, type RiskLevel, type SkillProtocol, type SkillResult } from '../config'
import type {
  McpCallResult,
  McpContentBlock,
  McpRequestOptions,
  McpResourceReadResult,
  McpRiskLevel,
  McpToolInfo
} from './types'
import { MCP_ALLOWED_IMAGE_MIME } from './types'

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

/** 工具名单个字符上限（对齐 dsh 的 64-char cap） */
const TOOL_NAME_MAX = 64

/**
 * 非加密确定性哈希（仅用于截断/规范化后去重，避免工具名碰撞）。
 * dsh 用 SHA-256；我们取同步 64 位 FNV-1a 凑 12 位十六进制，以兼容主/渲染进程且无需异步。
 */
function shortHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  const a = h >>> 0
  let h2 = 0x1000193 ^ input.length
  for (let i = input.length - 1; i >= 0; i--) {
    h2 ^= input.charCodeAt(i)
    h2 = Math.imul(h2, 0x01000193)
  }
  const b = h2 >>> 0
  const combined = (BigInt(a) << 32n) | BigInt(b)
  return combined.toString(16).padStart(16, '0').slice(0, 12)
}

/**
 * 规范化 MCP 工具名（对齐 dsh tools.ts 的命名归一）：
 * - 非 `[A-Za-z0-9_-]` 统一替换为 `_`；
 * - 超过 64 字符截断；
 * - 若规范化 / 截断**改变了原名**，追加 `_<12位短哈希>` 后缀保证唯一（防碰撞）。
 * 仅影响工具 id 展示与路由键；实际 `callTool` 仍用服务器原始名，故不影响调用正确性。
 */
export function normalizeMcpToolName(raw: string): string {
  const sanitized = raw.replace(/[^A-Za-z0-9_-]/g, '_')
  if (sanitized === raw && sanitized.length <= TOOL_NAME_MAX) return sanitized
  const base = sanitized.slice(0, TOOL_NAME_MAX)
  return `${base}_${shortHash(raw)}`
}

export function mcpToolId(server: string, tool: string): string {
  return `${MCP_TOOL_PREFIX}${server}.${normalizeMcpToolName(tool)}`
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
        // 图像准入（对齐 dsh tools.ts）：image 块转 data URL，回灌 vision 链路
        const images = (result.content ?? [])
          .filter(
            (item): item is McpContentBlock =>
              item.type === 'image' && typeof item.data === 'string' && item.data.trim() !== '' && typeof item.mimeType === 'string'
          )
          .map((item) => `data:${item.mimeType};base64,${item.data}`)
        const failed = result.isError === true
        return {
          success: !failed,
          message: text !== '' ? text : failed ? 'MCP 工具返回错误' : '（MCP 工具无文本输出）',
          data: result,
          ...(images.length > 0 ? { images } : {})
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: `MCP 工具调用失败：${message}`, error: message }
      }
    }
  }
}

/** 资源操作类型（对应 dsh 的三个资源工具） */
export type McpResourceOp = 'list' | 'templates' | 'read'

/** 单个资源操作的调用入口：`call(op, params)` 返回协议原始结果；由 manager 注入 client 方法 */
export type McpResourceCall = (
  op: McpResourceOp,
  params: { cursor?: string; uri?: string },
  options?: McpRequestOptions
) => Promise<unknown>

/**
 * 为某台服务器生成三个资源技能（对齐 dsh mcp-resources 的 `list_mcp_resources` /
 * `list_mcp_resource_templates` / `read_mcp_resource`）。仅在该服务器声明 resources 能力时注册。
 *
 * - 列表类：返回 JSON 文本（dsh 用 `resource-list` 渲染，二进制不进模型历史）；
 * - 读取类：文本块直接拼接；二进制 `blob` 仅保留描述（不进模型历史），但若为图像则走 vision 链路（data URL）。
 */
export function mcpResourceSkills(server: string, call: McpResourceCall): SkillProtocol[] {
  const idPrefix = `${MCP_TOOL_PREFIX}${server}.`
  const listSkill = (op: 'list' | 'templates'): SkillProtocol => {
    const isTemplates = op === 'templates'
    return {
      id: isTemplates ? `${idPrefix}list_resource_templates` : `${idPrefix}list_resources`,
      description: isTemplates
        ? `列出 MCP 服务器 ${server} 的资源 URI 模板（参数化资源）。`
        : `列出 MCP 服务器 ${server} 提供的资源（文档/数据/上下文），返回 {uri,name,...} 列表。`,
      version: '0.1.0',
      parametersSchema: {
        type: 'object',
        properties: { cursor: { type: 'string', description: '分页游标（取上一次结果的 nextCursor）' } },
        required: []
      },
      tags: ['mcp', server, 'resource'],
      async execute(params: Record<string, unknown>): Promise<SkillResult> {
        try {
          const cursor = typeof params.cursor === 'string' ? params.cursor : undefined
          const result = (await call(op, { cursor })) as unknown
          return { success: true, message: `MCP server: ${server}\n${JSON.stringify(result, null, 2)}`, data: result }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { success: false, message: `MCP 资源列举失败：${message}`, error: message }
        }
      }
    }
  }
  const readSkill: SkillProtocol = {
    id: `${idPrefix}read_resource`,
    description: `从 MCP 服务器 ${server} 读取指定 URI 的资源内容（文本或二进制）。`,
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: { uri: { type: 'string', description: '资源 URI' } },
      required: ['uri']
    },
    tags: ['mcp', server, 'resource'],
    async execute(params: Record<string, unknown>): Promise<SkillResult> {
      const uri = typeof params.uri === 'string' ? params.uri : ''
      try {
        const result = (await call('read', { uri })) as McpResourceReadResult
        const parts: string[] = []
        const images: string[] = []
        for (const content of result.contents) {
          if (typeof content.text === 'string') {
            parts.push(`[${content.uri}] ${content.text}`)
          } else if (typeof content.blob === 'string') {
            // 二进制：不把 base64 灌进模型历史，仅保留描述（对齐 dsh renderResourceResult）
            parts.push(`[${content.uri}] 二进制资源（${content.mimeType ?? 'unknown'}，base64 ${content.blob.length} 字符）`)
            if (content.mimeType !== undefined && MCP_ALLOWED_IMAGE_MIME.has(content.mimeType)) {
              images.push(`data:${content.mimeType};base64,${content.blob}`)
            }
          } else {
            parts.push(`[${content.uri}] 空资源`)
          }
        }
        return {
          success: true,
          message: parts.join('\n'),
          data: result,
          ...(images.length > 0 ? { images } : {})
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: `MCP 资源读取失败：${message}`, error: message }
      }
    }
  }
  return [listSkill('list'), listSkill('templates'), readSkill]
}
