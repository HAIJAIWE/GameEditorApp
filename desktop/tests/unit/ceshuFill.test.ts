import { describe, expect, it } from 'vitest'

import type { CeshuDocument } from '../../src/shared/ceschu/ceshuConstants'
import { autoFillRequiredFields } from '../../src/shared/ceschu/ceshuFill'
import { createDefaultCeshu } from '../../src/shared/ceschu/ceshuModel'
import { runChecklist } from '../../src/shared/ceschu/ceshuChecklist'

function makeDoc(name = '填充测试'): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name })
}

describe('策划书自动填充（匹平 Python auto_fill_required_fields）', () => {
  it('默认文档填充 34 个空必填字段，且不修改原文档', () => {
    const doc = makeDoc()
    const { doc: filled, filled: count } = autoFillRequiredFields(doc)
    expect(count).toBe(34)
    // 原文档保持为空（纯函数，返回新对象）
    expect(doc.meta.positioning).toBe('')
    expect(doc.meta.tags).toEqual([])
    expect(filled.meta.positioning).toBe('填充测试 - RPG 类型项目')
  })

  it('填充值逐项对照 Python 规则', () => {
    const { doc: filled } = autoFillRequiredFields(makeDoc())
    expect(filled.meta.tags).toEqual(['rpg', '原创', '策划中'])
    expect(filled.vision.design_vision).toContain('打造一款具有差异化体验的RPG游戏')
    expect(filled.story.architecture).toContain('世界观架构待补充')
    expect(filled.gameplay.game_modes).toEqual(['主线剧情', '自由探索'])
    expect(filled.numeric.balance_principles).toBe('平衡原则：早期易上手、中期有深度、后期有目标')
    expect(filled.art.art_style).toBe('RPG 通用美术风格')
    expect(filled.tech.milestones).toEqual(['原型期', 'Alpha', 'Beta', '上线'])
    expect(filled.resources.budget).toEqual({ total: '', art: '', dev: '', marketing: '' })
    expect(filled.market_analysis.competitors).toEqual([{ name: '待补充竞品', type: '同类型' }])
    expect(filled.story.main_npc_count).toBe(5)
    expect(filled.combat.combat_mode).toBe('回合制') // game_type 缺省 RPG
    expect(filled.economy.currency_types).toEqual([{ name: '金币', source: '任务/掉落', sink: '商店购买' }])
    expect(filled.monetization.payment_model).toBe('f2p')
    expect(filled.mvp.mvp_timeline).toBe('MVP 时间线待补充：建议 3-6 个月')
    // risk_handling.risk_matrix 从 resources.risk_matrix 复制（第十六章 ← 第九章）
    expect(filled.resources.risk_matrix).toEqual([{ risk: '进度风险', level: '中', mitigation: '里程碑管控' }])
    expect(filled.risk_handling.risk_matrix).toEqual(filled.resources.risk_matrix)
    expect(filled.audio.music_style).toBe('与RPG 通用美术风格协调的音乐风格')
    expect(filled.audio.sfx_count).toBe(50)
    expect(filled.accessibility.language_list).toEqual(['简体中文'])
    expect(filled.accessibility.accessibility_features).toEqual(['色盲模式', '字幕', '键位自定义'])
  })

  it('非 RPG 类型 → 即时制战斗；已填字段不被覆盖', () => {
    const doc = makeDoc()
    doc.meta.game_type = 'FPS'
    doc.meta.positioning = '已有定位'
    const { doc: filled } = autoFillRequiredFields(doc)
    expect(filled.combat.combat_mode).toBe('即时制')
    expect(filled.art.art_style).toBe('FPS 通用美术风格')
    expect(filled.meta.tags).toEqual(['fps', '原创', '策划中'])
    expect(filled.meta.positioning).toBe('已有定位')
  })

  it('填充后检查清单就绪度提升：通过 24 / 失败 9 / 警告 4，就绪度 64.9', () => {
    const { doc: filled } = autoFillRequiredFields(makeDoc())
    const report = runChecklist(filled)
    expect(report.passed).toBe(24)
    expect(report.failed).toBe(9)
    expect(report.warnings).toBe(4)
    expect(report.manual).toBe(13)
    expect(report.readiness_score).toBe(64.9)
    // 自动填充不覆盖 game_type/platform/systems 等非必填补丁项，故仍未就绪
    expect(report.is_production_ready).toBe(false)
    // 未填的仍是：游戏类型/平台/系统启用/技术栈/性能目标/MVP 里程碑/成功标准/市场规模/KPI
    const failedIds = report.results.filter((item) => item.status === 'fail').map((item) => item.item_id)
    expect(failedIds.sort()).toEqual(['GD-05', 'MK-03', 'MK-08', 'PB-02', 'PB-03', 'TC-02', 'TC-03', 'TC-06', 'TC-07'].sort())
  })

  it('幂等：已填充文档再次填充为 0', () => {
    const { doc: filled } = autoFillRequiredFields(makeDoc())
    expect(autoFillRequiredFields(filled).filled).toBe(0)
  })
})