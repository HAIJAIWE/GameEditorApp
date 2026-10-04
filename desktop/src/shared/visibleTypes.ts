/**
 * 侧栏「显示哪些数据类型」偏好 —— 迁移自 Python
 * `ui/dialogs/type_visibility_dialog.py`（选择对话框）+ `settings.py` 的 `visible_types` 落盘。
 *
 * 语义（与 Python 对齐）：
 * - `null` = 全部显示（默认；键不存在即此意）
 * - `[]`   = 全不显示（显式空列表）
 * - 数组   = 仅这些 id 显示
 *
 * **刻意修复 Python 的 bug**：`settings.py` 加载时写的是
 * `if isinstance(vt, list) and vt:` —— 空列表 `[]` 是 falsy，
 * 导致「全不选」在重启后被当成「未设置」而失效。
 * 本模块用「键是否存在」而非「值是否 truthy」区分，`[]` 会被完整保留。
 */

export const VISIBLE_TYPES_STORAGE_KEY = 'mb.visibleTypes'

/**
 * `StorageLike` 的**唯一真源**是 `settingsStore.ts`（统一设置基座）；
 * 此处 re-export 以保持既有 import 不破。
 */
export type { StorageLike } from './settingsStore'
import type { StorageLike } from './settingsStore'

/** null=全部可见；否则只有集合内可见 */
export function isTypeVisible(id: string, visible: readonly string[] | null): boolean {
  if (visible === null) return true
  return visible.includes(id)
}

/** 取默认 storage（浏览器 localStorage）；Node / 主进程下可能不存在 → null */
function defaultStorage(): StorageLike | null {
  const holder = globalThis as unknown as { localStorage?: StorageLike }
  return holder.localStorage ?? null
}

/** 把任意 JSON 值规范化为偏好值：
 * 非数组→null；过滤掉 allIds 之外的 id 并按其顺序去重；
 * 全选→null；空→[]
 */
export function normalizeVisibleTypes(value: unknown, allIds: readonly string[]): string[] | null {
  if (!Array.isArray(value)) return null
  const allowed = new Set(allIds)
  const picked = new Set<string>()
  for (const item of value) {
    if (typeof item === 'string' && allowed.has(item)) picked.add(item)
  }
  if (picked.size === 0) return []
  const result = allIds.filter((id) => picked.has(id))
  if (result.length === allIds.length) return null
  return result
}

/** 面板确认用：checked 过滤到 allIds（按 allIds 顺序、去重）；全选→null；0 个→[]；否则列表 */
export function resolveVisibilityResult(
  checkedIds: readonly string[],
  allIds: readonly string[]
): string[] | null {
  const allowed = new Set(allIds)
  const picked = new Set<string>()
  for (const id of checkedIds) {
    if (allowed.has(id)) picked.add(id)
  }
  if (picked.size === 0) return []
  const result = allIds.filter((id) => picked.has(id))
  if (result.length === allIds.length) return null
  return result
}

/** 读 localStorage；缺失/坏 JSON/非字符串数组→null（不抛） */
export function loadVisibleTypes(storage?: StorageLike): string[] | null {
  const store = storage ?? defaultStorage()
  if (store === null) return null
  const raw = store.getItem(VISIBLE_TYPES_STORAGE_KEY)
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  for (const item of parsed) {
    if (typeof item !== 'string') return null
  }
  return parsed as string[]
}

/** 写 localStorage；null 时 removeItem（=恢复默认全部显示）；[] 时写入 '[]' */
export function saveVisibleTypes(value: readonly string[] | null, storage?: StorageLike): void {
  const store = storage ?? defaultStorage()
  if (store === null) return
  if (value === null) {
    store.removeItem(VISIBLE_TYPES_STORAGE_KEY)
    return
  }
  store.setItem(VISIBLE_TYPES_STORAGE_KEY, JSON.stringify(value))
}
