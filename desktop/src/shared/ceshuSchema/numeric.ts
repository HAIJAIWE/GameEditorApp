/**
 * 章节 `numeric` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

export const NUMERIC_FIELDS: CeshuFieldDef[] = [
  {
    key: 'core_formulas',
    label: '核心公式',
    kind: 'textarea',
    placeholder: '核心数值公式，每行一个',
    aiHint: '每行一个核心数值公式；伤害公式属战斗章，此处不要重复',
    reviewHint: '公式是否自洽；是否与战斗章「伤害公式」重复'
  },
  {
    key: 'core_formulas_points',
    label: '核心公式·列表',
    kind: 'stringList',
    placeholder: '每行一个公式',
    aiHint: '每行一个公式，格式统一',
    reviewHint: '每行是否可直接代入计算；变量符号是否与伤害公式、成长公式一致'
  },
  {
    key: 'core_formulas_notes',
    label: '核心公式·补充',
    kind: 'textarea',
    aiHint: '公式之外的说明，可留空',
    reviewHint: '是否只放补充信息、没有把公式又抄一遍；该留空时是否确实留空'
  },
  {
    key: 'balance_principles',
    label: '平衡原则',
    kind: 'textarea',
    aiHint: '3-5 条平衡原则，每条一句：原则 + 量化表现（如「单次战斗时长 3-5 分钟」）',
    reviewHint: '原则是否可验证；与核心公式、战斗章数值是否自洽'
  },
  {
    key: 'economic_model',
    label: '经济模型',
    kind: 'textarea',
    aiHint: '一段概述：货币流转的数值模型与设计意图；公式与参数条目走「要点」字段，勿罗列',
    reviewHint: '变量是否都有定义；是否只写数值模型而未重复经济章的机制设计'
  },
  {
    key: 'growth_curves',
    label: '成长曲线',
    kind: 'pipeList',
    placeholder: '对象|曲线形状|参数',
    aiHint: '每行一个对象：曲线形状写「指数/线性/对数」；指数型参数写「基数,成长」（如 10,1.28）——导出时据此画对数坐标曲线图；参数写不清就不画图，不影响校验',
    reviewHint: '基数/成长是否与数值参数表一致；形状是否符合设计意图'
  },
  {
    key: 'drop_tables',
    label: '掉落公式',
    kind: 'pipeList',
    placeholder: '物品|来源|公式',
    aiHint: '3-6 条掉落配置，每行「物品|来源（怪物/宝箱/活动）|掉落公式（概率或权重）」；概率含保底机制，符号与核心公式同一套',
    reviewHint: '概率是否说得通（含保底）；是否给出期望产出（每 N 次一件）；是否与核心公式符号一致'
  },
  {
    key: 'numeric_parameters',
    label: '数值参数表',
    kind: 'pipeList',
    placeholder: '参数|当前值|合法范围|调高影响|调低影响',
    aiHint: '每个可调参数一行；标注「设计初值」还是「复算值」；合法范围给区间；影响写「调高/调低后玩法怎么变」（可观察的变化），不写「影响较大」这类空话',
    reviewHint: '参数是否与公式一致；范围是否有依据；影响是否可观察'
  },
  {
    key: 'numeric_assertions',
    label: '数值断言',
    kind: 'pipeList',
    placeholder: '断言|表达式|期望值|容差|接受条件',
    aiHint: '把「设计目标」写成可复算的断言：表达式用参数名（如 floor((层-1)/微光步长)），给期望值、容差与接受条件（==2 / ≥0 / between 9.5-10.6）；3-5 条，至少一条覆盖边界',
    reviewHint: '断言是否能在不改代码的情况下手算复现；期望值与正文数值是否一致'
  },
  {
    key: 'design_claims',
    label: '设计主张（claim→证据）',
    kind: 'pipeList',
    placeholder: '主张|强度|证据',
    aiHint: '每条设计主张一行：强度写「计算」时证据必须填**数值断言表里的断言名**（机器会复算并核对）；强度写「实测」时证据填验证方式（如 Demo 验收项）；强度写「假设」时证据填验证计划；无法给出证据的主张不要写',
    reviewHint: '每条主张是否挂了证据；「计算」类主张的证据是否真能支撑它；有没有该标「假设」却标成「计算」的'
  }
]

export const NUMERIC_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  economic_model: {
    points: {
      aiHint: '3-6 条：每条一个公式或参数定义（含变量含义与取值范围），引用须在本章或战斗章有定义',
      reviewHint: '公式是否可计算；变量是否都有定义；与战斗章/经济章是否重复'
    },
    notes: {
      aiHint: '公式推导过程或敏感性说明，可留空',
      reviewHint: '是否与「要点」里的公式重复；推导是否有依据'
    }
  }
}

export const NUMERIC_DEFAULTS: ChapterData = {
  core_formulas: '',
  growth_curves: [],
  drop_tables: [],
  economic_model: '',
  balance_principles: ''
}

export const NUMERIC_TEMPLATES: ChapterTemplate[] = [
  {
    name: 'RPG 经典数值公式',
    description: '等级 + 攻防 + 暴击的经典 RPG 数值体系',
    tags: [
      'RPG',
      '公式',
      '平衡'
    ],
    data: {
      core_formulas: '伤害 = (攻击力 - 防御力 × 0.6) × 技能倍率 × (1 + 暴击伤害 × 暴击率)\n经验需求 = 80 × 等级 ^ 1.5\n属性成长 = 基础值 × (1 + 等级 × 成长系数)',
      growth_curves: [
        {
          name: '等级-属性',
          curve: '线性 + 软上限'
        },
        {
          name: '经验-等级',
          curve: '幂函数 1.5'
        },
        {
          name: '金币-产出',
          curve: '对数增长'
        }
      ],
      drop_tables: [
        {
          item: '普通装备',
          rate: '30%',
          tier: '白'
        },
        {
          item: '稀有装备',
          rate: '5%',
          tier: '蓝'
        },
        {
          item: '传说装备',
          rate: '0.5%',
          tier: '橙'
        }
      ],
      economic_model: '金币产出 = 主线(40%) + 副本(30%) + 任务(20%) + 其他(10%)；金币回收 = 装备强化(50%) + 消耗品(30%) + 外观(20%)',
      balance_principles: '1) PVE 数值宽松，玩家体验优先\n2) PVP 数值严格控制，避免 P2W\n3) 长尾成长：满级后属性缓慢增长，避免数值膨胀'
    }
  },
  {
    name: '抽卡概率设计',
    description: '抽卡游戏的概率与保底数值设计',
    tags: [
      '抽卡',
      '概率',
      '保底'
    ],
    data: {
      core_formulas: 'SSR 概率 = 1%（基础）+ 累计 90 抽保底\nUP 角色 = 50% 大保底（180 抽必出）\n武器池 = 0.7% + 80 抽保底',
      growth_curves: [
        {
          name: '玩家留存-概率',
          curve: '前 50 抽高体验，后段回归基础概率'
        }
      ],
      drop_tables: [
        {
          item: 'SSR 角色',
          rate: '1%',
          tier: '金'
        },
        {
          item: 'SR 武器',
          rate: '8%',
          tier: '紫'
        },
        {
          item: 'R 材料',
          rate: '91%',
          tier: '蓝'
        }
      ],
      economic_model: '免费玩家月均获取 30 抽；付费玩家月均 100 抽；鲸鱼玩家月均 500+ 抽',
      balance_principles: '1) 保底机制透明公示\n2) 免费玩家可获取全部核心内容\n3) 付费仅加速进度，不锁定内容'
    }
  }
]

export const NUMERIC_SCHEMA: ChapterSchema = {
  fields: NUMERIC_FIELDS,
  splits: [
  'economic_model'
],
  splitHints: NUMERIC_SPLIT_HINTS,
  defaults: NUMERIC_DEFAULTS,
  templates: NUMERIC_TEMPLATES
}
