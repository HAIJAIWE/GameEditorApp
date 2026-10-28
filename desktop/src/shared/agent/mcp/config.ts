import type { McpConfig, McpServerConfig } from './types'

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
    const cfg = parseServer(value)
    if (cfg !== null) out[name] = cfg
  }
  return { mcpServers: out }
}

function parseServer(value: unknown): McpServerConfig | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as { command?: unknown; args?: unknown; env?: unknown }
  if (typeof v.command !== 'string' || v.command.trim() === '') return null

  const args = Array.isArray(v.args)
    ? v.args.filter((arg): arg is string => typeof arg === 'string')
    : undefined
  const env =
    v.env !== null && typeof v.env === 'object'
      ? (Object.fromEntries(
          Object.entries(v.env as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        ) as Record<string, string>)
      : undefined

  return {
    command: v.command,
    ...(args !== undefined ? { args } : {}),
    ...(env !== undefined ? { env } : {})
  }
}
