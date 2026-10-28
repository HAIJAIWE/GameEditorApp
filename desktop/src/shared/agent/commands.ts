/**
 * 数字员工输入框的「斜杠命令」纯逻辑（P2，对齐 dsh `ui-commands` / `ui-input-trigger`）。
 *
 * 只在输入以 `/` 开头时激活：`/xxx` 里的 `xxx` 作为查询词，过滤命令清单。
 * 匹配逻辑做成纯函数（组件只负责渲染与键盘导航），可在 Node 环境完整单测。
 */

export interface DigitalCommand {
  /** 命令 id（输入 `/id` 触发；也是稳定 key） */
  id: string
  /** 中文标签（菜单主文本） */
  label: string
  /** 一行说明 */
  hint: string
  /** 是否可用（如「停止」仅在运行中可用）；`false` 时菜单不显示该项 */
  enabled?: boolean
}

export interface ParsedCommands {
  /** 查询词；`null` 表示未激活（输入不以 `/` 开头） */
  query: string | null
  /** 过滤后的可用命令（顺序保持原样） */
  matches: DigitalCommand[]
}

/**
 * 从输入解析斜杠命令。
 * - 不以 `/` 开头 ⇒ `{ query: null, matches: [] }`（不激活）；
 * - `/` 或 `/a` ⇒ 按 `id` / `label` / `hint` 不区分大小写包含匹配（空查询返回全部可用项）。
 */
export function parseDigitalCommands(
  commands: readonly DigitalCommand[],
  rawInput: string
): ParsedCommands {
  if (!rawInput.startsWith('/')) return { query: null, matches: [] }
  const query = rawInput.slice(1).trim().toLowerCase()
  const matches = commands.filter((command) => {
    if (command.enabled === false) return false
    if (query === '') return true
    return (
      command.id.toLowerCase().includes(query) ||
      command.label.toLowerCase().includes(query) ||
      command.hint.toLowerCase().includes(query)
    )
  })
  return { query, matches }
}
