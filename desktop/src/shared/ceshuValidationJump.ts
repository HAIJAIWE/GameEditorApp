import { CHAPTER_KEYS, CHAPTER_LABELS, type ChapterKey } from './ceshuConstants'

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
