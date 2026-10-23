import type { ChapterSchema } from './types'
import { f } from './types'

/**
 * 第六章·经济系统设计的按章 schema（档 4 合并试点，2026-10-24）。
 *
 * 原数据来自三处，现收进单文件：
 * - 字段定义：`ceshuFields.ts` 的 `BASE_CHAPTER_FIELDS.economy`（内联）
 * - 契约：`cesuFieldHints/economy.ts` 的 `ECONOMY_FIELD_HINTS`
 * - 拆分：`ceshuFieldSplits/economy.ts` 的 `ECONOMY_FIELD_SPLITS`
 *
 * `toFieldHints(ECONOMY_SCHEMA)` 派生出的契约表与旧 `ECONOMY_FIELD_HINTS` 等价
 * （仅把原本内联在 def 上的 ledger 契约也并入 map，合并时幂等、最终字段零变化）。
 */
export const ECONOMY_FIELDS = [
  f('currency_types', '货币类型', 'pipeList', {
    columns: [
      { key: 'name', label: '名称' },
      { key: 'source', label: '产出' },
      { key: 'sink', label: '回收' },
      { key: 'exchange_rate', label: '兑换率' }
    ],
    aiHint: '每行一种货币，按名称/产出/回收/兑换率四列填写；货币间兑换关系需闭环',
    reviewHint: '是否至少一种货币；四列是否齐全；兑换率之间是否矛盾'
  }),
  f('source_sink', '产出与回收', 'textarea', {
    aiHint: '列出主要产出途径与回收途径各至少 3 条，并标注单次获取的数值区间',
    reviewHint: '产出与回收是否配平；是否有具体数值；是否与货币类型一一对应'
  }),
  f('drop_tables', '掉落表', 'stringList', {
    placeholder: '每行一个',
    aiHint: '每行一个掉落项，格式为「物品|来源|概率」；同来源概率总和需接近 100%',
    reviewHint: '格式是否统一；概率是否注明；必掉项是否有说明'
  }),
  f('production_chain', '生产链', 'textarea', {
    aiHint: '一段概述：生产链的定位与经济闭环思路；具体链条条目走「要点」字段',
    reviewHint: '本体是否只讲定位与思路；要点是否给出各环耗时与消耗'
  }),
  f('market_design', '交易市场', 'textarea', {
    aiHint: '一段概述：交易系统的定位与设计原则；交易方式等规则条目走「要点」字段',
    reviewHint: '本体是否只讲定位与原则；要点是否覆盖交易方式与定价机制'
  }),
  f('inflation_control', '通胀控制', 'textarea', {
    aiHint: '一段概述：通胀控制的总体思路；控制手段与阈值条目走「要点」字段',
    reviewHint: '控制手段与阈值是否具体；是否与产出回收数据挂钩；是否有监测指标'
  }),
  f('economic_goals', '经济目标', 'textarea', {
    aiHint: '一段概述：经济系统的健康愿景；可量化目标条目走「要点」字段',
    reviewHint: '本体是否只讲愿景；要点是否给出目标数值与健康区间'
  }),
  f('ledger', '经济账本（逐笔对账）', 'pipeList', {
    placeholder: '账本|初始|交易|期末期望|允许为负',
    aiHint:
      '用一笔**具体交易**验证经济闭环：初始值 + 逐笔交易（逗号分隔，如 4,4,-5）= 期末期望；机器会逐笔求和与期末期望对账，不符即报错。交易必须是玩家真实会经历的那几笔（如首局两次击杀 → 首次升级）',
    reviewHint: '交易顺序是否与新手路径一致；期末期望是否与正文数字一致；允许为负是否有明确理由'
  }),
  f('metrics_tracking', '经济监控指标', 'pipeList', { placeholder: '指标|口径|告警阈值' }),
  f('seasonal_adjustment', '赛季调整', 'textarea')
]

export const ECONOMY_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  production_chain: {
    points: {
      aiHint: '3-6 条：原材料、加工环节、成品及每环耗时与消耗',
      reviewHint: '条目是否可逐条核对；链条是否闭环、成品是否挂钩货币回收'
    },
    notes: {
      aiHint: '链条与货币回收联动的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  market_design: {
    points: {
      aiHint: '3-6 条：交易方式、手续费、价格形成机制、防线下交易措施',
      reviewHint: '条目是否可逐条核对；交易方式是否明确、定价来源是否说明'
    },
    notes: {
      aiHint: '经济监控、商人玩法的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  inflation_control: {
    points: {
      aiHint: '3-6 条：控制手段、具体阈值、监测指标与触发动作',
      reviewHint: '条目是否可逐条核对；阈值是否有运营数据依据'
    },
    notes: {
      aiHint: '运营数据来源、历史曲线判断的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  },
  economic_goals: {
    points: {
      aiHint: '3-6 条：经济目标名称、目标数值与健康区间',
      reviewHint: '条目是否可逐条核对；目标是否可量化、是否与产出回收匹配'
    },
    notes: {
      aiHint: '目标测算依据的补充说明，可留空',
      reviewHint: '是否只放补充信息，没有把要点又抄一遍'
    }
  }
}

export const ECONOMY_SCHEMA: ChapterSchema = {
  fields: ECONOMY_FIELDS,
  splits: ['production_chain', 'market_design', 'inflation_control', 'economic_goals', 'seasonal_adjustment'],
  splitHints: ECONOMY_SPLIT_HINTS
}
