/**
 * 章节 `level_design` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

export const LEVEL_DESIGN_FIELDS: CeshuFieldDef[] = [
  {
    key: 'level_principles',
    label: '关卡设计原则',
    kind: 'textarea',
    aiHint: '一段概述：关卡设计的总体原则与内容取向；可逐条核对的规则走结构化字段，本体勿罗列',
    reviewHint: '本体是否只讲原则；是否与难度曲线、关卡模板自洽'
  },
  {
    key: 'difficulty_curve',
    label: '难度曲线',
    kind: 'textarea',
    aiHint: '一段概述：难度起伏的总体形状与设计意图；按阶段的具体曲线点走「要点」字段',
    reviewHint: '本体是否只讲形状与意图；要点是否按阶段递进；是否有峰值与喘息段'
  },
  {
    key: 'difficulty_curve_points',
    label: '难度曲线·要点',
    kind: 'stringList',
    aiHint: '按阶段每行一条：阶段/关卡区间+难度等级+考验能力；难度须整体递增',
    reviewHint: '阶段是否递进；每行是否有难度与考验能力；新高峰前是否有缓冲关'
  },
  {
    key: 'difficulty_curve_notes',
    label: '难度曲线·补充',
    kind: 'textarea',
    aiHint: '曲线依据（玩家成长、数值章能力线）的补充说明，可留空',
    reviewHint: '依据是否与数值章成长线一致；是否与要点重复'
  },
  {
    key: 'level_templates',
    label: '关卡模板',
    kind: 'stringList',
    aiHint: '每行一个模板：模板名+结构+适用阶段；参考某游戏关卡时案例必须真实存在，不确定标「待确认」',
    reviewHint: '每行是否三要素齐全；参考案例是否真实可查；模板是否覆盖各阶段'
  },
  {
    key: 'first_levels',
    label: '首关体验',
    kind: 'stringList',
    aiHint: '每行一关：关卡名+教学点+引入机制；前三关按教学顺序排；参考案例必须真实存在，不确定标「待确认」',
    reviewHint: '前三关是否齐全；每关是否只有一个教学重点；是否与核心玩法一致'
  },
  {
    key: 'content_estimate',
    label: '内容量估算',
    kind: 'pipeList',
    columns: [
      {
        key: 'stage',
        label: '阶段'
      },
      {
        key: 'count',
        label: '关卡数量'
      },
      {
        key: 'minutes',
        label: '单关时长(分钟)'
      },
      {
        key: 'basis',
        label: '测算依据'
      }
    ],
    aiHint: '每行一阶段：阶段|关卡数量|单关时长(分钟)|测算依据；数量与时长须有依据，禁拍脑袋',
    reviewHint: '每行是否四列齐全；总量是否与 MVP 范围匹配；时长是否有依据'
  },
  {
    key: 'level_table',
    label: '关卡配置表',
    kind: 'pipeList',
    columns: [
      { key: 'level', label: '关卡' },
      { key: 'encounter', label: '敌人编队' },
      { key: 'reward', label: '奖励' },
      { key: 'difficulty', label: '难度系数' },
      { key: 'unlock', label: '解锁条件' }
    ],
    aiHint:
      '逐关一行（至少覆盖 MVP 范围，能落表）：关卡名/编号|敌人编队（种类×数量，引用数据表的 id）|奖励（道具×数量）|难度系数（首关 0.5 起，以 1.0 为基准）|解锁条件；这是编码时**直接读表生成关卡**的内容，不要写「若干」「适中」「循序渐进」',
    reviewHint:
      '每行五列是否齐全；敌人与奖励是否引用真实数据表 id（不是「小怪」这类泛指）；难度系数是否与难度曲线同向；首关是否最简单、Boss 是否最高'
  },
  {
    key: 'editor_needs',
    label: '编辑器需求',
    kind: 'stringList',
    aiHint: '每行一个编辑器能力需求：能力名称+支撑的关卡配置场景',
    reviewHint: '每条是否对应具体配置场景；是否与关卡模板、首关体验配套'
  }
]

export const LEVEL_DESIGN_DEFAULTS: ChapterData = {
  level_principles: '',
  difficulty_curve: '',
  difficulty_curve_points: [],
  difficulty_curve_notes: '',
  level_templates: [],
  first_levels: [],
  content_estimate: [],
  level_table: [],
  editor_needs: []
}

/**
 * 内置模板（2026-10-26 补 P2 章节的「填满样例」）：
 * 难度曲线、内容量估算这类字段最容易写成「渐进式提升难度」的废话，
 * 这里给两份带具体层数 / 关卡数 / 时长的样例。
 */
