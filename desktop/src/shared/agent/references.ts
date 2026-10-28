/**
 * 数字员工输入框的「@ 引用」纯逻辑（P2，对齐 dsh `ui-input-trigger` 的引用触发）。
 *
 * 设计：`@` 开头且**引用 token 尚未以空格结束**时激活——即 `@角色` 在选词，`@角色 `（带空格）
 * 表示已选定、正在写正文。这样「选中后插入 `@角色 `」不会让菜单再次弹出，无需额外的锁定状态。
 *
 * 只支持**一个前置引用**（`@角色 帮我补全`）：多引用需要光标级解析，收益不值当，故不做。
 */

export interface DigitalReference {
  /** 稳定 id（数据类型 id，如 `character`） */
  id: string
  /** 展示名（中文名，如 `角色`） */
  name: string
}

export interface ParsedReferences {
  /** 查询词；`null` 表示未激活 */
  query: string | null
  /** 匹配到的引用项（顺序保持原样） */
  matches: DigitalReference[]
}

/**
 * 从输入解析 `@` 引用。
 * - 不以 `@` 开头 ⇒ 未激活；
 * - token 内已出现空格 ⇒ 已选定（不再弹菜单）；
 * - 否则按 `name` / `id` 不区分大小写包含匹配（空查询返回全部）。
 */
export function parseDigitalReferences(
  references: readonly DigitalReference[],
  rawInput: string
): ParsedReferences {
  if (!rawInput.startsWith('@')) return { query: null, matches: [] }
  const rest = rawInput.slice(1)
  // 引用 token 已以空格结束：用户已选定、正在写正文
  if (rest.includes(' ')) return { query: null, matches: [] }
  const query = rest.trim().toLowerCase()
  const matches = references.filter((reference) => {
    if (query === '') return true
    return (
      reference.name.toLowerCase().includes(query) || reference.id.toLowerCase().includes(query)
    )
  })
  return { query, matches }
}
