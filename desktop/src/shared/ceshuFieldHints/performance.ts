import type { ChapterFieldHints } from './types'

/**
 * 第二十三章·性能与适配的字段契约（P2，2026-10-23）。
 *
 * 本章要点：AI 起草的最大风险是「写一堆性能名词但不给可测的目标值与通过线」。
 * 契约的防线：性能预算每行必须带测量方法，否则不许出现；目标机型与兼容
 * 矩阵只给系列/档位不给具体 SKU、不确定标『待确认』；温升功耗必须有可测上限。
 */
export const PERFORMANCE_FIELD_HINTS: ChapterFieldHints = {
  performance_budget: {
    aiHint: '每行一个指标，按指标|目标值|测量方法三列填写；覆盖帧率/内存/包体/加载时长',
    reviewHint: '每行是否有目标值与测量方法；指标是否可机测；目标值是否与目标机型匹配'
  },
  target_devices: {
    aiHint: '按高/中/低档位列出目标机型系列；只给系列不给具体 SKU，不确定标『待确认』',
    reviewHint: '是否按档位覆盖；是否只给系列未写具体 SKU；档位是否与预算匹配'
  },
  memory_package: {
    aiHint: '一段概述：内存与包体的总体预算与优化思路；具体预算值与优化手段走「要点」字段',
    reviewHint: '本体是否只讲思路；要点是否给出预算值与优化手段'
  },
  memory_package_points: {
    aiHint: '3-6 条：每条一项预算（内存峰值/包体大小）+ 优化手段与预期收益',
    reviewHint: '每条是否有数值与手段；包体预算是否与渠道限制匹配'
  },
  memory_package_notes: {
    aiHint: '资源裁剪、按需下载策略的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  network_adaptation: {
    aiHint: '一段概述：弱网/断网/流量敏感三类场景的适配策略，每类给出兜底方案与降级顺序',
    reviewHint: '三类场景是否齐全；弱网是否有降级顺序；是否注明流量敏感点'
  },
  thermal_power: {
    aiHint: '一段概述：长时间游玩的温升与功耗控制思路，含限帧/降频/省电模式的触发条件',
    reviewHint: '是否有可测的温升或功耗上限；降级策略是否有明确触发条件'
  },
  compat_matrix: {
    aiHint: '每行一组兼容用例：OS 版本 × 机型档位 × 必测用例；机型只给档位不给具体 SKU',
    reviewHint: 'OS 版本与机型档位是否交叉覆盖；必测用例是否可执行'
  }
}