export const LEVEL_DESIGN_TEMPLATES: ChapterTemplate[] = [
  {
    name: '层进关卡（交互范式示例）',
    description: '单局多层推进、每层数分钟，难度靠节点组合而非数值堆叠；示例名词按品类替换（出牌→操作、费用→资源、遗物→强化物、构筑→Build）',
    tags: ['关卡结构', '难度曲线', '节点', '示例'],
    data: {
      level_principles: '地图即关卡：每层 3-5 个节点，节点类型决定节奏；难度靠组合与资源压力，不靠数值堆叠。',
      difficulty_curve: '前 3 层教学期，4-6 层建立压力，7 层后每层一次高峰、每 3 层给一个喘息层。',
      difficulty_curve_points: [
        '1-3 层：只出普通战斗与休息，教学基础操作与成长',
        '4-6 层：加入精英节点，考验 Build 成型速度',
        '7-9 层：Boss 前压力峰值，药水与金币紧张',
        '10 层后：每 3 层插一个商店/事件层，避免连续高压'
      ],
      difficulty_curve_notes: '曲线依据：单局 25-35 分钟、每层 4-6 分钟；与数值章「每层一次成长机会」的成长线对齐。',
      level_templates: [
        '单线三节点：战斗→战斗→休息，用于教学层',
        '分叉双线：左线精英（高风险高奖励）、右线普通（稳妥）',
        'Boss 层：前置一个商店节点，允许最后一搏调整 Build'
      ],
      first_levels: [
        '第 1 层：只教基础操作与资源（纯普通战斗，敌人 2 只）',
        '第 2 层：教升级选奖励（战斗 → 奖励三选一）',
        '第 3 层：教强化物（首个强化节点，效果写清触发时机）'
      ],
      content_estimate: [
        { stage: '教学层', count: '3', minutes: '4', basis: '单场 3 回合 × 约 80 秒' },
        { stage: '中段', count: '6', minutes: '5', basis: '精英战平均 5 回合' },
        { stage: '终段', count: '3', minutes: '7', basis: 'Boss 战 8-10 回合' }
      ],
      level_table: [
        {
          level: '1-1 教学层',
          encounter: 'slime×2、bat×1',
          reward: 'gold×20、item_random×1',
          difficulty: '0.5',
          unlock: '默认解锁'
        },
        {
          level: '4-1 精英层',
          encounter: 'elite_golem×1、slime×2',
          reward: 'gold×60、enhance_random×1',
          difficulty: '1.0',
          unlock: '通过 3 层'
        },
        {
          level: '10-Boss',
          encounter: 'boss_lich×1（三阶段）',
          reward: 'gold×200、enhance_rare×1',
          difficulty: '1.6',
          unlock: '通过 9 层'
        }
      ],
      editor_needs: [
        '节点表：类型 / 难度系数 / 掉落表，支撑分叉图配置',
        '敌人编队：按层数区间取权重，支持同层随机',
        '奖励池：按节点类型过滤，支持三选一去重'
      ]
    }
  },
  {
    name: 'Roguelike 层进关卡',
    description: '单局 10-12 层、每层 4-6 分钟，难度靠节点组合而非数值堆叠',
    tags: ['Roguelike', '关卡结构', '难度曲线', '节点'],
    data: {
      level_principles: '地图即关卡：每层 3-5 个节点，节点类型决定节奏；难度靠组合与资源压力，不靠数值堆叠。',
      difficulty_curve: '前 3 层教学期，4-6 层建立压力，7 层后每层一次高峰、每 3 层给一个喘息层。',
      difficulty_curve_points: [
        '1-3 层：只出普通战斗与休息，教学出牌与升级',
        '4-6 层：加入精英节点，考验构筑成型速度',
        '7-9 层：Boss 前压力峰值，药水与金币紧张',
        '10 层后：每 3 层插一个商店/事件层，避免连续高压'
      ],
      difficulty_curve_notes: '曲线依据：单局 25-35 分钟、每层 4-6 分钟；与数值章「每层一次升级机会」的成长线对齐。',
      level_templates: [
        '单线三节点：战斗→战斗→休息，用于教学层',
        '分叉双线：左线精英（高风险高奖励）、右线普通（稳妥）',
        'Boss 层：前置一个商店节点，允许最后一搏调整构筑'
      ],
      first_levels: [
        '第 1 层：只教出牌与费用（纯普通战斗，敌人 2 只）',
        '第 2 层：教升级选牌（战斗 → 奖励三选一）',
        '第 3 层：教遗物（首个遗物节点，效果写清触发时机）'
      ],
      content_estimate: [
        { stage: '教学层', count: '3', minutes: '4', basis: '单场 3 回合 × 约 80 秒' },
        { stage: '中段', count: '6', minutes: '5', basis: '精英战平均 5 回合' },
        { stage: '终段', count: '3', minutes: '7', basis: 'Boss 战 8-10 回合' }
      ],
      level_table: [
        {
          level: '1-1 教学层',
          encounter: 'slime×2、bat×1',
          reward: 'gold×20、card_random×1',
          difficulty: '0.5',
          unlock: '默认解锁'
        },
        {
          level: '4-1 精英层',
          encounter: 'elite_golem×1、slime×2',
          reward: 'gold×60、relic_random×1',
          difficulty: '1.0',
          unlock: '通过 3 层'
        },
        {
          level: '10-Boss',
          encounter: 'boss_lich×1（三阶段）',
          reward: 'gold×200、relic_rare×1',
          difficulty: '1.6',
          unlock: '通过 9 层'
        }
      ],
      editor_needs: [
        '节点表：类型 / 难度系数 / 掉落表，支撑分叉图配置',
        '敌人编队：按层数区间取权重，支持同层随机',
        '奖励池：按节点类型过滤，支持三选一去重'
      ]
    }
  },
  {
    name: 'SLG 大地图领土',
    description: '地图即关卡：出生州到首府四级强度，含关隘与集结攻坚',
    tags: ['SLG', '大地图', '领土', '难度梯度'],
    data: {
      level_principles: '地图即关卡：难度由邻接关系与资源密度决定，不设独立关卡实例；守军强度随离出生点距离递增。',
      difficulty_curve: '出生州资源密度高、竞争低；每向外扩一州守军强度 +20%、资源产出 +15%。',
      difficulty_curve_points: [
        '出生州（1 格）：守军 ≤300，资源产出基准 1.0',
        '相邻州（2-3 格）：守军 500-800，产出 1.15',
        '关隘：一次性攻坚，决定州归属，需 30 分钟集结',
        '首府：守军 2000+，需联盟协同，占领后开启税收'
      ],
      difficulty_curve_notes: '与数值章兵种克制系数联动：1.25/0.8 的克制差意味着纯兵种必被针对，混编是唯一稳定解。',
      level_templates: [
        '资源点争夺：单点守军 + 每小时产出计时器',
        '关隘攻坚：30 分钟集结窗口 + 守军两波次',
        '州府占领：破门 → 驻防 → 开启税收三阶段'
      ],
      first_levels: [
        '第 1 格：教出征（守军 100，行军 3 分钟）',
        '第 2 格：教资源产出（占领后每小时 +800）',
        '第 3 格：教侦查（迷雾中有敌军，斥候可点亮）'
      ],
      content_estimate: [
        { stage: '出生州', count: '9', minutes: '10', basis: '每格一次占领战 + 行军时间' },
        { stage: '相邻州', count: '12', minutes: '15', basis: '含侦查与集结等待' },
        { stage: '首府', count: '3', minutes: '45', basis: '集结 30 分钟 + 攻城 15 分钟' }
      ],
      level_table: [
        {
          level: '出生州·1 格',
          encounter: 'guard_militia×100',
          reward: 'gold×800/小时',
          difficulty: '0.5',
          unlock: '开局'
        },
        {
          level: '相邻州·2 格',
          encounter: 'guard_archer×500',
          reward: 'gold×1200/小时',
          difficulty: '1.0',
          unlock: '占领 1 格'
        },
        {
          level: '关隘',
          encounter: 'guard_elite×800（两波次）',
          reward: '州归属权',
          difficulty: '1.4',
          unlock: '联盟集结 ≥10 人'
        }
      ],
      editor_needs: [
        '地图格子表：坐标 / 州归属 / 守军配置',
        '产出表：格子类型 → 每小时产出与上限',
        '行军规则：距离 → 时间（最短 3 分钟/格）'
      ]
    }
  }
]

export const LEVEL_DESIGN_SCHEMA: ChapterSchema = {
  fields: LEVEL_DESIGN_FIELDS,
  splits: [
  'level_principles'
],
  splitHints: undefined,
  defaults: LEVEL_DESIGN_DEFAULTS,
  templates: LEVEL_DESIGN_TEMPLATES
}
