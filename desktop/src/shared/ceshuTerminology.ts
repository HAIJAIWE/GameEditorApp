import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from './ceshuConstants'
import { GAME_TERMS } from './glossaryTerms'
import { isPlainObject } from './ceshuModel'

/**
 * 术语一致性检查：同一概念在全文用了不同叫法时提示统一。
 *
 * ## 数据来源
 * `GAME_TERMS`（143 条「中文术语 → 英文字段 ID」）里，**同一个 ID 下的多个中文名**
 * 天然构成同义词组（如 `hp` → 生命值 / 生命 / 血量）。本模块据此判定「是不是一个概念」，
 * 不靠模型猜、不引入外部词典。
 *
 * ## 三道收敛（宁可漏报，不可误报）
 * 1. **白名单**：只检查语义确实等价的组（见 `TERM_CHECK_GROUP_IDS`）。
 *    `range`（范围/射程）、`cost`（消耗/费用）这类同 ID 但语义不同的组直接排除；
 * 2. **子串过滤**：组内被更长变体包含的变体剔除（`生命` ⊂ `生命值`、`攻击` ⊂ `攻击力`），
 *    这类是构词关系而不是「换了叫法」；
 * 3. **最少使用次数**：每个变体至少出现 `MIN_VARIANT_USES` 次才算「在用」——
 *    一次顺带提及不构成命名习惯（也避开中文分词误伤，如「火力」里的「火」）。
 *
 * 结果进 `validateCeshu`，与重复检测并列，供人审时一并看。
 */

/** 参与检查的同义词组（GAME_TERMS 里的 ID）；未列入的组一律不查 */
export const TERM_CHECK_GROUP_IDS: readonly string[] = [
  'hp', // 生命值 / 血量
  'mp', // 魔法值 / 法力
  'atk_speed', // 攻击速度 / 攻速
  'id', // ID / 编号
  'faction', // 阵营 / 势力
  'fire', // 火 / 火焰
  'poison', // 毒 / 毒素
  'holy' // 圣 / 神圣
]

/** 每个变体至少出现多少次才算「在用」（一次顺带提及不算命名习惯） */
export const MIN_VARIANT_USES = 2

/** 单次校验最多报几组（避免一屏几十条警告把真问题淹掉） */
export const MAX_TERM_CONFLICTS = 5

export interface TermGroup {
  /** GAME_TERMS 里的英文字段 ID（概念标识） */
  id: string
  /** 该概念的候选叫法（已按子串规则过滤，长变体在前） */
  variants: string[]
}

export interface TermConflict {
  id: string
  /** 实际在用的叫法及其出现次数、首次出现的章节 */
  usages: Array<{ variant: string; count: number; firstChapter: ChapterKey | null }>
}

/** 构建可检查的同义词组：白名单 + 子串过滤（长变体优先） */
export function buildTermGroups(): TermGroup[] {
  const byId = new Map<string, string[]>()
  for (const [variant, id] of Object.entries(GAME_TERMS)) {
    if (!TERM_CHECK_GROUP_IDS.includes(id)) continue
    const list = byId.get(id) ?? []
    list.push(variant)
    byId.set(id, list)
  }

  const groups: TermGroup[] = []
  for (const [id, rawVariants] of byId) {
    const sorted = [...rawVariants].sort((left, right) => right.length - left.length)
    // 被更长变体包含的变体剔除：`生命` ⊂ `生命值` 属构词关系，不是换叫法
    const kept = sorted.filter(
      (variant) => !sorted.some((other) => other !== variant && other.length > variant.length && other.includes(variant))
    )
    if (kept.length >= 2) groups.push({ id, variants: kept })
  }
  return groups
}

/** 递归收集值里的全部字符串（章节数据可能是数组/嵌套对象） */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 6) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1)
    return
  }
  if (isPlainObject(value)) {
    for (const inner of Object.values(value)) collectStrings(inner, out, depth + 1)
  }
}

/** 转义正则元字符（变体来自词表，理论上安全，但不依赖这个假设） */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/** 统计某个变体在一段文本里的出现次数（该组内按最长优先、不重叠匹配） */
function countVariant(text: string, group: TermGroup, variant: string): number {
  const pattern = new RegExp(group.variants.map(escapeRegExp).join('|'), 'gu')
  let count = 0
  for (const match of text.matchAll(pattern)) {
    if (match[0] === variant) count += 1
  }
  return count
}

/** 检测全文的术语不一致（纯函数，不修改入参） */
export function detectTerminologyConflicts(doc: CeshuDocument): TermConflict[] {
  const groups = buildTermGroups()
  const chapters = CHAPTER_KEYS.filter((key) => isPlainObject(doc[key]))

  const conflicts: TermConflict[] = []
  for (const group of groups) {
    const usages = new Map<string, { count: number; firstChapter: ChapterKey | null }>()
    for (const chapter of chapters) {
      const texts: string[] = []
      collectStrings(doc[chapter], texts)
      const text = texts.join('\n')
      if (text === '') continue
      for (const variant of group.variants) {
        const count = countVariant(text, group, variant)
        if (count === 0) continue
        const entry = usages.get(variant) ?? { count: 0, firstChapter: chapter }
        entry.count += count
        usages.set(variant, entry)
      }
    }

    // 只有「两个及以上变体都达到最少使用次数」才算不一致
    const active = [...usages.entries()].filter(([, usage]) => usage.count >= MIN_VARIANT_USES)
    if (active.length < 2) continue
    conflicts.push({
      id: group.id,
      usages: active.map(([variant, usage]) => ({
        variant,
        count: usage.count,
        firstChapter: usage.firstChapter
      }))
    })
  }
  return conflicts
}

/** 校验链的警告文案 */
export function terminologyConflictMessage(conflict: TermConflict): string {
  const names = conflict.usages.map((usage) => `「${usage.variant}」`).join(' / ')
  const detail = conflict.usages
    .map((usage) => {
      const where =
        usage.firstChapter !== null ? `，首见 ${CHAPTER_LABELS[usage.firstChapter]}` : ''
      return `「${usage.variant}」${usage.count} 次${where}`
    })
    .join('；')
  return `术语不一致：${names}指同一概念（${conflict.id}），建议全文统一叫法 —— ${detail}`
}

/** 生成校验条目（超过上限时补一条汇总，避免刷屏） */
export function terminologyConflictMessages(conflicts: TermConflict[]): string[] {
  const shown = conflicts.slice(0, MAX_TERM_CONFLICTS).map(terminologyConflictMessage)
  if (conflicts.length > MAX_TERM_CONFLICTS) {
    shown.push(`术语不一致：另有 ${conflicts.length - MAX_TERM_CONFLICTS} 组同概念异名，建议一并统一`)
  }
  return shown
}
