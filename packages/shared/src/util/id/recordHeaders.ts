/** 条目业务主键列名（`data.id` 里的短 id，不是记录 uuid） */
export const RECORD_ID_KEY = 'id'

/**
 * 把 `id` 提到表头首列（CSV / Excel 导出共用）。
 *
 * ## 为什么必须这么做
 * 导出表头是按 `data` 的键序生成的，而条目创建时 `data.id` 是**最后**写进去的
 * （`DataService.createItem` 先 `{...input.data}`，再 `data.id = nextItemId(...)`）
 * ⇒ id 列会落在最右边。可它恰恰是「导出 → 改 → 导入」的往返主键：
 *
 * - 放最后一列，数值策划滚动表格时根本看不到，很容易整列删掉；
 * - 一旦没有 id 列，导入会把每一行当新条目 ⇒ **全表翻倍**（实测 2 条变 4 条）。
 *
 * 所以导出时固定放首列，与 `excelIO.test` 里期望的 `['id', 'name', ...]` 形状一致。
 * 原顺序里没有 `id` 时不凭空造一个（那是「这张表本来就不带主键」的合法情况）。
 */
export function orderHeadersWithId(headers: readonly string[]): string[] {
  if (!headers.includes(RECORD_ID_KEY)) return [...headers]
  return [RECORD_ID_KEY, ...headers.filter((header) => header !== RECORD_ID_KEY)]
}
