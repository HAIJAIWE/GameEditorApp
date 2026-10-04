import type { ItemRecord } from './types'

/**
 * 通用递归 JSON diff 引擎（迁移自 Python `src/common/data_diff.py`，
 * 唯一消费者是 `src/ui/dialogs/data_diff_dialog.py`）。
 *
 * **刻意偏离 Python 之处（修 bug，不照抄）**：
 * 1. Python 的对话框执行 `DataDiff.compare({}, {...})` —— 拿空 dict 与当前数据比，
 *    永远只输出「全部新增」。本引擎不做这种假对比，而是真正双侧比较。
 * 2. Python 的 `_compare_list` 对 list 元素**不递归**，只要下标位置相等就整块
 *    标成 MODIFIED（缺陷 C）。本引擎对数组元素中的对象/数组继续递归。
 * 3. Python 的 `compare_items_by_id` 新增/删除条目时只塞 `name` 一个标量
 *    （缺陷 D）。本引擎携带该条目的 `data` 全量。
 * 4. Python 有一个从不产出的 `UNCHANGED` 死枚举，不复刻——无变化即不产出条目。
 *
 * 已知局限：数组按**下标**对齐（与 Python 一致），插入/删除会连带后续元素错位。
 */

export type ItemDiffType = 'added' | 'removed' | 'modified'

export interface DiffEntry {
  /** 点分路径，如 `s1.data.value`；数组下标形如 `tags[0]` */
  path: string
  diffType: ItemDiffType
  oldValue?: unknown
  newValue?: unknown
  /** 嵌套改动挂这里（容器整体被改时使用） */
  children?: DiffEntry[]
}

export interface LibraryDiffGroup {
  type: string
  entries: DiffEntry[]
}

/** 拍平后的叶子改动（用于展示/计数） */
export interface DiffLeaf {
  path: string
  diffType: ItemDiffType
  oldValue?: unknown
  newValue?: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 比较两个「同层」值，产出「恰好一条」改动条目或 null（无变化）。
 * 容器（对象/数组）递归后若无子改动则返回 null，避免产出空壳。
 */
function diffValueAt(oldValue: unknown, newValue: unknown, path: string): DiffEntry | null {
  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    const children = diffValues(oldValue, newValue, path)
    return children.length > 0 ? { path, diffType: 'modified', children } : null
  }
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    const children = diffValues(oldValue, newValue, path)
    return children.length > 0 ? { path, diffType: 'modified', children } : null
  }
  // 标量，或两侧类型不同 → 直接判 modified（!== 语义）
  if (oldValue !== newValue) {
    return { path, diffType: 'modified', oldValue, newValue }
  }
  return null
}

function diffObjects(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  path: string
): DiffEntry[] {
  const entries: DiffEntry[] = []
  // key 并集 + 排序遍历，保证输出稳定（对齐 Python 的 sorted(all_keys)）
  const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)])).sort()

  for (const key of keys) {
    const childPath = path === '' ? key : `${path}.${key}`
    const inOld = Object.prototype.hasOwnProperty.call(oldObj, key)
    const inNew = Object.prototype.hasOwnProperty.call(newObj, key)
    if (!inOld) {
      entries.push({ path: childPath, diffType: 'added', newValue: newObj[key] })
    } else if (!inNew) {
      entries.push({ path: childPath, diffType: 'removed', oldValue: oldObj[key] })
    } else {
      const entry = diffValueAt(oldObj[key], newObj[key], childPath)
      if (entry !== null) entries.push(entry)
    }
  }
  return entries
}

function diffArrays(
  oldArr: readonly unknown[],
  newArr: readonly unknown[],
  path: string
): DiffEntry[] {
  const entries: DiffEntry[] = []
  const maxLen = Math.max(oldArr.length, newArr.length)

  for (let i = 0; i < maxLen; i++) {
    const itemPath = `${path}[${i}]`
    if (i >= oldArr.length) {
      entries.push({ path: itemPath, diffType: 'added', newValue: newArr[i] })
    } else if (i >= newArr.length) {
      entries.push({ path: itemPath, diffType: 'removed', oldValue: oldArr[i] })
    } else {
      // 关键修复（缺陷 C）：继续递归，嵌套数组/对象不再被整块标 MODIFIED
      const entry = diffValueAt(oldArr[i], newArr[i], itemPath)
      if (entry !== null) entries.push(entry)
    }
  }
  return entries
}

