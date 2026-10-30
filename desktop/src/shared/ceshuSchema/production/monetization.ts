/**
 * 章节 `monetization` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference/ceshuTemplates'
import type { ChapterSchema } from '../core/types'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference/ceshuConstants'

export const MONETIZATION_FIELDS: CeshuFieldDef[] = [
  {
    key: 'payment_model',
    label: '付费模式',
    kind: 'combo',
    values: [
      'f2p',
      'p2p',
      'b2p',
      'subscription',
      'f2p_p2w',
      'f2p_cosmetic',
      'buy_to_play'
    ],
    optionLabels: {
      f2p: '免费游玩（F2P）',
      p2p: '付费游玩（P2P）',
      b2p: '买断制（B2P）',
      subscription: '订阅制',
      f2p_p2w: '免费+数值付费（P2W）',
      f2p_cosmetic: '免费+外观付费',
      buy_to_play: '买断游玩'
    },
    aiHint: '从候选中选 1-2 个主模式并说明理由；模式须与定价档位、内购设计自洽',
    reviewHint: '所选模式是否与档位内购一致；理由是否结合品类'
  },
  {
    key: 'pricing_tiers',
    label: '定价档位',
    kind: 'stringList',
    placeholder: '每行一个，如 6/30/68/128/328/648',
    aiHint: '每行一个价格档位，按价格从低到高排列；覆盖小额首充到大额，标注币种',
    reviewHint: '档位是否递进；是否覆盖不同付费层级；是否标注币种'
  },
  {
    key: 'iap_design',
    label: '内购设计',
    kind: 'pipeList',
    columns: [
      {
        key: 'item',
        label: '物品'
      },
      {
        key: 'price',
        label: '价格'
      },
      {
        key: 'value',
        label: '价值'
      },
      {
        key: 'target',
        label: '目标用户'
      }
    ],
    aiHint: '每行一个内购项，按物品/价格/价值/目标用户四列填写；价值需与价格匹配',
    reviewHint: '价格与价值是否匹配；目标用户是否明确；是否与定价档位一致'
  },
  {
    key: 'ad_strategy',
    label: '广告策略',
    kind: 'textarea',
    aiHint: '一段概述：广告策略的目标与插入原则；广告位、频次、激励方式等细节走「要点」字段',
    reviewHint: '广告频次是否有上限；是否影响核心体验；激励视频是否可选'
  },
  {
    key: 'subscription_design',
    label: '订阅制',
    kind: 'textarea',
    aiHint: '一段概述：订阅制的定位与设计原则；周期、价格、权益列表等细节走「要点」字段',
    reviewHint: '权益是否可交付；是否破坏付费平衡；周期价格是否明确'
  },
  {
    key: 'season_pass',
    label: '赛季通行证',
    kind: 'textarea',
    aiHint: '一段概述：赛季通行证的定位与设计原则；周期、价格、奖励结构与免费线走「要点」字段',
    reviewHint: '免费线奖励是否可得；付费奖励是否只含外观或便利；周期价格是否明确'
  },
  {
    key: 'vip_system',
    label: 'VIP 系统',
    kind: 'textarea',
    aiHint: '一段概述：VIP 体系的目标与设计原则；等级、成长值与各等级权益走「要点」字段',
    reviewHint: '成长值来源是否明确；是否出现数值售卖；权益是否可交付'
  },
  {
    key: 'whale_strategy',
    label: '大 R 策略',
    kind: 'textarea',
    aiDraftable: false,
    reviewHint: '是否规避诱导与概率陷阱；是否守住合规与口碑底线；是否与定价档位匹配'
  },
  {
    key: 'f2p_experience',
    label: '免费玩家体验',
    kind: 'textarea',
    aiHint: '一段概述：免费玩家体验的目标与设计原则；内容边界、成长节奏、卡点设计走「要点」字段',
    reviewHint: '免费内容是否覆盖主线；卡点是否过度；是否与付费点冲突'
  },
  {
    key: 'arpu_target',
    label: 'ARPU 目标',
    kind: 'textarea',
    aiDraftable: false,
    reviewHint: '目标值是否结合品类基准；是否与付费模式、团队成本匹配'
  },
  {
    key: 'limited_offers',
    label: '限时优惠',
    kind: 'pipeList',
    placeholder: '名称|条件|有效期',
    aiHint: '2-4 个限时优惠，每行「名称|参与条件|有效期（时长或触发场景）」；避免纯折扣式付费压力',
    reviewHint: '是否有诱导性过强的时间压力；条件对免费玩家是否公平；是否与定价档位、付费模型自洽'
  },
  /*
   * 2026-10-26 补回：`revenue_forecast` 与 `kpi_forecast` 同一类问题——默认值里有它（`{}`）、
   * 两个内置模板都写了它，但字段表里没有定义，应用模板后这段内容无处落地。
   * 商业化章确实需要「流水预测」，故补成字段而不是删数据。
   */
  {
    key: 'revenue_forecast',
    label: '流水预测',
    kind: 'pipeList',
    placeholder: '周期|流水目标|测算依据',
    aiHint:
      '2-4 行流水目标，每行「周期（首月/首年）|流水目标|测算依据」（如 首月|500 万|10 万套 × 50 元客单）；依据须可追溯，无依据标「待确认」，不要给假精确数字',
    reviewHint: '测算依据是否可追溯；目标与 ARPU、付费率是否自洽；是否注明为估算而非承诺'
  }
]

