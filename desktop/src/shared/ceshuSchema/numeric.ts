/**
 * 章节 `numeric` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

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
    aiHint: '每行一个公式，格式统一'
  },
  {
    key: 'core_formulas_notes',
    label: '核心公式·补充',
    kind: 'textarea',
    aiHint: '公式之外的说明，可留空'
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
    placeholder: '物品|来源|公式'
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

export const NUMERIC_SCHEMA: ChapterSchema = {
  fields: NUMERIC_FIELDS,
  splits: [
  'economic_model'
],
  splitHints: NUMERIC_SPLIT_HINTS
}
