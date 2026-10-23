/** 档 4 合并（2026-10-24）：字段已从 ceshuSchema/performance.ts 取数；默认数据暂留此处（后续批次迁入 schema）。 */
import type { ChapterDefinition } from './types'
import { PERFORMANCE_FIELDS } from '../ceshuSchema/performance'

export const PERFORMANCE_CHAPTER: ChapterDefinition = {
  fields: PERFORMANCE_FIELDS,
  defaults: {
  performance_budget: [],
  target_devices: [],
  memory_package: '',
  memory_package_points: [],
  memory_package_notes: '',
  network_adaptation: '',
  thermal_power: '',
  compat_matrix: []
}
}
