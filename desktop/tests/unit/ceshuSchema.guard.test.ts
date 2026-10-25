import { describe, expect, it } from 'vitest'

import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshuFields'
import { FIELD_SPLITS } from '../../src/shared/ceshuSchema'
import { CHAPTER_KEYS } from '../../src/shared/ceshuConstants'

/**
 * 档 4（字段定义合并为按章 schema）的结构守卫。
 *
 * 合并是纯机械搬迁（数据同形态迁入 ceshuSchema/<章>.ts），绝不允许改变
 * 最终产出的字段总数 / 每章字段数 / 每章拆分数，以及合并后字段数组本身。
 * 任一字段被漏迁、错迁、重复迁，这里都会红。
 */

/** 迁移前（2026-10-24）捕获的全表字段总数基线 */
const BASELINE_TOTAL_FIELDS = 334

/** 迁移前捕获的每章字段数基线（key 顺序无关，用于深度比较） */
const BASELINE_PER_CHAPTER: Record<string, number> = {
  meta: 10, vision: 8, story: 25, gameplay: 11, systems: 0, combat: 32, economy: 20, numeric: 12,
  art: 17, audio: 16, tech: 14, resources: 13, market_analysis: 15, risk_handling: 14, mvp: 18,
  monetization: 21, accessibility: 22, uiux: 8, level_design: 10, live_ops: 7, analytics: 7,
  qa: 10, publishing: 12, performance: 12
}

/** 迁移前捕获的每章拆分清单长度基线 */
const BASELINE_SPLIT_COUNTS: Record<string, number> = {
  meta: 0, vision: 0, story: 2, gameplay: 1, systems: 0, combat: 9, economy: 5, numeric: 1,
  art: 4, audio: 3, tech: 3, resources: 2, market_analysis: 4, risk_handling: 2, mvp: 3,
  monetization: 5, accessibility: 6, uiux: 0, level_design: 1, live_ops: 0, analytics: 0,
  qa: 0, publishing: 1, performance: 2
}

