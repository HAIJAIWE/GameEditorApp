import type { McpConfig, McpRiskLevel, McpServerConfig } from './types'

const RISK_VALUES: readonly McpRiskLevel[] = ['read', 'write', 'filesystem', 'network', 'system']

/** 服务器名约束（对齐 dsh 的 `serverName` 正则 `[A-Za-z0-9_-]{1,32}`）：非法则跳过该服务器 */
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

function isMcpRiskLevel(value: unknown): value is McpRiskLevel {
  return typeof value === 'string' && (RISK_VALUES as readonly string[]).includes(value)
}

/**
 * 解析 MCP 配置（`{ mcpServers: { name: { command, args?, env? } } }`）。
 *
 * 容错优先：形状不对的服务器**跳过**而不是抛错——一份坏配置不该让整个 agent 起不来。
 * 返回的 `mcpServers` 只含合法项（`command` 非空字符串）。
 */
export function parseMcpConfig(raw: unknown): McpConfig {
  if (raw === null || typeof raw !== 'object') return { mcpServers: {} }
  const servers = (raw as { mcpServers?: unknown }).mcpServers
  if (servers === null || typeof servers !== 'object') return { mcpServers: {} }

  const out: Record<string, McpServerConfig> = {}
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    if (!SERVER_NAME_PATTERN.test(name)) continue // 服务器名非法：跳过（容错优先）
    const cfg = parseServer(value)
    if (cfg !== null) out[name] = cfg
  }
  // 顶层 maxTools（可选）：正整数才生效
  const maxToolsRaw = (raw as { maxTools?: unknown }).maxTools
  const maxTools =
    typeof maxToolsRaw === 'number' && Number.isFinite(maxToolsRaw) && maxToolsRaw > 0
      ? Math.floor(maxToolsRaw)
      : undefined
  return { mcpServers: out, ...(maxTools !== undefined ? { maxTools } : {}) }
}

function parseServer(value: unknown): McpServerConfig | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as {
    command?: unknown
    args?: unknown
    env?: unknown
    url?: unknown
    headers?: unknown
    risk?: unknown
  }

  // stdio（command）与 streamable-http（url）二选一，都没有则视为无效项
  const command = typeof v.command === 'string' && v.command.trim() !== '' ? v.command : undefined
  const url = typeof v.url === 'string' && v.url.trim() !== '' ? v.url : undefined
  if (command === undefined && url === undefined) return null

  const args = Array.isArray(v.args)
    ? v.args.filter((arg): arg is string => typeof arg === 'string')
    : undefined
  const env = toStringMap(v.env)
  const headers = toStringMap(v.headers)

  const risk = isMcpRiskLevel(v.risk) ? v.risk : undefined

  return {
    ...(command !== undefined ? { command } : {}),
    ...(args !== undefined ? { args } : {}),
    ...(env !== undefined ? { env } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(risk !== undefined ? { risk } : {})
  }
}

/** 把对象里的字符串值抽成 map（非对象 / 无合法项返回 undefined） */
function toStringMap(value: unknown): Record<string, string> | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}
