/**
 * 章节 `combat` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshu/reference/ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshu/reference/ceshuConstants'

export const COMBAT_FIELDS: CeshuFieldDef[] = [
  {
    key: 'combat_mode',
    label: '战斗模式',
    kind: 'combo',
    values: [
      'turn_based',
      'realtime',
      'semi_realtime',
      'auto_battle',
      'atb',
      'ctb',
      'srpg_grid'
    ],
    optionLabels: {
      turn_based: '回合制',
      realtime: '即时制',
      semi_realtime: '半即时制',
      auto_battle: '自动战斗',
      atb: 'ATB（行动条）',
      ctb: 'CTB（回合条）',
      srpg_grid: 'SRPG 战棋格'
    },
    aiHint: '从候选中选 1 个主模式并说明理由；须与战斗节奏、技能系统自洽',
    reviewHint: '选项是否来自候选列表；是否与节奏、技能设计互相矛盾'
  },
  {
    key: 'damage_formula',
    label: '伤害公式',
    kind: 'textarea',
    aiHint: '伤害计算公式：写清攻击/防御/暴击等变量的关系',
    reviewHint: '公式是否可计算；数值章「核心公式」是否重复本条'
  },
  {
    key: 'damage_formula_points',
    label: '伤害公式·要点',
    kind: 'stringList',
    placeholder: '每行一条公式或步骤',
    aiHint: '每条公式或步骤一行，便于机器解析',
    reviewHint: '每行是否是可计算的表达式；变量是否都有定义；与本体描述是否一致'
  },
  {
    key: 'damage_formula_notes',
    label: '伤害公式·补充',
    kind: 'textarea',
    aiHint: '公式之外的推导或说明，可留空',
    reviewHint: '是否只放补充信息、没有把公式又抄一遍；该留空时是否确实留空'
  },
  {
    key: 'skill_system',
    label: '技能系统',
    kind: 'textarea',
    aiHint: '一段概述：技能体系的设计目标与整体结构；具体技能条目走「要点」字段，不要在这里罗列',
    reviewHint: '本体是否只讲目标与结构；要点是否覆盖分类、升级路径与代表技能'
  },
  {
    key: 'buff_debuff',
    label: 'Buff/Debuff',
    kind: 'textarea',
    aiHint: '一段概述：Buff/Debuff 系统的定位与设计原则；具体效果条目走「要点」字段',
    reviewHint: '本体是否只讲定位与原则；要点是否覆盖主要类型与规则'
  },
  {
    key: 'element_system',
    label: '元素系统',
    kind: 'textarea',
    aiHint: '一段概述：元素系统的定位与相克/反应框架；具体元素条目走「要点」字段',
    reviewHint: '本体是否只讲框架；要点是否覆盖元素种类与反应结果'
  },
  {
    key: 'combat_pace',
    label: '战斗节奏',
    kind: 'combo',
    values: [
      'slow',
      'medium',
      'fast',
      'variable'
    ],
    optionLabels: {
      slow: '慢节奏',
      medium: '中节奏',
      fast: '快节奏',
      variable: '可变节奏'
    },
    aiHint: '从候选中选 1 个节奏档位；给出单场战斗的目标时长与回合数',
    reviewHint: '选项是否来自候选；目标时长是否与模式、关卡设计匹配'
  },
  /*
   * 2026-10-28 补：游戏里的「物理」多数不是刚体，而是**判定**。
   * 判定形状、无敌帧、霸体是手感的地基，属于设计侧必须定的约定；
   * 物理引擎参数（摩擦/弹性/约束）才是实现层，不进设计文档。
   */
  {
    key: 'hit_detection',
    label: '命中判定',
    kind: 'pipeList',
    columns: [
      { key: 'attack', label: '攻击类型' },
      { key: 'shape', label: '判定形状' },
      { key: 'iframe', label: '无敌帧' },
      { key: 'super_armor', label: '霸体规则' }
    ],
    aiHint:
      '每行一类攻击（普攻/技能/范围/投射物，3–6 行）：攻击类型|判定形状（射线/盒/球/胶囊 + 尺寸与挂点）|无敌帧（起止或时长，没有就写「无」）|霸体规则（什么动作不被打断，没有就写「无」）；这是判定约定，不是物理引擎参数',
    reviewHint:
      '每类攻击是否有判定形状；无敌帧与霸体是否写清（「无」也要写）；判定形状能否支撑战斗节奏（快节奏却用大盒判定会「打空气也中」）'
  },
  {
    key: 'team_formation',
    label: '队伍编排',
    kind: 'textarea',
    aiHint: '一段概述：队伍编排的设计目标与策略空间；具体阵容与站位走「要点」字段',
    reviewHint: '本体是否只讲目标；要点是否给出人数、站位与推荐阵容'
  },
  {
    key: 'pvp_design',
    label: 'PVP 设计',
    kind: 'textarea',
    aiHint: '一段概述：PVP 模式的定位与公平性方针；匹配、奖励等规则条目走「要点」字段',
    reviewHint: '本体是否只讲定位与方针；要点是否覆盖匹配规则与奖励'
  },
  {
    key: 'pve_design',
    label: 'PVE 设计',
    kind: 'textarea',
    aiHint: '一段概述：PVE 内容的定位与难度曲线思路；关卡类型条目走「要点」字段',
    reviewHint: '本体是否只讲定位与思路；要点是否覆盖关卡类型与目标'
  },
  {
    key: 'boss_mechanics',
    label: 'Boss 战机制',
    kind: 'textarea',
    aiHint: '一段概述：Boss 战的设计目标与机制风格；具体机制条目走「要点」字段',
    reviewHint: '本体是否只讲目标与风格；要点是否覆盖阶段与应对手段'
  },
  {
    key: 'balance_strategy',
    label: '平衡策略',
    kind: 'textarea',
    aiHint: '一段概述：数值平衡的总体原则与调优机制；具体指标条目走「要点」字段',
    reviewHint: '本体是否只讲原则；要点是否列出可量化指标与调优周期'
  },
  {
    key: 'combat_progression',
    label: '战斗成长',
    kind: 'textarea',
    aiHint: '战斗侧成长曲线：角色战力随等级/装备/技能的变化节点，给 3-5 个关键等级的战力区间与新增战斗手段；具体公式在第八章',
    reviewHint: '成长节点是否能被关卡内容体验到；是否出现某阶段没有新手段；是否与数值章公式同一套符号'
  }
]

