/**
 * 章节 `performance` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const PERFORMANCE_FIELDS: CeshuFieldDef[] = [
  {
    key: 'performance_budget',
    label: '性能预算',
    kind: 'pipeList',
    columns: [
      {
        key: 'metric',
        label: '指标'
      },
      {
        key: 'target',
        label: '目标值'
      },
      {
        key: 'method',
        label: '测量方法'
      }
    ],
    aiHint: '每行一个指标，按指标|目标值|测量方法三列填写；覆盖帧率/内存/包体/加载时长',
    reviewHint: '每行是否有目标值与测量方法；指标是否可机测；目标值是否与目标机型匹配'
  },
  {
    key: 'target_devices',
    label: '目标机型',
    kind: 'stringList',
    aiHint: '按高/中/低档位列出目标机型系列；只给系列不给具体 SKU，不确定标『待确认』',
    reviewHint: '是否按档位覆盖；是否只给系列未写具体 SKU；档位是否与预算匹配'
  },
  {
    key: 'memory_package',
    label: '内存与包体',
    kind: 'textarea',
    aiHint: '一段概述：内存与包体的总体预算与优化思路；具体预算值与优化手段走「要点」字段',
    reviewHint: '本体是否只讲思路；要点是否给出预算值与优化手段'
  },
  {
    key: 'memory_package_points',
    label: '内存与包体·要点',
    kind: 'stringList',
    aiHint: '3-6 条：每条一项预算（内存峰值/包体大小）+ 优化手段与预期收益',
    reviewHint: '每条是否有数值与手段；包体预算是否与渠道限制匹配'
  },
  {
    key: 'memory_package_notes',
    label: '内存与包体·补充',
    kind: 'textarea',
    aiHint: '资源裁剪、按需下载策略的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  {
    key: 'network_adaptation',
    label: '网络适配',
    kind: 'textarea',
    aiHint: '一段概述：弱网/断网/流量敏感三类场景的适配策略，每类给出兜底方案与降级顺序',
    reviewHint: '三类场景是否齐全；弱网是否有降级顺序；是否注明流量敏感点'
  },
  {
    key: 'thermal_power',
    label: '发热与耗电',
    kind: 'textarea',
    aiHint: '一段概述：长时间游玩的温升与功耗控制思路，含限帧/降频/省电模式的触发条件',
    reviewHint: '是否有可测的温升或功耗上限；降级策略是否有明确触发条件'
  },
  {
    key: 'compat_matrix',
    label: '兼容测试矩阵',
    kind: 'stringList',
    aiHint: '每行一组兼容用例：OS 版本 × 机型档位 × 必测用例；机型只给档位不给具体 SKU',
    reviewHint: 'OS 版本与机型档位是否交叉覆盖；必测用例是否可执行'
  }
]

export const PERFORMANCE_DEFAULTS: ChapterData = {
  performance_budget: [],
  target_devices: [],
  memory_package: '',
  memory_package_points: [],
  memory_package_notes: '',
  network_adaptation: '',
  thermal_power: '',
  compat_matrix: []
}

export const PERFORMANCE_TEMPLATES: ChapterTemplate[] = []

export const PERFORMANCE_SCHEMA: ChapterSchema = {
  fields: PERFORMANCE_FIELDS,
  splits: [
  'network_adaptation',
  'thermal_power'
],
  splitHints: undefined,
  defaults: PERFORMANCE_DEFAULTS,
  templates: PERFORMANCE_TEMPLATES
}