/**
 * 任意两个 JSON 值的递归 diff；只返回「有变化」的条目（无变化 → 空数组）。
 * 两值严格相等（含结构相同的容器）→ 不产出条目。
 */
export function diffValues(oldValue: unknown, newValue: unknown, path = ''): DiffEntry[] {
  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    return diffObjects(oldValue, newValue, path)
  }
  if (Array.isArray(oldValue) && Array.isArray(newValue)) {
    return diffArrays(oldValue, newValue, path)
  }
  const entry = diffValueAt(oldValue, newValue, path || '<root>')
  return entry === null ? [] : [entry]
}

/**
 * 两组条目按 `id` 对齐 diff。对存在的条目只比较 `{ type, data }`，
 * **排除 `createdAt`/`updatedAt`**（这两个每次保存都变，否则全条目恒判「已改」）。
 */
export function diffItems(
  oldItems: readonly ItemRecord[],
  newItems: readonly ItemRecord[]
): DiffEntry[] {
  const oldMap = new Map<string, ItemRecord>()
  const newMap = new Map<string, ItemRecord>()
  for (const item of oldItems) oldMap.set(item.id, item)
  for (const item of newItems) newMap.set(item.id, item)

  const entries: DiffEntry[] = []

  // 1) 双侧都有的 id：递归比较 { type, data }，路径前缀用 id
  const commonIds = Array.from(oldMap.keys())
    .filter((id) => newMap.has(id))
    .sort()
  for (const id of commonIds) {
    const before = oldMap.get(id)
    const after = newMap.get(id)
    if (before === undefined || after === undefined) continue
    const beforeShape = { type: before.type, data: before.data }
    const afterShape = { type: after.type, data: after.data }
    entries.push(...diffValues(beforeShape, afterShape, id))
  }

  // 2) 仅新侧：added，携带 data 全量（修复缺陷 D：不再只带 name）
  const addedIds = Array.from(newMap.keys())
    .filter((id) => !oldMap.has(id))
    .sort()
  for (const id of addedIds) {
    const item = newMap.get(id)
    if (item !== undefined) {
      entries.push({ path: id, diffType: 'added', newValue: item.data })
    }
  }

  // 3) 仅旧侧：removed，携带 data 全量
  const removedIds = Array.from(oldMap.keys())
    .filter((id) => !newMap.has(id))
    .sort()
  for (const id of removedIds) {
    const item = oldMap.get(id)
    if (item !== undefined) {
      entries.push({ path: id, diffType: 'removed', oldValue: item.data })
    }
  }

  return entries
}

/**
 * 整库 diff：按**单数** `item.type`（如 `role`/`skill`）分组，只保留有变化的类型组，
 * 按 type 升序返回。
 */
export function diffLibraries(
  oldItems: readonly ItemRecord[],
  newItems: readonly ItemRecord[]
): LibraryDiffGroup[] {
  const types = new Set<string>()
  for (const item of oldItems) types.add(item.type)
  for (const item of newItems) types.add(item.type)

  const groups: LibraryDiffGroup[] = []
  for (const type of Array.from(types).sort()) {
    const before = oldItems.filter((item) => item.type === type)
    const after = newItems.filter((item) => item.type === type)
    const entries = diffItems(before, after)
    if (entries.length > 0) groups.push({ type, entries })
  }
  return groups
}

/** 把 diff 树拍平成叶子改动列表（带 children 的容器条目自身不算叶子）。 */
export function collectLeaves(entries: readonly DiffEntry[]): DiffLeaf[] {
  const leaves: DiffLeaf[] = []
  const walk = (list: readonly DiffEntry[]): void => {
    for (const entry of list) {
      if (entry.children !== undefined && entry.children.length > 0) {
        walk(entry.children)
      } else {
        leaves.push({
          path: entry.path,
          diffType: entry.diffType,
          oldValue: entry.oldValue,
          newValue: entry.newValue
        })
      }
    }
  }
  walk(entries)
  return leaves
}

/** 统计叶子改动的 added/removed/modified 数量。 */
export function summarizeDiff(entries: readonly DiffEntry[]): {
  added: number
  removed: number
  modified: number
} {
  let added = 0
  let removed = 0
  let modified = 0
  for (const leaf of collectLeaves(entries)) {
    if (leaf.diffType === 'added') added++
    else if (leaf.diffType === 'removed') removed++
    else modified++
  }
  return { added, removed, modified }
}
