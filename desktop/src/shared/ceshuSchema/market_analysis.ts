/**
 * 章节 `market_analysis` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshu/ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshu/ceshuConstants'

export const MARKET_ANALYSIS_FIELDS: CeshuFieldDef[] = [
  {
    key: 'target_market',
    label: '目标市场',
    kind: 'textarea',
    aiHint: '给出目标市场的地域/平台/品类三层定位；引用数字须标来源，无来源标『待确认』',
    reviewHint: '地域平台品类是否明确；数字是否有出处或待确认标记'
  },
  {
    key: 'market_size',
    label: '市场容量',
    kind: 'textarea',
    aiHint: '一段概述：市场规模的整体估算与统计口径；数字须给出处或标『待确认』，不得编造；具体数据条目走「要点」',
    reviewHint: '数字是否有出处或待确认；是否注明年份与统计口径；是否与目标市场一致'
  },
  {
    key: 'user_demographics',
    label: '用户画像',
    kind: 'textarea',
    aiHint: '一段概述：核心用户是谁、为什么是目标；各维度数据走「要点」逐条列；引用外部报告须标来源',
    reviewHint: '画像维度是否至少 3 项；是否与目标市场匹配；外部数据是否标来源'
  },
  {
    key: 'competitors',
    label: '竞品分析',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '名称'
      },
      {
        key: 'type',
        label: '类型'
      },
      {
        key: 'strengths',
        label: '优势'
      },
      {
        key: 'weaknesses',
        label: '劣势'
      },
      {
        key: 'market_share',
        label: '市场份额'
      }
    ],
    aiHint: '每行一个真实存在的竞品，按名称/类型/优势/劣势/市场份额五列填写；不确定的销量/排名/收入标『待确认』，不得编造',
    reviewHint: '竞品名是否真实存在；五列是否齐全；无来源的份额数据是否标待确认'
  },
  {
    key: 'market_positioning',
    label: '市场定位',
    kind: 'textarea',
    aiHint: '一段概述：一句话说清与竞品的差异点；具体优势条目走「要点」，须可验证',
    reviewHint: '差异点是否一句话说清；是否与竞品分析对应；优势是否可验证'
  },
  {
    key: 'entry_barriers',
    label: '进入壁垒',
    kind: 'textarea',
    aiHint: '一段概述：进入该市场的核心壁垒判断；具体壁垒与应对走「要点」逐条列',
    reviewHint: '壁垒是否具体可执行；是否有应对思路；是否结合竞品劣势'
  },
  {
    key: 'market_trends',
    label: '市场趋势',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '每行一个趋势并注明驱动因素；引用报告须标来源与年份',
    reviewHint: '是否注明来源或驱动因素；是否与定位一致；引用年份是否过期'
  },
  /*
   * 2026-10-26 补回：`kpi_forecast` 一直被三处引用却没有字段定义——
   * 默认值里有它（`{}`）、内置模板写了它、评分规则 `MARKET_SCORE_RULES` 也按它给 3 分。
   * 后果是市场潜力满分只有 7（其它两章各 10），且应用模板时这段内容无处落地。
   *
   * 与第二十章「数据埋点」的分工：这里是**业务目标的预测值**（上线后要打到多少），
   * 埋点章写的是**指标口径与采集方式**。不要互相抄。
   */
  {
    key: 'kpi_forecast',
    label: 'KPI 预测',
    kind: 'pipeList',
    placeholder: '指标|目标值|达成周期',
    aiHint:
      '3-6 个上线后要看的业务 KPI，每行「指标|目标值|达成周期」（如 DAU|20 万|上线 3 个月）；目标值须有依据（对标竞品或历史数据），无依据标「待确认」；埋点口径在第二十章，此处不写',
    reviewHint: '指标是否可统计；目标值是否有依据；周期是否具体；与市场规模、竞品数据是否自洽'
  }
]

export const MARKET_ANALYSIS_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  market_size: {
    points: {
      aiHint: '3-6 条：每条一个可采集的数据项 + 数值 + 年份 + 来源，无来源标『待确认』',
      reviewHint: '每条是否有数值与来源或待确认；口径是否与本体一致；有无无出处数字'
    },
    notes: {
      aiHint: '要点之外的补充说明：估算方法、口径差异或存疑数据，可留空',
      reviewHint: '补充是否与要点重复；存疑数据是否写清原因'
    }
  },
  user_demographics: {
    points: {
      aiHint: '3-6 条：每条一个画像维度 + 具体数据（如 18-25 岁占比 60%）并注明来源',
      reviewHint: '每条是否一个维度带数据；维度是否至少 3 项；外部数据是否标来源'
    },
    notes: {
      aiHint: '要点之外的补充说明：调研方法、样本说明或待验证假设，可留空',
      reviewHint: '补充是否与要点重复；假设是否标注待验证'
    }
  },
  market_positioning: {
    points: {
      aiHint: '2-4 条：每条一个差异化优势 + 对应竞品的短板，须可验证',
      reviewHint: '每条是否对应具体竞品；优势是否可验证；有无「体验更好」这类空话'
    },
    notes: {
      aiHint: '要点之外的补充说明：定位推理过程或暂不采用的定位方向，可留空',
      reviewHint: '补充是否与要点重复；放弃的方向是否写了原因'
    }
  },
  entry_barriers: {
    points: {
      aiHint: '2-4 条：每条一类壁垒（技术/资金/IP/渠道）+ 具体表现 + 我们的应对',
      reviewHint: '每条壁垒是否具体到场景；应对是否可执行；是否结合竞品劣势'
    },
    notes: {
      aiHint: '要点之外的补充说明：壁垒变化趋势或资源缺口，可留空',
      reviewHint: '补充是否与要点重复；资源缺口是否写清'
    }
  }
}

