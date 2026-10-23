/** 档 4 合并（2026-10-24）：字段已从 ceshuSchema/qa.ts 取数；默认数据暂留此处（后续批次迁入 schema）。 */
import type { ChapterDefinition } from './types'
import { QA_FIELDS } from '../ceshuSchema/qa'

export const QA_CHAPTER: ChapterDefinition = {
  fields: QA_FIELDS,
  defaults: {
  test_strategy: '',
  test_strategy_points: [],
  test_strategy_notes: '',
  test_cases: [],
  acceptance_criteria: [],
  defect_management: [],
  test_env: '',
  prototype_acceptance: [],
  test_case_list: [],
  acceptance_journeys: []
}
}
