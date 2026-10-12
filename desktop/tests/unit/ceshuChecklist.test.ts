import { describe, expect, it } from 'vitest'

import type { CeshuDocument } from '../../src/shared/ceshuConstants'
import {
  ALL_CATEGORIES,
  CATEGORY_DESIGN,
  CATEGORY_MARKET,
  CATEGORY_PROJECT,
  CATEGORY_RISK,
  CATEGORY_TEAM,
  CATEGORY_TECH,
  STATUS_FAIL,
  STATUS_MANUAL,
  STATUS_PASS,
  STATUS_WARNING,
  buildChecklistMarkdown,
  getChecklistItems,
  getChecklistItemsByCategory,
  runChecklist,
  type ChecklistReport
} from '../../src/shared/ceshu/ceshuChecklist'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

function makeDoc(name = '清单测试'): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name })
}

function resultOf(report: ChecklistReport, itemId: string): { status: string; message: string } {
  const result = report.results.find((item) => item.item_id === itemId)
  if (!result) throw new Error(`未找到检查项 ${itemId}`)
  return result
}

describe('GDD 检查清单：项定义（匹平 Python ceshu_checklist）', () => {
  it('共 50 项，6 大类分布 8/12/8/8/6/8', () => {
    expect(getChecklistItems()).toHaveLength(50)
    expect(ALL_CATEGORIES).toHaveLength(6)
    expect(getChecklistItemsByCategory(CATEGORY_PROJECT)).toHaveLength(8)
    expect(getChecklistItemsByCategory(CATEGORY_DESIGN)).toHaveLength(12)
    expect(getChecklistItemsByCategory(CATEGORY_TECH)).toHaveLength(8)
    expect(getChecklistItemsByCategory(CATEGORY_MARKET)).toHaveLength(8)
    expect(getChecklistItemsByCategory(CATEGORY_TEAM)).toHaveLength(6)
    expect(getChecklistItemsByCategory(CATEGORY_RISK)).toHaveLength(8)
  })

  it('必需 32 项、人工核查 13 项，每项 id 唯一且自动检查名均已注册', () => {
    const items = getChecklistItems()
    expect(new Set(items.map((item) => item.id)).size).toBe(50)
    expect(items.filter((item) => item.required)).toHaveLength(32)
    const manual = items.filter((item) => item.auto_check === null)
    expect(manual).toHaveLength(13)
    // 人工核查项覆盖 GD-11/GD-12/TC-08/TM-01..06/RS-05..08
    expect(manual.map((item) => item.id).sort()).toEqual(
      ['GD-11', 'GD-12', 'RS-05', 'RS-06', 'RS-07', 'RS-08', 'TC-08', 'TM-01', 'TM-02', 'TM-03', 'TM-04', 'TM-05', 'TM-06'].sort()
    )
    // 全部自动检查项都应有结果产出（未注册会退化为 warning「未注册的检查函数」）
    const report = runChecklist(makeDoc())
    expect(report.results.filter((item) => item.message.includes('未注册的检查函数'))).toHaveLength(0)
  })
})

