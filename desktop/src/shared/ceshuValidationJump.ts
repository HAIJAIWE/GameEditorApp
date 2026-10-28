import { CHAPTER_KEYS, CHAPTER_LABELS, type ChapterKey } from './ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from './ceshuFields'

/**
 * 从校验文案里解析出该问题所属章节（用于「点击跳转」）。
 *
 * ## 为什么按「文案里的章节显示名」反查
 * `validateCeshu` 的文案是人读的（`第一章·产品愿景：字段 'design_vision' 为必填项`），
 * 它本身**不携带结构化章节字段**；改造校验输出会牵动导出报告与既有断言。
 * 而文案里的章节显示名恰好由 `CHAPTER_LABELS` 统一派生 ⇒ 反查不会随章号漂移而失效。
 *
 * ## 规则
 * 在 `CHAPTER_KEYS` 顺序里找文案中**最早出现**的章节显示名；找不到返回 null。
 * 冲突类文案会提到两章（`A 与 B 不一致`），取先出现的那个 —— 人通常从第一个开始查。
 * 同下标时按 `CHAPTER_KEYS` 顺序取先者（严格小于比较即可，先遍历到的已占位）。
 */
export function resolveValidationChapter(message: string): ChapterKey | null {
  let found: ChapterKey | null = null
  let foundIndex = Number.POSITIVE_INFINITY
  for (const key of CHAPTER_KEYS) {
    const index = message.indexOf(CHAPTER_LABELS[key])
    if (index >= 0 && index < foundIndex) {
      found = key
      foundIndex = index
    }
  }
  return found
}

/** 跳转目标：章 + 可选的字段 key（`field=null` 表示只能定位到章） */
export interface ValidationJumpTarget {
  chapter: ChapterKey
  field: string | null
}

/**
 * 从校验文案里解析出「章 + 字段」（用于跳到具体字段，而不只是切章）。
 *
 * ## 只认 schema 里真实存在的字段
 * 文案里的字段名有两种来源：
 *   1. **必填/人定**类：`第一章·产品愿景：字段 'design_vision' 为必填项` —— `design_vision`
 *      是 schema 里的键，能直接定位到表单里的字段块；
 *   2. **配置/一致性**类：`一致性冲突：… systems.battle.config.turn_mode='实时'` —— 这些键
 *      属于系统配置（`SystemsEditor` 内部），不在 `CESHU_CHAPTER_FIELDS` 里，跳不过去。
 * 所以解析出字段名后必须回 schema 校验一次：不存在就退化成「只跳章」，
 * 否则会给出一个点了没反应的链接（比不可点更糟）。
 *
 * ## 规则
 * - 先按 `resolveValidationChapter` 定位章（沿用「取文案里最先出现的章节名」口径）；
 * - 再取第一个 `字段 'x'` / `字段 "x"` 里的 x；
 * - x 必须在该章字段表里，且不是拆分产物之外的野键 ⇒ 返回 `{chapter, field}`；
 * - 章定位不到 ⇒ null；章定位到但字段不可用 ⇒ `{chapter, field: null}`。
 */
export function resolveValidationTarget(message: string): ValidationJumpTarget | null {
  const chapter = resolveValidationChapter(message)
  if (chapter === null) return null
  const matched = /字段\s*['"]([^'"]+)['"]/.exec(message)
  const candidate = matched?.[1]
  if (candidate === undefined) return { chapter, field: null }
  const exists = (CESHU_CHAPTER_FIELDS[chapter] ?? []).some((field) => field.key === candidate)
  return { chapter, field: exists ? candidate : null }
}