export const COMBAT_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  skill_system: {
    points: {
      aiHint: '3-6 条：技能分类、代表技能、消耗与冷却量级、解锁节奏',
      reviewHint: '条目是否可逐条核对；与本体的概述是否重复'
    },
    notes: {
      aiHint: '技能设计思路、参考作品等要点之外的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  buff_debuff: {
    points: {
      aiHint: '3-6 条：主要 Buff/Debuff 类型、持续时长、叠加与驱散规则',
      reviewHint: '条目是否可逐条核对；持续与叠加规则是否明确可执行'
    },
    notes: {
      aiHint: '与技能、装备联动的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  element_system: {
    points: {
      aiHint: '3-6 条：元素种类、相克关系、反应结果与技能伤害联动方式',
      reviewHint: '条目是否可逐条核对；元素关系是否闭环自洽'
    },
    notes: {
      aiHint: '元素与技能、伤害计算联动的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  team_formation: {
    points: {
      aiHint: '3-6 条：队伍人数、站位规则、职业搭配、推荐阵容与羁绊效果',
      reviewHint: '条目是否可逐条核对；站位与职业是否产生策略差异'
    },
    notes: {
      aiHint: '站位示例、与角色章联动的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  pvp_design: {
    points: {
      aiHint: '3-6 条：模式玩法、匹配规则、段位与奖励、防作弊措施',
      reviewHint: '条目是否可逐条核对；匹配规则是否可执行、奖励是否防刷'
    },
    notes: {
      aiHint: '赛季安排、社交压力处理的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  pve_design: {
    points: {
      aiHint: '3-6 条：关卡类型、难度曲线、通关目标与奖励',
      reviewHint: '条目是否可逐条核对；难度曲线是否递增、关卡类型是否至少 2 种'
    },
    notes: {
      aiHint: '关卡与战斗节奏配合关系的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  boss_mechanics: {
    points: {
      aiHint: '3-6 条：Boss 阶段、技能机制要点、玩家应对策略',
      reviewHint: '条目是否可逐条核对；阶段转换是否明确、每个机制是否有应对手段'
    },
    notes: {
      aiHint: 'Boss 背景与演出联动的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  balance_strategy: {
    points: {
      aiHint: '3-6 条：平衡原则、可量化指标、调优周期、PVP 与 PVE 分目标',
      reviewHint: '条目是否可逐条核对；指标是否可量化、PVP 与 PVE 目标是否分开'
    },
    notes: {
      aiHint: '数据来源、历史调优案例的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  }
}

export const COMBAT_DEFAULTS: ChapterData = {
  combat_mode: '',
  damage_formula: '',
  skill_system: '',
  buff_debuff: '',
  element_system: '',
  combat_pace: '',
  hit_detection: [],
  team_formation: '',
  pvp_design: '',
  pve_design: '',
  boss_mechanics: '',
  combat_progression: '',
  balance_strategy: ''
}

export const COMBAT_TEMPLATES: ChapterTemplate[] = [
  {
    name: '仙侠即时战斗',
    description: '即时动作 + 仙侠技能 + 剑心系统的战斗设计',
    tags: [
      '仙侠',
      '即时',
      '动作'
    ],
    data: {
      combat_mode: 'realtime',
      damage_formula: '伤害 = (攻击 × 技能倍率 - 防御 × 0.5) × (1 + 暴击率 × 暴击伤害) × 五行克制',
      skill_system: '普攻 + 4 主动技能 + 1 大招 + 剑心技能（觉醒）；技能可通过修炼升级',
      buff_debuff: 'Buff：剑意、灵气护体；Debuff：中毒、灼烧、定身、心魔',
      element_system: '五行（金木水火土）相生相克，克制关系造成 1.5x 伤害',
      combat_pace: '中等节奏，平均战斗时长 30-60 秒（小怪）/ 3-5 分钟（Boss）',
      team_formation: '主角 + 2 队友，可切换控制；队友 AI 自动战斗',
      pvp_design: '1v1 竞技场 + 3v3 团战；公平模式（属性平衡）+ 开放模式（带装备）',
      pve_design: '主线战斗 + 秘境副本 + Boss 战 + 挑战模式',
      boss_mechanics: '多阶段 + 弱点机制 + QTE 处决；Boss 有独特 AI 行为模式',
      combat_progression: '新手：教学战 → 简单；中期：组合技；后期：高难度 Boss 战',
      balance_strategy: 'PVE 数值宽松，PVP 严格平衡；定期根据数据调整'
    }
  },
  {
    name: '回合制战棋',
    description: '经典回合制战棋战斗设计',
    tags: [
      '回合制',
      '战棋',
      '策略'
    ],
    data: {
      combat_mode: 'turn_based',
      damage_formula: '伤害 = 攻击 × 技能倍率 × (1 - 防御 / (防御 + 100)) × 地形加成',
      skill_system: '主动技能 + 被动技能 + 必杀技；技能点(SP)系统',
      buff_debuff: 'Buff：攻击提升、防御提升；Debuff：中毒、沉默、眩晕',
      element_system: '光暗水火土五系，相克 1.3x',
      combat_pace: '慢节奏，每回合 30 秒决策；平均战斗 10-15 回合',
      team_formation: '5 人小队，按速度排序行动；位置影响技能范围',
      pvp_design: '异步对战 + 排位赛；同等级属性对战',
      pve_design: '剧情战 + 挑战关卡 + 无尽模式',
      boss_mechanics: '多阶段 + 召唤小弟 + 机制技能（如沉默全场）',
      combat_progression: '教学：单角色 → 3 人队 → 5 人队 → 高难度挑战',
      balance_strategy: '严格数值平衡；PVE/PVP 分离数值'
    }
  }
]

export const COMBAT_SCHEMA: ChapterSchema = {
  fields: COMBAT_FIELDS,
  splits: [
  'skill_system',
  'buff_debuff',
  'element_system',
  'team_formation',
  'pvp_design',
  'pve_design',
  'boss_mechanics',
  'balance_strategy',
  'combat_progression'
],
  splitHints: COMBAT_SPLIT_HINTS,
  defaults: COMBAT_DEFAULTS,
  templates: COMBAT_TEMPLATES
}
