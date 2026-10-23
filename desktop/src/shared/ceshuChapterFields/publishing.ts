/** 档 4 合并（2026-10-24）：字段已从 ceshuSchema/publishing.ts 取数；默认数据暂留此处（后续批次迁入 schema）。 */
import type { ChapterDefinition } from './types'
import { PUBLISHING_FIELDS } from '../ceshuSchema/publishing'

export const PUBLISHING_CHAPTER: ChapterDefinition = {
  fields: PUBLISHING_FIELDS,
  defaults: {
  publish_plan: '',
  publish_plan_points: [],
  publish_plan_notes: '',
  channel_strategy: [],
  compliance: '',
  marketing_rhythm: '',
  soft_launch: '',
  soft_launch_points: [],
  soft_launch_notes: '',
  launch_checklist: []
}
}
