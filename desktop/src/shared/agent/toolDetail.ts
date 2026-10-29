/**
 * 工具步骤详情区的**纯逻辑**（参数格式化 / unified diff 行切分）。
 *
 * 为什么单独一层：`ToolStepCard` 只该负责渲染，而「能不能美化」「是不是 diff」
 * 这类判据必须能在 Node 下直接单测——组件测试要拖 jsdom，逻辑改动却与 DOM 无关。
 * 设计取向抄 dsh `ui-tool` 的 ToolDetails（参数 / 输出分段）+ FileDiff（行级配色），
 * 但只借结构与判据，不引其依赖。
 */

/** diff 的一行；`hunk` 兼收 `@@` 与 `+++` / `---` 文件头（后者不是增删行） */
export interface DiffRow {
  kind: 'add' | 'del' | 'ctx' | 'hunk'
  text: string
}

/** 参数文本上限：右栏是窄列，整段参数塞进去只会把卡片撑成滚动条 */
export const TOOL_ARGS_LIMIT = 4000

/** diff 行上限：超大补丁不能把面板渲染拖死 */
export const DIFF_ROW_LIMIT = 2000

const TRUNCATED = '\n…（已截断）'

/** 超长就截断并标注；标注本身不计入上限，便于用「长度 == 上限」直接断言 */
function clip(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}${TRUNCATED}` : text
}

/**
 * 把工具调用的原始参数文本整理成可展示的形态。
 *
 * - 空 / 纯空白 → 空文本（调用方据此决定不渲染参数段）；
 * - 能 `JSON.parse` → 两空格缩进美化，并标记 `isJson`（样式可据此选等宽/高亮）；
 * - 解析失败 → 原样返回（有些工具参数本来就是纯文本命令，不该被吃掉）。
 * @param raw - 事件里带过来的原始参数文本。
 * @returns 展示文本与是否为合法 JSON。
 */
export function formatToolArgs(raw?: string): { text: string; isJson: boolean } {
  if (raw === undefined || raw.trim() === '') return { text: '', isJson: false }
  try {
    return { text: clip(JSON.stringify(JSON.parse(raw), null, 2), TOOL_ARGS_LIMIT), isJson: true }
  } catch {
    return { text: clip(raw, TOOL_ARGS_LIMIT), isJson: false }
  }
}

/**
 * 把工具输出按 unified diff 切成行；不像 diff 就返回 `null`（调用方回退普通视图）。
 *
 * 判据刻意保守：只有出现 `@@` hunk 头，**或**同时有 `+++` / `---` 文件头与增删行时才算 diff。
 * 单看「有没有以 + / - 开头的行」不够——普通文本输出里的列表项、分隔线会被误染成增删行。
 * @param text - 工具输出原文。
 * @returns 行数组，或 `null` 表示这不是 diff。
 */
export function diffRows(text?: string): DiffRow[] | null {
  if (text === undefined || text === '') return null
  const lines = text.split(/\r?\n/)
  const hasHunk = lines.some((line) => line.startsWith('@@'))
  const hasFileHeader = lines.some((line) => line.startsWith('+++ ') || line.startsWith('--- '))
  const hasChange = lines.some((line) => line.startsWith('+') || line.startsWith('-'))
  if (!hasHunk && !(hasFileHeader && hasChange)) return null

  const rows: DiffRow[] = []
  for (const line of lines) {
    if (rows.length >= DIFF_ROW_LIMIT) {
      rows.push({ kind: 'hunk', text: '…（已截断）' })
      break
    }
    rows.push({ kind: diffRowKind(line), text: line })
  }
  return rows
}

/** diff 增删行数（行头那对 `+N −M` 的唯一来源） */
export interface DiffTotals {
  added: number
  removed: number
}

/**
 * 统计 diff 的增删行数。
 *
 * 与 `diffRows` 同源：只数 `add` / `del`，`+++` / `---` 文件头已被归类成 `hunk`，不会误计。
 * 截断标记也是 `hunk`，所以超大补丁的总数是「已渲染部分」的真实值，不虚报。
 */
export function diffTotals(rows: readonly DiffRow[]): DiffTotals {
  let added = 0
  let removed = 0
  for (const row of rows) {
    if (row.kind === 'add') added += 1
    else if (row.kind === 'del') removed += 1
  }
  return { added, removed }
}

/**
 * 单行归类。`+++` / `---` 必须先于 `+` / `-` 判断：它们是文件头，
 * 按增删行染绿染红会让「整个文件都变了」的错觉盖住真实改动。
 */
function diffRowKind(line: string): DiffRow['kind'] {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+++') || line.startsWith('---')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}