export const MONETIZATION_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  ad_strategy: {
    points: {
      aiHint: '3-6 条：广告位、每日频次上限、激励方式与不破坏核心循环的插入原则',
      reviewHint: '每条是否可逐条核对；频次是否有上限；是否与订阅、内购权益冲突'
    },
    notes: {
      aiHint: '广告收益预期与 A/B 实验计划等要点之外的补充说明，可留空',
      reviewHint: '补充是否与要点重复；收益预期是否注明为估算'
    }
  },
  subscription_design: {
    points: {
      aiHint: '3-6 条：订阅周期、价格、权益项与每项权益的交付方式',
      reviewHint: '权益是否可逐条交付；是否破坏付费平衡；是否与定价档位一致'
    },
    notes: {
      aiHint: '订阅转化预期与取消/退款政策等要点之外的补充说明，可留空',
      reviewHint: '补充是否具体；是否提及取消或退款政策'
    }
  },
  season_pass: {
    points: {
      aiHint: '3-6 条：赛季周期、价格、免费线奖励与付费奖励结构',
      reviewHint: '免费线奖励是否可不付费获得；付费奖励是否只含外观便利；周期价格是否明确'
    },
    notes: {
      aiHint: '赛季更替规则与老玩家衔接等要点之外的补充说明，可留空',
      reviewHint: '补充是否与要点重复；是否说明赛季切换时的衔接'
    }
  },
  vip_system: {
    points: {
      aiHint: '3-6 条：VIP 等级、每级权益、定价锚点、与免费线的区隔',
      reviewHint: '权益是否可逐条核对；与「定价档位」字段是否重复；是否出现数值售卖'
    },
    notes: {
      aiHint: '成长值获取途径与保级规则等要点之外的补充说明，可留空',
      reviewHint: '成长值来源是否明确；补充是否可落地'
    }
  },
  f2p_experience: {
    points: {
      aiHint: '3-6 条：免费内容边界、成长节奏、卡点位置与付费墙说明',
      reviewHint: '免费内容是否覆盖主线；卡点是否逐条可判定；是否与付费点冲突'
    },
    notes: {
      aiHint: '免费向付费的转化路径等要点之外的补充说明，可留空',
      reviewHint: '转化路径是否自然；是否与「广告策略」重复'
    }
  }
}

export const MONETIZATION_DEFAULTS: ChapterData = {
  payment_model: '',
  pricing_tiers: [],
  iap_design: [],
  ad_strategy: '',
  subscription_design: '',
  season_pass: '',
  vip_system: '',
  limited_offers: '',
  whale_strategy: '',
  f2p_experience: '',
  revenue_forecast: [],
  arpu_target: ''
}

export const MONETIZATION_TEMPLATES: ChapterTemplate[] = [
  {
    name: 'F2P + 战令 + 外观',
    description: 'F2P 主流商业化设计',
    tags: [
      'F2P',
      '战令',
      '外观'
    ],
    data: {
      payment_model: 'f2p',
      pricing_tiers: [
        '6',
        '30',
        '68',
        '128',
        '328',
        '648'
      ],
      iap_design: [
        {
          item: '月卡',
          price: '30',
          value: '每日钻石 + 即时钻石',
          target: '稳定付费玩家'
        },
        {
          item: '战令',
          price: '68',
          value: '赛季奖励',
          target: '中端玩家'
        },
        {
          item: '外观礼包',
          price: '128',
          value: '限定皮肤',
          target: '外观党'
        }
      ],
      ad_strategy: '无广告（F2P 主流方向）',
      subscription_design: '月卡：30元，每日领取 + 即时钻石；季卡：88元，3个月',
      season_pass: '战令：68元，100级奖励；免费线 30 级；付费线 100 级 + 隐藏奖励',
      vip_system: 'VIP 1-15，按累计充值升级；提供永久特权（不提供数值）',
      limited_offers: '节日限定外观 + 周年庆礼包 + 联动礼包',
      whale_strategy: '648 档位礼包 + 限定收集品 + 排行榜荣誉',
      f2p_experience: '免费玩家可获取全部核心内容；付费仅加速 + 外观；无 P2W',
      revenue_forecast: [
        '首月|500 万|月卡 30 元档转化 3% + 战令 68 元档 2 万份',
        '首年|3000 万|首月 500 万后按 8% 月复合增长'
      ],
      arpu_target: '8 元/月'
    }
  },
  {
    name: '买断 + DLC',
    description: '买断制 + DLC 商业化设计',
    tags: [
      '买断',
      'DLC'
    ],
    data: {
      payment_model: 'b2p',
      pricing_tiers: [
        '标准版 198',
        '豪华版 298',
        '典藏版 498'
      ],
      iap_design: [
        {
          item: 'DLC1',
          price: '68',
          value: '新章节 + 新角色',
          target: '全玩家'
        },
        {
          item: 'DLC2',
          price: '88',
          value: '新剧情 + 新结局',
          target: '剧情党'
        }
      ],
      ad_strategy: '无广告',
      subscription_design: '无订阅',
      season_pass: '无战令',
      vip_system: '无 VIP',
      limited_offers: '周年庆折扣 + 联动礼包',
      whale_strategy: '典藏版 + 实体周边',
      f2p_experience: '无免费体验，提供试玩 Demo',
      revenue_forecast: [
        '首月|2000 万|10 万套 × 198 元首购',
        '首年|5000 万|首购 + DLC 转化 25%'
      ],
      arpu_target: '198 元（首购）+ 100 元（DLC）'
    }
  }
]

export const MONETIZATION_SCHEMA: ChapterSchema = {
  fields: MONETIZATION_FIELDS,
  splits: [
  'ad_strategy',
  'subscription_design',
  'season_pass',
  'vip_system',
  'f2p_experience'
],
  splitHints: MONETIZATION_SPLIT_HINTS,
  defaults: MONETIZATION_DEFAULTS,
  templates: MONETIZATION_TEMPLATES
}
