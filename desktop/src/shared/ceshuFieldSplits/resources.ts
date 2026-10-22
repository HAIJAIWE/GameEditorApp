import type { ChapterFieldSplits } from './types'

/**
 * 第十一章·资源规划的结构拆分清单（P1 收尾 + 2026-10-23 完整案例回填）。
 *
 * 复刻演练写完整文档时发现：contingency_plan 与 appendix 的契约本来就要求
 * 「可执行条目走要点」，但拆分清单漏了它们——AI 只能把条目塞进本体长文。
 * 此处补齐（budget/ip 是人定字段，按约定不拆）。
 */
export const RESOURCES_FIELD_SPLITS: ChapterFieldSplits = ['contingency_plan', 'appendix']
