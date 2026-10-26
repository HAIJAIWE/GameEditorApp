import { CHAPTER_KEYS, type CeshuChapters } from '../../ceshuConstants'
import type { DataTypeDef, ItemRecord } from '../../types'

/**
 * 数据引用引擎（对齐 旧版 `src/common/data_ref`）。
 *
 * 引用语法：`@data[type_key.field]` 或 `@data[type_key.item_id.field]`
 * 例：`角色基础攻击力为 @data[role.atk]`，`@data[skill.fireball.damage]`
 *
 * ## 🔧 一处刻意修正 旧版 的真 bug（不是照抄）
 *
 * 旧版 `data_ref:89` 是 `items = raw.get(type_key, [])`，而 `type_key` 来自
 * 引用文本里的**单数**片段（`@data[role.atk]` ⇒ `role`）；但 `core/data_manager:56-59`
 * 的 `self.data` 是按 **`schema.plural_keys`（复数 `roles`/`monsters`）**建的。
 * ⇒ **两边对不上，`@data[role.atk]` 在 旧版 里永远解析不到值**，
 * `preview_panel` 只会显示「(未找到)」。这是真 bug，不是设计。
 *
 * 本实现**修正**为：先按单数 `id` 找类型（用 TS 侧 `items.type` 的真实口径），
 * 找不到再按 `pluralKey` 找（兼容复数写法 `@data[roles.atk]`）。
 * `resolveRefValue` 因此在 TS 侧是**能真解析出值**的，优于 旧版。
 *
 * ## 键口径（易错，与 `dataStats.ts` / `attributeChart.ts` 同一约定）
 * - `items.type` 存**单数** `DataTypeDef.id`（`role`）
 * - `pluralKey` 是**复数**（`roles`）
 * - 条目业务字段在 **`item.data`** 下（不是顶层）
 */

/** 一个数据引用的完整信息（对齐 旧版 `DataRef` NamedTuple） */
export interface DataRef {
  /** 原始文本，如 `@data[role.atk]` */
  raw: string
  /** 数据类型键（单数 `id`，如 `role`） */
  typeKey: string
  /** 条目 id；`''` 表示「取该类型第一条」（对齐 旧版） */
  itemId: string
  /** 字段名，如 `atk` */
  field: string
  /** 完整路径，如 `role.atk` 或 `role.hero_01.atk` */
  fullPath: string
}

/**
 * 引用正则（逐字对齐 旧版 `REF_PATTERN`）：
 * `@data[` + 标识符 + **至少一个** `.标识符` + `]`。
 * 注意末尾的 `+` —— 意味着 `@data[role]`（单段）**不匹配**（旧版 同）。
 */
const REF_PATTERN = /@data\[([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)+)\]/g

/**
 * 从一段文本里解析所有数据引用（对齐 `parse_data_refs`）。
 *
 * 只支持 2 段（`type.field`）与 3 段（`type.item.field`）；
 * 4 段及以上**跳过**（对齐 旧版 `else: continue`）。
 */
export function parseDataRefs(text: string): DataRef[] {
  const refs: DataRef[] = []
  // 用新正则实例，避免 lastIndex 在多次调用间串味（全局正则的经典坑）
  const re = new RegExp(REF_PATTERN.source, 'g')
  let match = re.exec(text)
  while (match !== null) {
    const fullPath = match[1] ?? ''
    const parts = fullPath.split('.')
    if (parts.length === 2) {
      const [typeKey, field] = parts as [string, string]
      refs.push({ raw: match[0], typeKey, itemId: '', field, fullPath })
    } else if (parts.length === 3) {
      const [typeKey, itemId, field] = parts as [string, string, string]
      refs.push({ raw: match[0], typeKey, itemId, field, fullPath })
    }
    // 4 段及以上：跳过（对齐 旧版）
    match = re.exec(text)
  }
  return refs
}

/**
 * 类型键归一：单数 id 优先，其次复数 pluralKey（修正 旧版 的单复数不匹配）。
 *
 * ## 为什么对 `id` / `pluralKey` 都做空值保护
 * `DataTypeDef` 声明上两者都是必填，但**运行时数据不一定完整**：
 * 真实 IPC 返回、以及用户手改过的 schema 里都可能出现缺 `pluralKey` 的类型
 * （本次浏览器实测就撞到：桩里 `{ id: 'skill', … }` 无 `pluralKey` ⇒
 * `t.pluralKey.toLowerCase()` 抛 `Cannot read properties of undefined`，
 * **整个面板白屏**）。
 * 一个「查类型的辅助函数」不该因为一条脏数据把整个界面搞崩 ⇒ 全部容错。
 */
function resolveTypeKey(typeKey: string, types: readonly DataTypeDef[]): DataTypeDef | null {
  const lower = typeKey.toLowerCase()
  const norm = (v: unknown): string => (typeof v === 'string' ? v.toLowerCase() : '')
  const byId = types.find((t) => norm(t.id) === lower)
  if (byId !== undefined) return byId
  return types.find((t) => norm(t.pluralKey) === lower) ?? null
}

/**
 * 从条目列表里解析一个引用的实际值（对齐 `resolve_value`，但修掉了单复数 bug）。
 *
 * @param items 全部条目（`ItemRecord` 形状，业务字段在 `.data` 下）
 * @param types 已注册类型（用于单数/复数归一）
 */