export const MARKET_ANALYSIS_DEFAULTS: ChapterData = {
  target_market: '',
  market_size: '',
  user_demographics: '',
  competitors: [],
  market_positioning: '',
  entry_barriers: '',
  market_trends: [],
  kpi_forecast: []
}

export const MARKET_ANALYSIS_TEMPLATES: ChapterTemplate[] = [
  {
    name: '国产仙侠市场分析',
    description: '国产仙侠 RPG 市场容量与竞品分析',
    tags: [
      '仙侠',
      '市场',
      '国产'
    ],
    data: {
      target_market: '中国大陆为主（PC + 移动），港澳台同步上线；海外以日韩东南亚为主',
      market_size: '国产仙侠 RPG 市场 2024 年规模约 80 亿，年增长率 8%；F2P 模式占比 70%，买断制 30%',
      user_demographics: '年龄 18-35 岁（占 65%）；男性 60% / 女性 40%；一二线城市 55%，下沉市场增长迅速',
      competitors: [
        {
          name: '原神',
          type: '开放世界',
          strengths: '全球化运营',
          weaknesses: '氪金重',
          market_share: '30%'
        },
        {
          name: '古剑奇谭',
          type: '单机 RPG',
          strengths: '剧情深厚',
          weaknesses: '节奏慢',
          market_share: '5%'
        },
        {
          name: '鬼谷八荒',
          type: '修真沙盒',
          strengths: '创意',
          weaknesses: '美术粗',
          market_share: '3%'
        }
      ],
      market_positioning: '差异化定位：剧情向 + 国风美术，避开开放世界红海，主打单机/轻网游体验',
      entry_barriers: '1) 美术资产投入门槛高\n2) 仙侠 IP 用户忠诚度高\n3) 渠道发行资源集中',
      market_trends: [
        {
          trend: '国风美学复兴',
          direction: '利好'
        },
        {
          trend: 'F2P 主导',
          direction: '需适配'
        },
        {
          trend: '短内容偏好',
          direction: '需调整'
        }
      ],
      kpi_forecast: [
        'DAU|20 万|上线 3 个月',
        'MAU|100 万|上线 6 个月',
        '次日留存|45%|上线即达',
        '7 日留存|20%|上线即达',
        'ARPU|8 元|上线 6 个月',
        'LTV|120 元|上线 12 个月'
      ]
    }
  },
  {
    name: '竞技 PVP 市场分析',
    description: '5v5 竞技游戏市场分析',
    tags: [
      'PVP',
      '竞技',
      '市场'
    ],
    data: {
      target_market: '全球市场（PC + 主机 + 移动）',
      market_size: '全球竞技 PVP 市场 2024 年 200 亿美元，年增长 5%；MOBA + 战术竞技占 60%',
      user_demographics: '年龄 16-30 岁（占 70%）；男性 75% / 女性 25%；电竞观众转化潜力大',
      competitors: [
        {
          name: '英雄联盟',
          type: 'MOBA',
          strengths: '生态成熟',
          weaknesses: '玩家老化',
          market_share: '35%'
        },
        {
          name: '瓦罗兰特',
          type: '战术射击',
          strengths: '新作红利',
          weaknesses: '地区不平衡',
          market_share: '8%'
        }
      ],
      market_positioning: '差异化：地形可变机制 + 全英雄免费，主打公平竞技与战术深度',
      entry_barriers: '1) 电竞生态门槛高\n2) 反外挂投入大\n3) 玩家社区运营复杂',
      market_trends: [
        {
          trend: '移动电竞增长',
          direction: '机会'
        },
        {
          trend: '跨界联动',
          direction: '可借力'
        }
      ],
      kpi_forecast: {
        dau: '50万',
        mau: '300万',
        retention_d1: '50%',
        retention_d7: '25%',
        arpu: '5元',
        ltv: '80元'
      }
    }
  }
]

export const MARKET_ANALYSIS_SCHEMA: ChapterSchema = {
  fields: MARKET_ANALYSIS_FIELDS,
  splits: [
  'market_size',
  'user_demographics',
  'market_positioning',
  'entry_barriers'
],
  splitHints: MARKET_ANALYSIS_SPLIT_HINTS,
  defaults: MARKET_ANALYSIS_DEFAULTS,
  templates: MARKET_ANALYSIS_TEMPLATES
}
