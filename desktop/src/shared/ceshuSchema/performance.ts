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
  /*
   * 2026-10-28 补：渲染实现层缺的那条底线。
   * 性能预算只说「多少帧」，不说「降什么」——程序拿到的是一堆目标数字，
   * 却不知道低端机该砍阴影还是砍后处理，只能自己拍；拍错了就是返工。
   * 这是**设计侧定的取舍**（体验 vs 画质），不是渲染方案（用哪个管线）。
   */
  {
    key: 'quality_tiers',
    label: '画质档位',
    kind: 'pipeList',
    columns: [
      { key: 'tier', label: '档位' },
      { key: 'downgrade', label: '降什么' },
      { key: 'fps', label: '目标帧率' },
      { key: 'devices', label: '目标机型' }
    ],
    aiHint:
      '每行一个画质档位（低/中/高，2–3 行）：档位|降什么（阴影/后处理/粒子/分辨率缩放的具体取舍）|目标帧率|目标机型；每档必须有明确帧率目标，禁止只写「流畅」',
    reviewHint:
      '每档是否写了具体降级项与帧率目标；档位与目标机型是否对应；有没有「高档不降任何东西但帧率也达标」这种自相矛盾'
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
  quality_tiers: [],
  target_devices: [],
  memory_package: '',
  memory_package_points: [],
  memory_package_notes: '',
  network_adaptation: '',
  thermal_power: '',
  compat_matrix: []
}

export const PERFORMANCE_TEMPLATES: ChapterTemplate[] = [
  {
    name: '性能预算（示例）',
    description: '帧率 / 内存 / 包体 / 加载目标与测量方法，含适配与发热控制',
    tags: ['性能', '适配', '示例'],
    data: {
      performance_budget: [
        { metric: '帧率（中档机）', target: '≥ 45 fps', method: 'Perfetto 采主城 1 min 平均' },
        { metric: '内存峰值', target: '≤ 1.2 GB', method: 'Android Studio Memory Profiler' },
        { metric: '包体（首包）', target: '≤ 200 MB', method: '构建产物大小统计' },
        { metric: '冷启动', target: '≤ 3 s', method: 'adb shell am start 计时' },
        { metric: '场景加载', target: '≤ 2 s', method: '加载完成回调计时' }
      ],
      target_devices: [
        '高端：骁龙 8 Gen3 / 天玑 9300 / A17 同级',
        '中端：骁龙 7+ Gen3 / 天玑 8200 / A14 同级',
        '低端：骁龙 6 Gen1 / A12 同级（保最低可玩）'
      ],
      memory_package: '内存与包体总体预算：首包 ≤ 200MB（资源走按需下载），中档机常驻内存 ≤ 1.2GB，大世界用流式加载控制峰值。',
      memory_package_points: [
        '首包 ≤ 200MB：角色 / 场景分章资源 CDN 按需下发',
        '常驻内存 ≤ 1.2GB：对象池复用 + 贴图 mipmap 分级',
        '峰值优化：大世界区块卸载，离开即释放'
      ],
      memory_package_notes: '资源裁剪按中端机基准；高清资源仅高端机下发。',
      network_adaptation: '弱网：操作请求本地预演 + 服务端对账，断网 5s 内可重连恢复对局；流量敏感：大资源仅 WiFi 下载，蜂窝网下暂停非必要下发。降级顺序：画质→同屏数→特效。',
      thermal_power: '温升控制：中档机连续游玩 30 min 表面温度 ≤ 43°C；触发限帧（45→30fps）与降频，省电模式可手动开。',
      compat_matrix: [
        'Android 12 × 中端 × 主流程 + 战斗',
        'Android 14 × 高端 × 大世界同屏',
        'iOS 16 × 中端 × 抽卡 / 支付',
        'iOS 18 × 低端 × 冷启动'
      ]
    }
  }
]

export const PERFORMANCE_SCHEMA: ChapterSchema = {
  fields: PERFORMANCE_FIELDS,
  splits: [
  'network_adaptation',
  'thermal_power'
],
  splitHints: undefined,
  defaults: PERFORMANCE_DEFAULTS,
  templates: PERFORMANCE_TEMPLATES
}
