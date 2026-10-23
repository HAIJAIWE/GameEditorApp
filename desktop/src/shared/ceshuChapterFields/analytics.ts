/** 档 4 合并（2026-10-24）：字段已从 ceshuSchema/analytics.ts 取数；默认数据暂留此处（后续批次迁入 schema）。 */
import type { ChapterDefinition } from './types'
import { ANALYTICS_FIELDS } from '../ceshuSchema/analytics'

export const ANALYTICS_CHAPTER: ChapterDefinition = {
  fields: ANALYTICS_FIELDS,
  defaults: {
  metric_system: [],
  key_funnels: '',
  key_funnels_points: [],
  key_funnels_notes: '',
  event_tracking: [],
  dashboards: [],
  alert_monitoring: []
}
}
