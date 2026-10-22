import type { ChapterFieldHints } from './types'

/**
 * 第六章·经济系统设计的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：经济系统最怕产出回收失衡、货币兑换矛盾与自造数值，
 * 契约要求数值成对出现、兑换关系闭环；通胀控制目标依赖运营数据，标人定不交 AI。
 *
 * P1 三件套拆分（2026-10-23）：production_chain / market_design / inflation_control /
 * economic_goals 四个 textarea 拆为「本体 + 要点 + 补充」。拆分后 inflation_control
 * 由人写长文改为 AI 起草要点、人核对，故取消 P0 的 aiDraftable=false。
 */
export const ECONOMY_FIELD_HINTS: ChapterFieldHints = {
  currency_types: {
    aiHint: '每行一种货币，按名称/产出/回收/兑换率四列填写；货币间兑换关系需闭环',
    reviewHint: '是否至少一种货币；四列是否齐全；兑换率之间是否矛盾'
  },
  source_sink: {
    aiHint: '列出主要产出途径与回收途径各至少 3 条，并标注单次获取的数值区间',
    reviewHint: '产出与回收是否配平；是否有具体数值；是否与货币类型一一对应'
  },
  drop_tables: {
    aiHint: '每行一个掉落项，格式为「物品|来源|概率」；同来源概率总和需接近 100%',
    reviewHint: '格式是否统一；概率是否注明；必掉项是否有说明'
  },
  production_chain: {
    aiHint: '一段概述：生产链的定位与经济闭环思路；具体链条条目走「要点」字段',
    reviewHint: '本体是否只讲定位与思路；要点是否给出各环耗时与消耗'
  },
  production_chain_points: {
    aiHint: '3-6 条：原材料、加工环节、成品及每环耗时与消耗',
    reviewHint: '条目是否可逐条核对；链条是否闭环、成品是否挂钩货币回收'
  },
  production_chain_notes: {
    aiHint: '链条与货币回收联动的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  market_design: {
    aiHint: '一段概述：交易系统的定位与设计原则；交易方式等规则条目走「要点」字段',
    reviewHint: '本体是否只讲定位与原则；要点是否覆盖交易方式与定价机制'
  },
  market_design_points: {
    aiHint: '3-6 条：交易方式、手续费、价格形成机制、防线下交易措施',
    reviewHint: '条目是否可逐条核对；交易方式是否明确、定价来源是否说明'
  },
  market_design_notes: {
    aiHint: '经济监控、商人玩法的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  inflation_control: {
    // P1 拆分后改为 AI 起草要点、人核对阈值；运营数据判断仍由人在「补充」里写
    aiHint: '一段概述：通胀控制的总体思路；控制手段与阈值条目走「要点」字段',
    reviewHint: '控制手段与阈值是否具体；是否与产出回收数据挂钩；是否有监测指标'
  },
  inflation_control_points: {
    aiHint: '3-6 条：控制手段、具体阈值、监测指标与触发动作',
    reviewHint: '条目是否可逐条核对；阈值是否有运营数据依据'
  },
  inflation_control_notes: {
    aiHint: '运营数据来源、历史曲线判断的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  economic_goals: {
    aiHint: '一段概述：经济系统的健康愿景；可量化目标条目走「要点」字段',
    reviewHint: '本体是否只讲愿景；要点是否给出目标数值与健康区间'
  },
  economic_goals_points: {
    aiHint: '3-6 条：经济目标名称、目标数值与健康区间',
    reviewHint: '条目是否可逐条核对；目标是否可量化、是否与产出回收匹配'
  },
  economic_goals_notes: {
    aiHint: '目标测算依据的补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  }
}
