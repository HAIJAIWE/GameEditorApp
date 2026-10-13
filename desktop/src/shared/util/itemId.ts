/**
 * 条目短 id（业务 id）工具 —— 对齐 PyQt `core/data_manager.py::generate_id` 语义。
 *
 * 背景：TS 迁移期曾把 `data.id` 强制对齐成记录 id（randomUUID 36 位），导致列表/表单
 * 显示 `ID:1a2b3c4d` 这类片段，与 PyQt 参考（`ID:0 | 火球术 | 攻击`）严重不符
 * （用户 2026-10-13 反馈「Id不对」，其真实库 40 条全部只有 uuid、data.id 缺失）。
 * 现恢复 PyQt 语义：
 * - `data.id` = 每类型独立的短序号业务 id（0 起步，max+1 递增），**与记录 id 解耦**；
 * - 记录 id（uuid）降级为内部键（引用/撤销/IPC 用），不再外显为 ID；
 * - 存量数据由存储层迁移一次性回填（见 `sqliteRepo.ts` user_version 2）。
 */

/** UUID 形态判定（回填时只修这种与空值，不动用户自设的非数值 id） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 条目数据里 id 的读取面（record.data.id） */
export interface HasItemData {
  data: Record<string, unknown>
}

/** data.id 为 UUID 形态（迁移期强制对齐的产物）——需要回填的标记 */
export function isUuidLikeId(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** data.id 是否缺失/为空 —— 新建种子化与回填的共同判定 */
export function isMissingId(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * 该条目的 data.id 是否需要回填短序号：缺失/空，或是 UUID 形态。
 * 非数值的非 UUID 值（如导入数据自带的 "boss-01"）**保留不动**——那是用户数据，
 * 不是迁移产物；PyQt generate_id 对非数值 id 同样跳过（ValueError → continue）。
 */
export function needsShortId(item: HasItemData): boolean {
  const value = item.data['id']
  return isMissingId(value) || isUuidLikeId(value)
}

/**
 * 列表/表单展示 id：data.id 优先，缺失回退记录 id。
 * 迁移与新建种子化保证正常路径下 data.id 必有值；回退分支只防极端脏数据。
 */
export function displayItemId(record: { id: string; data: Record<string, unknown> }): string {
  const value = record.data['id']
  if (isMissingId(value)) return record.id
  return String(value)
}

/**
 * 生成下一个短序号（PyQt `generate_id`）：取该类型现有**数值** id 的最大值 + 1，
 * 无数值 id 时从 0 开始。非数值 id 跳过不参与 max（与 Python 的 try/int 一致）。
 */
export function nextItemId(items: readonly HasItemData[]): string {
  let max = -1
  for (const item of items) {
    const value = item.data['id']
    if (typeof value !== 'string' && typeof value !== 'number') continue
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(numeric) || numeric < 0) continue
    if (numeric > max) max = numeric
  }
  return String(max + 1)
}

/**
 * 回填规划（纯函数）：按传入次序（调用方保证 = created_at 升序）为需要回填的条目
 * 分配短序号，返回 `记录 id → 新 data.id` 映射。幂等：全量有合法 id 时返回空映射。
 *
 * 起始值取该类型现有数值 id 的 max+1（含**其他**条目的数值 id），
 * 保证回填号不与存量短 id 撞号（PyQt 计数器同规则）。
 */
export function planShortIdBackfill<T extends HasItemData & { id: string }>(
  items: readonly T[]
): Map<string, string> {
  const assignments = new Map<string, string>()
  let next = Number(nextItemId(items))
  for (const item of items) {
    if (!needsShortId(item)) continue
    assignments.set(item.id, String(next))
    next += 1
  }
  return assignments
}
