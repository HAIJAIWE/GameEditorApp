/** 档 4 合并（2026-10-24）：字段已从 ceshuSchema/uiux.ts 取数；默认数据暂留此处（后续批次迁入 schema）。 */
import type { ChapterDefinition } from './types'
import { UIUX_FIELDS } from '../ceshuSchema/uiux'

export const UIUX_CHAPTER: ChapterDefinition = {
  fields: UIUX_FIELDS,
  defaults: {
  design_principles: '',
  design_principles_points: [],
  design_principles_notes: '',
  information_architecture: '',
  core_flows: [],
  key_screens: [],
  feedback_rules: [],
  usability_standards: []
}
}
