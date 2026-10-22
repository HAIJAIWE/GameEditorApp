import type { ChapterFieldHints } from './types'

/**
 * 第六章·经济系统设计的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：经济系统最怕产出回收失衡、货币兑换矛盾与自造数值，
 * 契约要求数值成对出现、兑换关系闭环；通胀控制目标依赖运营数据，标人定不交 AI。
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
    aiHint: '画出 1 条主生产链：原材料→加工→成品，注明每环耗时与消耗',
    reviewHint: '链条是否闭环；每环是否有时耗与消耗；成品是否挂钩货币回收'
  },
  market_design: {
    aiHint: '说明交易方式（玩家间/拍卖行/系统商店）、手续费与价格形成机制',
    reviewHint: '交易方式是否明确；手续费与定价来源是否说明；是否防线下交易'
  },
  inflation_control: {
    // 通胀目标与控制阈值依赖运营数据与历史曲线，必须由人确定，不交 AI 起草
    aiDraftable: false,
    reviewHint: '控制手段与阈值是否具体；是否与产出回收数据挂钩；是否有监测指标'
  },
  economic_goals: {
    aiHint: '列出 2-3 个可量化经济目标（如货币结余率、周流通量）及健康区间',
    reviewHint: '目标是否可量化；是否给出健康区间；是否与产出回收设计匹配'
  }
}
