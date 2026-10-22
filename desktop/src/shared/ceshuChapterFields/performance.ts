import type { ChapterDefinition } from './types'

/**
 * 第二十三章·性能与适配的字段与默认数据（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「写一堆性能名词但不给可测的目标值与通过线」——
 * 帧率、内存、包体全是形容词，上线后无法验收。防法：① 性能预算用 pipeList
 * 锁「指标|目标值|测量方法」三列，没有测量方法的指标不许出现；② 目标机型
 * 与兼容矩阵用 stringList 按档位组织，契约要求给系列不给具体 SKU、不确定
 * 标『待确认』；③ 内存与包体拆三件套，优化手段进要点逐条核对。
 */
export const PERFORMANCE_CHAPTER: ChapterDefinition = {
  fields: [
    {
      key: 'performance_budget',
      label: '性能预算',
      kind: 'pipeList',
      columns: [
        { key: 'metric', label: '指标' },
        { key: 'target', label: '目标值' },
        { key: 'method', label: '测量方法' }
      ]
    },
    { key: 'target_devices', label: '目标机型', kind: 'stringList' },
    { key: 'memory_package', label: '内存与包体', kind: 'textarea' },
    { key: 'memory_package_points', label: '内存与包体·要点', kind: 'stringList' },
    { key: 'memory_package_notes', label: '内存与包体·补充', kind: 'textarea' },
    { key: 'network_adaptation', label: '网络适配', kind: 'textarea' },
    { key: 'thermal_power', label: '发热与耗电', kind: 'textarea' },
    { key: 'compat_matrix', label: '兼容测试矩阵', kind: 'stringList' }
  ],
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
