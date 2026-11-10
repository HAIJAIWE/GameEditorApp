/**
 * 章节字段分组：把一章的字段清单切成若干「生成单元」，一次只让模型写一个单元。
 *
 * 背景（2026-11-10 用户要求「一个系统或者是一个逻辑一个文档」）：
 * 整章一次索要 6–33 个字段时，模型把每个字段压到几十字——实测整章 33 字段时
 * 正文预算被推理吃光，输出直接截断归零；按 11/11/11 分批后中文一周写了 4992 字 ≈ 4 倍。
 * 所以「一次调用只写一个单元」不是排版偏好，而是让长内容不被截断、让每个字段
 * 真的能被写透的必要条件。
 *
 * 边界（第 ③ 条为什么最重要）：`x_points` / `x_notes` 是 `x` 的结构拆分产物
 * （见 fields/ceshuFields.applySplits），单独成单元等于让模型「把要点又抄一遍」——
 * 它看不到本体，只能凭空生成，必然与本体重复或矛盾。点路径 `a.b` 同理：
 * 父字段与其子键本来就是同一段内容的两个视图，拆开会各写一份。
 *
 * 纯函数、无 IO：分组结果要能被单测逐项锁住，接线后分组口径漂移会直接变成
 * 「同一字段被写两遍 / 单元超预算」这类难查的线上问题。
 */

export interface ChapterUnit {
  /** 稳定 id：`u1`、`u2`…（按组序），用于进度显示与「续写第 N 单元」 */
  id: string
  /** 单元名：组内前 2 个字段的中文名，超过 2 个以「…」示意还有后续 */
  label: string
  /** 本单元要写的字段 key（保持入参顺序、无重复） */
  fields: string[]
}

/** 单次生成最多几个字段：6 是实测能写透、又不至于把整章压扁的平衡点 */
export const CHAPTER_UNIT_MAX_FIELDS = 6

export interface PlanChapterUnitsOptions {
  /** 单次最多字段数；缺省 CHAPTER_UNIT_MAX_FIELDS，0 / 负数 / 非整数 / NaN 等非法值回落 6 */
  maxFieldsPerUnit?: number
  /** key → 中文名；命中则作为单元名，未命中回落 key，整组都没有中文名时回落章名 */
  labels?: Readonly<Record<string, string>>
}

const CJK_PATTERN = /[\u3400-\u9fff]/

/**
 * 字段的「分组锚」：派生字段与点路径都归到本体。
 *
 * 先按点路径取根（`a.b` → `a`），再剥掉 `_points` / `_notes` 后缀
 * （`core_loop_points` → `core_loop`）——顺序不能换：`a_points.b` 的根是
 * `a_points`，它本身仍是 `a` 的派生字段，只剥一层会把它和 `a` 分到两组。
 */
function anchorOf(key: string): string {
  const dot = key.indexOf('.')
  const root = dot >= 0 ? key.slice(0, dot) : key
  for (const suffix of ['_points', '_notes']) {
    if (root.length > suffix.length && root.endsWith(suffix)) return root.slice(0, -suffix.length)
  }
  return root
}

function resolveMaxFieldsPerUnit(value: number | undefined): number {
  if (value === undefined) return CHAPTER_UNIT_MAX_FIELDS
  // 非整数（如 2.5）会让「≤ 上限」失去可判定性，一并按非法处理，避免出现 2.5 字段的组
  if (!Number.isInteger(value) || value <= 0) return CHAPTER_UNIT_MAX_FIELDS
  return value
}

function nameOf(key: string, labels: Readonly<Record<string, string>>): string {
  const label = labels[key]
  if (label !== undefined && label.trim() !== '') return label.trim()
  return key
}

/**
 * 单元名：组内前 2 个字段名用「、」连接，超过 2 个加「…」。
 * 整组都没有中文名（labels 未覆盖且 key 是英文标识）时回落章名——
 * 「u1：core_loop、core_loop_points…」这种标题对策划没有信息量，不如直接说「战斗」。
 */
function unitLabel(chapter: string, fields: readonly string[], labels: Readonly<Record<string, string>>): string {
  const names = fields.slice(0, 2).map((key) => nameOf(key, labels))
  if (names.length === 0 || !names.some((name) => CJK_PATTERN.test(name))) return chapter
  return names.join('、') + (fields.length > 2 ? '…' : '')
}

/**
 * 规划一章的生成单元。
 *
 * 分组规则的优先级是刻意排过的：②（单组 ≤ 上限）与 ③（派生字段跟本体）是硬约束，
 * ①（保持原顺序）在两者不冲突时严格成立，④（不重复）永远成立。
 * 唯一会牺牲 ① 的情形是「同父字段在入参里被别的字段隔开」且总量超过上限：
 * 此时把后续同父字段并回本体单元（保持组内按入参下标排序），否则 ③ 必然破——
 * 而「_points 单独生成会变成把要点抄一遍」正是本模块存在的理由。
 */
export function planChapterUnits(
  chapter: string,
  fields: readonly string[],
  options: PlanChapterUnitsOptions = {}
): ChapterUnit[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const key of fields) {
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    unique.push(key)
  }
  if (unique.length === 0) return []

  const max = resolveMaxFieldsPerUnit(options.maxFieldsPerUnit)
  const labels = options.labels ?? {}
  const indexOf = new Map(unique.map((key, index) => [key, index]))
  const groups: string[][] = []

  if (unique.length <= max) {
    // 单单元场景必须与入参完全一致（顺序也一样），不经过聚集，避免无谓重排
    groups.push(unique)
  } else {
    // 先按锚聚类（组序 = 首次出现顺序），再把簇贪心装进单元；超上限的簇按顺序切块
    const clusterOf = new Map<string, string[]>()
    const clusterOrder: string[] = []
    for (const key of unique) {
      const anchor = anchorOf(key)
      const cluster = clusterOf.get(anchor)
      if (cluster === undefined) {
        clusterOf.set(anchor, [key])
        clusterOrder.push(anchor)
      } else {
        cluster.push(key)
      }
    }

    const ordered = (group: string[]): string[] =>
      group.slice().sort((left, right) => (indexOf.get(left) ?? 0) - (indexOf.get(right) ?? 0))

    let current: string[] = []
    const flush = (): void => {
      if (current.length > 0) {
        groups.push(ordered(current))
        current = []
      }
    }

    for (const anchor of clusterOrder) {
      const cluster = clusterOf.get(anchor) ?? []
      if (cluster.length > max) {
        // 同父字段多到一单元装不下（如 8 个点路径）：硬上限优先，按入参顺序切块
        flush()
        for (let start = 0; start < cluster.length; start += max) {
          groups.push(cluster.slice(start, start + max))
        }
        continue
      }
      if (current.length + cluster.length > max) flush()
      current.push(...cluster)
    }
    flush()
  }

  return groups.map((group, index) => ({
    id: `u${index + 1}`,
    label: unitLabel(chapter, group, labels),
    fields: group
  }))
}

/**
 * 把单元里写出来的字段按父字段归并（解析结果回填文档时用）。
 *
 * 为什么点路径要归父：`a.b` 在文档里本来就是父字段对象的一个键，回填时
 * 逐条拼回父字段只会得到重复键；而派生字段（`x_points` / `x_notes`）是独立字段，
 * 必须保留——它们不是 `x` 的一个视图，丢了就丢内容。
 */
export function mergeUnitFields(units: readonly ChapterUnit[]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const unit of units) {
    for (const key of unit.fields) {
      const target = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
      if (seen.has(target)) continue
      seen.add(target)
      merged.push(target)
    }
  }
  return merged
}