describe('档 4 合并结构守卫', () => {
  it('全表字段总数不变量', () => {
    let total = 0
    for (const ch of CHAPTER_KEYS) total += (CESHU_CHAPTER_FIELDS[ch] ?? []).length
    expect(total).toBe(BASELINE_TOTAL_FIELDS)
  })

  it('每章字段数不变量', () => {
    const actual: Record<string, number> = {}
    for (const ch of CHAPTER_KEYS) actual[ch] = (CESHU_CHAPTER_FIELDS[ch] ?? []).length
    expect(actual).toEqual(BASELINE_PER_CHAPTER)
  })

  it('每章拆分清单长度不变量', () => {
    const actual: Record<string, number> = {}
    for (const ch of CHAPTER_KEYS) actual[ch] = (FIELD_SPLITS[ch] ?? []).length
    expect(actual).toEqual(BASELINE_SPLIT_COUNTS)
  })

  it('economy 合并后字段数组逐字节等于迁移前基线（试点章最强守卫）', () => {
    const expected = JSON.parse(
      '[{"key":"currency_types","label":"货币类型","kind":"pipeList","columns":[{"key":"name","label":"名称"},{"key":"source","label":"产出"},{"key":"sink","label":"回收"},{"key":"exchange_rate","label":"兑换率"}],"aiHint":"每行一种货币，按名称/产出/回收/兑换率四列填写；货币间兑换关系需闭环","reviewHint":"是否至少一种货币；四列是否齐全；兑换率之间是否矛盾"},{"key":"source_sink","label":"产出与回收","kind":"textarea","aiHint":"列出主要产出途径与回收途径各至少 3 条，并标注单次获取的数值区间","reviewHint":"产出与回收是否配平；是否有具体数值；是否与货币类型一一对应"},{"key":"drop_tables","label":"掉落表","kind":"stringList","placeholder":"每行一个","aiHint":"每行一个掉落项，格式为「物品|来源|概率」；同来源概率总和需接近 100%","reviewHint":"格式是否统一；概率是否注明；必掉项是否有说明"},{"key":"production_chain","label":"生产链","kind":"textarea","aiHint":"一段概述：生产链的定位与经济闭环思路；具体链条条目走「要点」字段","reviewHint":"本体是否只讲定位与思路；要点是否给出各环耗时与消耗"},{"key":"production_chain_points","label":"生产链·要点","kind":"stringList","placeholder":"每行一条要点","aiHint":"3-6 条：原材料、加工环节、成品及每环耗时与消耗","reviewHint":"条目是否可逐条核对；链条是否闭环、成品是否挂钩货币回收"},{"key":"production_chain_notes","label":"生产链·补充","kind":"textarea","aiHint":"链条与货币回收联动的补充说明，可留空","reviewHint":"是否只放补充信息，没有把要点又抄一遍"},{"key":"market_design","label":"交易市场","kind":"textarea","aiHint":"一段概述：交易系统的定位与设计原则；交易方式等规则条目走「要点」字段","reviewHint":"本体是否只讲定位与原则；要点是否覆盖交易方式与定价机制"},{"key":"market_design_points","label":"交易市场·要点","kind":"stringList","placeholder":"每行一条要点","aiHint":"3-6 条：交易方式、手续费、价格形成机制、防线下交易措施","reviewHint":"条目是否可逐条核对；交易方式是否明确、定价来源是否说明"},{"key":"market_design_notes","label":"交易市场·补充","kind":"textarea","aiHint":"经济监控、商人玩法的补充说明，可留空","reviewHint":"是否只放补充信息，没有把要点又抄一遍"},{"key":"inflation_control","label":"通胀控制","kind":"textarea","aiHint":"一段概述：通胀控制的总体思路；控制手段与阈值条目走「要点」字段","reviewHint":"控制手段与阈值是否具体；是否与产出回收数据挂钩；是否有监测指标"},{"key":"inflation_control_points","label":"通胀控制·要点","kind":"stringList","placeholder":"每行一条要点","aiHint":"3-6 条：控制手段、具体阈值、监测指标与触发动作","reviewHint":"条目是否可逐条核对；阈值是否有运营数据依据"},{"key":"inflation_control_notes","label":"通胀控制·补充","kind":"textarea","aiHint":"运营数据来源、历史曲线判断的补充说明，可留空","reviewHint":"是否只放补充信息，没有把要点又抄一遍"},{"key":"economic_goals","label":"经济目标","kind":"textarea","aiHint":"一段概述：经济系统的健康愿景；可量化目标条目走「要点」字段","reviewHint":"本体是否只讲愿景；要点是否给出目标数值与健康区间"},{"key":"economic_goals_points","label":"经济目标·要点","kind":"stringList","placeholder":"每行一条要点","aiHint":"3-6 条：经济目标名称、目标数值与健康区间","reviewHint":"条目是否可逐条核对；目标是否可量化、是否与产出回收匹配"},{"key":"economic_goals_notes","label":"经济目标·补充","kind":"textarea","aiHint":"目标测算依据的补充说明，可留空","reviewHint":"是否只放补充信息，没有把要点又抄一遍"},{"key":"ledger","label":"经济账本（逐笔对账）","kind":"pipeList","placeholder":"账本|初始|交易|期末期望|允许为负","aiHint":"用一笔**具体交易**验证经济闭环：初始值 + 逐笔交易（逗号分隔，如 4,4,-5）= 期末期望；机器会逐笔求和与期末期望对账，不符即报错。交易必须是玩家真实会经历的那几笔（如首局两次击杀 → 首次升级）","reviewHint":"交易顺序是否与新手路径一致；期末期望是否与正文数字一致；允许为负是否有明确理由"},{"key":"metrics_tracking","label":"经济监控指标","kind":"pipeList","placeholder":"指标|口径|告警阈值","aiHint":"3-5 个经济监控指标，每行「指标（如通胀率/人均货币存量）|口径（怎么算）|告警阈值」；阈值要具体到数字并能触发人工干预","reviewHint":"口径是否能用埋点算出来；阈值是否具体到数字；是否与第十七章指标体系重复"},{"key":"seasonal_adjustment","label":"赛季调整","kind":"textarea","aiHint":"赛季/版本切换时的经济调整：新增什么产出与回收、上季资源如何处理（继承/折价/清空）、如何防囤积套利","reviewHint":"是否处理了老玩家囤积；是否会让新玩家吃亏；是否与货币类型、兑换率自洽"},{"key":"seasonal_adjustment_points","label":"赛季调整·要点","kind":"stringList","placeholder":"每行一条要点","aiHint":"3-6 条，每行一条可核对的要点","reviewHint":"条目是否具体可核对；与本体的概述是否重复"},{"key":"seasonal_adjustment_notes","label":"赛季调整·补充","kind":"textarea","aiHint":"要点之外的补充说明，可留空","reviewHint":"是否只放补充信息、没有把要点又抄一遍；该留空时是否确实留空"}]'
    )
    expect(CESHU_CHAPTER_FIELDS.economy).toEqual(expected)
  })
})
