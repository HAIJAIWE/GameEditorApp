/**
 * 管道行（pipeList）通用解析工具——收敛 ceshu 子系统里散落在 4 个文件、
 * 各自重写的 `row.split('|')` / `toRows` / `EPSILON`。
 *
 * pipeList 是本项目数值 / 账本 / 用例 / 验收旅程等表格字段的存储形态：一个数组，
 * 每个元素是 `列1|列2|列3` 这样的字符串。列位置的约定集中在此处，改一处列结构
 * 不必再同步多处（改造前这些拆分逻辑在 ceshuNumericAssert / ceshuEvidence /
 * ceshuDemoPrompt / ceshuValidation 里各写各的）。
 */

/** 浮点比较容差（数值复算、账本对账共用；防病态相等判定） */
export const EPSILON = 1e-9

/** 管道行数组 → 非空字符串数组（过滤非字符串与空串；其余形态返回空数组） */
export function toRows(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    : []
}

/** 单行按 `|` 拆分并 trim */
export function splitRow(row: string): string[] {
  return row.split('|').map((column) => column.trim())
}

/** 取管道行第 N 列（越界返回空串） */
export function column(row: string, index: number): string {
  return (row.split('|')[index] ?? '').trim()
}