describe('GDD 检查清单：默认文档结果（精确数字）', () => {
  it('新建文档（仅填游戏名）：通过 2 / 失败 30 / 警告 5 / 人工 13，就绪度 5.4，未就绪', () => {
    const report = runChecklist(makeDoc())
    expect(report.total_items).toBe(50)
    expect(report.passed).toBe(2)
    expect(report.failed).toBe(30)
    expect(report.warnings).toBe(5)
    expect(report.manual).toBe(13)
    expect(report.not_applicable).toBe(0)
    expect(report.readiness_score).toBe(5.4)
    expect(report.is_production_ready).toBe(false)
  })

  it('单项状态与文案：游戏名通过 / 平台失败 / 标签警告 / 系统依赖通过 / 人工核查', () => {
    const report = runChecklist(makeDoc())
    expect(resultOf(report, 'PB-01')).toMatchObject({ status: STATUS_PASS, message: '游戏名称: 清单测试' })
    expect(resultOf(report, 'PB-03')).toMatchObject({ status: STATUS_FAIL, message: '目标平台未设置' })
    expect(resultOf(report, 'PB-08')).toMatchObject({
      status: STATUS_WARNING,
      message: '项目标签未设置（建议补充以便检索）'
    })
    expect(resultOf(report, 'GD-06')).toMatchObject({ status: STATUS_PASS, message: '已启用系统的依赖均满足' })
    expect(resultOf(report, 'TM-01').status).toBe(STATUS_MANUAL)
    expect(resultOf(report, 'TM-01').message).toContain('请人工核查：')
    expect(resultOf(report, 'GD-05')).toMatchObject({ status: STATUS_FAIL, message: '未启用任何游戏系统' })
    expect(resultOf(report, 'MK-06')).toMatchObject({ status: STATUS_WARNING, message: '内购设计未规划' })
    expect(resultOf(report, 'RS-04')).toMatchObject({ status: STATUS_WARNING, message: '支持语言列表为空' })
  })

  it('系统启用数量：1 个警告、3 个通过；依赖缺失报出缺失明细', () => {
    const doc = makeDoc()
    ;(doc.systems.battle as { enabled: boolean }).enabled = true
    let report = runChecklist(doc)
    expect(resultOf(report, 'GD-05').status).toBe(STATUS_WARNING)
    expect(resultOf(report, 'GD-05').message).toBe('仅启用 1 个系统，建议至少 3 个核心系统')
    expect(resultOf(report, 'GD-06')).toMatchObject({
      status: STATUS_FAIL,
      message: '依赖缺失: battle 缺少 character,skill'
    })

    ;(doc.systems.character as { enabled: boolean }).enabled = true
    ;(doc.systems.skill as { enabled: boolean }).enabled = true
    report = runChecklist(doc)
    expect(resultOf(report, 'GD-05')).toMatchObject({ status: STATUS_PASS, message: '已启用 3 个游戏系统' })
    expect(resultOf(report, 'GD-06')).toMatchObject({ status: STATUS_PASS, message: '已启用系统的依赖均满足' })
  })

  it('阈值语义：设计愿景 <30 字警告、差异化 <15 字警告、陆标截断加省略号', () => {
    const doc = makeDoc()
    doc.vision.design_vision = '太短了'
    doc.vision.differentiation = '偏短'
    doc.meta.positioning = 'A'.repeat(70)
    const report = runChecklist(doc)
    expect(resultOf(report, 'PB-05')).toMatchObject({ status: STATUS_WARNING, message: '设计愿景偏短（3 字），建议扩充至 200 字以上' })
    expect(resultOf(report, 'PB-06')).toMatchObject({ status: STATUS_WARNING, message: '差异化亮点偏短，建议细化核心卖点' })
    expect(resultOf(report, 'PB-04').message).toBe(`项目定位: ${'A'.repeat(60)}...`)
  })

  it('各章必填补齐后新增通过项（含数组/字典类字段）', () => {
    const doc = makeDoc()
    doc.meta.game_type = 'RPG'
    doc.meta.platform = ['PC', '移动']
    doc.meta.positioning = '定位'
    doc.meta.tags = ['rpg']
    doc.story.architecture = '架构'
    doc.story.main_plot = '主线'
    doc.story.protagonist = '主角'
    doc.story.main_npc_count = 3
    doc.story.npc_list = [{ name: 'NPC1' }]
    doc.market_analysis.kpi_forecast = { dau: 1000 }
    doc.resources.budget = { total: '100万' }
    doc.risk_handling.risk_matrix = [{ risk: '进度' }]
    doc.risk_handling.contingency_plan = '预案'
    doc.audio.sfx_count = 50
    doc.audio.music_style = '史诗管弦'
    const report = runChecklist(doc)
    expect(resultOf(report, 'PB-02').message).toBe('游戏类型: RPG')
    expect(resultOf(report, 'PB-03').message).toBe('目标平台: PC, 移动')
    expect(resultOf(report, 'GD-01')).toMatchObject({ status: STATUS_PASS, message: '世界观架构与主线剧情已建立' })
    expect(resultOf(report, 'GD-02')).toMatchObject({ status: STATUS_PASS, message: '主角已定义，NPC 数量=3' })
    expect(resultOf(report, 'MK-08')).toMatchObject({ status: STATUS_PASS, message: 'KPI 已制定（1 项指标）' })
    expect(resultOf(report, 'RS-01')).toMatchObject({ status: STATUS_PASS, message: '风险矩阵已建立（1 项风险）' })
    expect(resultOf(report, 'RS-03')).toMatchObject({ status: STATUS_PASS, message: '资源需求已评估' })
    expect(resultOf(report, 'GD-09')).toMatchObject({ status: STATUS_PASS, message: '音乐风格: 史诗管弦' })
  })
})

describe('GDD 检查清单：Markdown 报告', () => {
  it('含标题/统计/6 大类表格，并转义标题与消息中的竖线', () => {
    const doc = makeDoc()
    doc.meta.positioning = '定位 | 含竖线'
    const report = runChecklist(doc)
    const markdown = buildChecklistMarkdown('清单测试', report, '2026-10-01 12:00:00')
    expect(markdown).toContain('# GDD 完备性检查报告')
    expect(markdown).toContain('**生成时间**: 2026-10-01 12:00:00')
    expect(markdown).toContain('**游戏名称**: 清单测试')
    expect(markdown).toContain('**就绪状态**: ❌ 未就绪')
    expect(markdown).toContain('**就绪度评分**: 8.1 / 100')
    expect(markdown).toContain('- 总检查项: 50')
    expect(markdown).toContain('- 人工核查: 13')
    for (const category of ALL_CATEGORIES) {
      expect(markdown).toContain(`## ${category}`)
    }
    expect(markdown).toContain('| 状态 | 标题 | 类型 | 检查消息 |')
    expect(markdown).toContain('| ✅ 通过 | 游戏名称已确定 | 必需 | 游戏名称: 清单测试 |')
    expect(markdown).toContain('定位 \\| 含竖线')
    expect(markdown).not.toContain('定位 | 含竖线')
  })
})