export function resolveRefValue(
  items: readonly ItemRecord[],
  types: readonly DataTypeDef[],
  ref: DataRef,
  /**
   * 可选：按 `item.type` 预建的分桶索引。
   * `buildRefOverview` 逐条解析整本策划书时传入，把「每个引用都全表扫描」降为 O(items + refs)；
   * 单次调用不传即退回线性过滤（语义完全一致）。
   */
  rowsByType?: ReadonlyMap<string, readonly ItemRecord[]>
): unknown {
  const def = resolveTypeKey(ref.typeKey, types)
  // 归一后的真实单数 id —— 条目 `type` 字段存的就是它
  const target = def === null ? ref.typeKey : def.id
  const rows = rowsByType !== undefined ? (rowsByType.get(target) ?? []) : items.filter((item) => item.type === target)
  if (rows.length === 0) return null

  // itemId 为空 ⇒ 取第一条（对齐 旧版 `items[0]`）
  const row = ref.itemId === '' ? rows[0] : rows.find((r) => r.id === ref.itemId)
  if (row === undefined) return null

  // 业务字段在 .data 下
  const bag = row.data as Record<string, unknown>
  const value = bag[ref.field]
  return value === undefined ? null : value
}

/** 一条引用 + 其解析结果（用于概览展示） */
export interface ResolvedRef extends DataRef {
  /** 解析到的值；`null` = 未找到（对齐 旧版 的 `Optional[Any]`） */
  value: unknown
  /** 该值是否存在（区分「值为 null/空」与「没找到」） */
  found: boolean
}

/** 未找到时展示的占位（对齐 旧版 `✗ ... (未找到)`） */
export const REF_NOT_FOUND_TEXT = '未找到'

/** 值的展示上限（对齐 旧版 `str(value)[:60]`） */
const VALUE_DISPLAY_MAX = 60

/** 把任意值转成展示文本（对齐 旧版 `str(value)[:60]`，null ⇒ ''） */
export function formatRefValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : String(value)
  return text.length > VALUE_DISPLAY_MAX ? `${text.slice(0, VALUE_DISPLAY_MAX)}…` : text
}

/**
 * 从整本策划书里提取所有引用（对齐 `extract_all_refs`）。
 *
 * 遍历 `CHAPTER_KEYS` 每章的字段值：字符串直接解析、嵌套字典**只下探一层**、
 * 列表**只取字符串元素**（逐条对齐 旧版 的三层 else-if，不递归）。
 * 按 `fullPath` **去重**（保持首次出现顺序）。
 */
export function extractAllRefs(chapters: CeshuChapters | null): DataRef[] {
  if (chapters === null) return []
  const seen = new Set<string>()
  const all: DataRef[] = []

  const push = (text: string): void => {
    for (const ref of parseDataRefs(text)) {
      if (seen.has(ref.fullPath)) continue
      seen.add(ref.fullPath)
      all.push(ref)
    }
  }

  for (const key of CHAPTER_KEYS) {
    const chapter = chapters[key]
    if (chapter === null || chapter === undefined || typeof chapter !== 'object' || Array.isArray(chapter)) continue
    for (const fieldValue of Object.values(chapter as Record<string, unknown>)) {
      if (typeof fieldValue === 'string') {
        push(fieldValue)
      } else if (fieldValue !== null && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
        for (const nested of Object.values(fieldValue as Record<string, unknown>)) {
          if (typeof nested === 'string') push(nested)
        }
      } else if (Array.isArray(fieldValue)) {
        for (const item of fieldValue) {
          if (typeof item === 'string') push(item)
        }
      }
    }
  }
  return all
}

/** 按 typeKey 分组的引用（对齐 旧版 的 `defaultdict` 分组，P7 便于阅读） */
export interface RefGroup {
  typeKey: string
  refs: ResolvedRef[]
}

export interface RefOverview {
  groups: RefGroup[]
  /** 引用总数 */
  total: number
  /** 能解析出值 的个数（对齐 旧版 `has_value`） */
  resolved: number
}

/** 解析全本策划书的引用并按类型分组（对齐 `_refresh_refs` 的核心逻辑） */
export function buildRefOverview(
  chapters: CeshuChapters | null,
  items: readonly ItemRecord[],
  types: readonly DataTypeDef[]
): RefOverview {
  const refs = extractAllRefs(chapters)
  const map = new Map<string, ResolvedRef[]>()
  let resolved = 0

  // 一次分桶：原先每个引用都要 `items.filter(...)` 全表扫描，整本策划书解析是 O(refs × items)。
  // 这里按 type 建一次索引（O(items)），总量降为 O(items + refs)，refs/条目多时差距显著。
  const rowsByType = new Map<string, ItemRecord[]>()
  for (const item of items) {
    const bucket = rowsByType.get(item.type)
    if (bucket === undefined) {
      rowsByType.set(item.type, [item])
    } else {
      bucket.push(item)
    }
  }

  for (const ref of refs) {
    const value = resolveRefValue(items, types, ref, rowsByType)
    // 旧版 是 `if value is not None` ⇒ null/undefined 都算「未找到」
    const found = value !== null && value !== undefined
    if (found) resolved += 1
    const bucket = map.get(ref.typeKey)
    const entry: ResolvedRef = { ...ref, value, found }
    if (bucket === undefined) map.set(ref.typeKey, [entry])
    else bucket.push(entry)
  }

  return { groups: [...map.entries()].map(([typeKey, refsInGroup]) => ({ typeKey, refs: refsInGroup })), total: refs.length, resolved }
}
