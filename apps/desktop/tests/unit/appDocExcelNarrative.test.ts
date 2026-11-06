import { describe, expect, it } from 'vitest'

import { buildExcelWorkbook } from '../../src/main/ceshu/export/doc/excel'
import { renderCeshuNarrative } from '../../src/main/ceshu/export/content/narrative'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_LABELS } from '@mobai/shared/appSchema'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 路线 A 收尾守卫：Excel 与叙事版两个之前「刻意排除」的游戏专属导出器，
 * 现在按 docKind 分派为 SDD 口径。游戏档零回归由 ceshuExportExcel / ceshuExport 系列锁定。
 */
function appDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '效率工具' })
  doc.meta.project_name = '效率工具'
  doc.meta.platform = ['desktop', 'web']
  const d = doc as unknown as Record<string, Record<string, unknown>>
  d.overview = { problem: '团队信息散落', value_proposition: '一站式聚合', success_metrics: ['日活 1w'] }
  d.users = { personas: [{ name: '项目经理', context: '周会', pain: '找不到结论', goal: '快速对齐' }], scenarios: [] }
  d.features = { feature_list: [{ module: '聚合', feature: '看板', acceptance: '可拖拽' }], priorities: ['P0 看板'], dependencies: [] }
  d.data_interface = { endpoints: [{ name: 'listTasks', method: 'GET', input: 'projId', output: 'Task[]', idempotent: '是' }], error_codes: [] }
  d.milestones = { milestones: [{ name: 'M1', deliverable: '原型', depends: '' }], resources: [] }
  d.risks = { risk_register: [{ risk: '延期', impact: '高', mitigation: '砍范围', owner: 'PM' }], decisions: [] }
  d.nonfunctional = {
    compatibility: ['windows', 'macos'],
    performance_budget: [{ scene: '启动', metric: '冷启', target: '<2s' }],
    accessibility: ['键盘可达'],
    availability: '99.9%'
  }
  d.security = {
    auth_model: 'OAuth2',
    data_classification: [{ data: '用户信息', level: '敏感', handling: '加密存储' }],
    threats: [{ threat: '越权', impact: '高', mitigation: '鉴权中间件' }]
  }
  d.testing = {
    test_strategy: '分层',
    acceptance: [{ case: '登录', precondition: '已注册', expected: '成功' }],
    release_gate: ['单测通过']
  }
  return doc
}

function sheetText(workbook: ReturnType<typeof buildExcelWorkbook>, name: string): string {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) return ''
  const out: string[] = []
  sheet.eachRow((row) => {
    row.eachCell((cell) => out.push(String(cell.value ?? '')))
    out.push('\n')
  })
  return out.join(' ')
}

describe('应用档：Excel 是 SDD 七表', () => {
  it('7 个 SDD sheet，无游戏 sheet（系统配置/数值表/角色/竞品）', () => {
    const wb = buildExcelWorkbook(appDoc())
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      '概览',
      '功能清单',
      '用户角色',
      '数据与接口',
      '里程碑',
      '风险',
      '校验报告'
    ])
  })

  it('概览含项目名 / 平台 / SDD 章标签', () => {
    const text = sheetText(buildExcelWorkbook(appDoc()), '概览')
    expect(text).toContain('效率工具')
    expect(text).toContain('desktop')
    expect(text).toContain(APP_CHAPTER_LABELS.overview)
    expect(text).toContain(APP_CHAPTER_LABELS.risks)
  })

  it('结构化章节落表：功能 / 用户 / 接口 / 里程碑 / 风险', () => {
    const wb = buildExcelWorkbook(appDoc())
    expect(sheetText(wb, '功能清单')).toContain('看板')
    expect(sheetText(wb, '用户角色')).toContain('项目经理')
    expect(sheetText(wb, '数据与接口')).toContain('listTasks')
    expect(sheetText(wb, '里程碑')).toContain('M1')
    expect(sheetText(wb, '风险')).toContain('延期')
  })
})

describe('应用档：叙事版是 SDD 叙事', () => {
  it('按「为什么→做什么→怎么做→做多好→怎么上线」组织，无游戏概念', () => {
    const text = renderCeshuNarrative(appDoc())
    expect(text).toContain('# 效率工具')
    expect(text).toContain('## 项目概述')
    expect(text).toContain('## 用户与场景')
    expect(text).toContain('## 功能与设计')
    expect(text).toContain('## 技术架构')
    expect(text).toContain('## 质量与保障')
    expect(text).toContain('## 交付与治理')
    expect(text).toContain('## 变更记录')
    // 游戏专属概念不应出现
    expect(text).not.toContain('核心循环')
    expect(text).not.toContain('状态机')
    expect(text).not.toContain('可玩')
    expect(text).not.toContain('玩法走读')
  })

  it('章节数据进入叙事：功能清单与接口契约', () => {
    const text = renderCeshuNarrative(appDoc())
    expect(text).toContain('看板')
    expect(text).toContain('listTasks')
  })
})

describe('游戏档：narrative 仍走玩法叙事（反向锁定分派）', () => {
  it('含游戏名、不含 SDD 分区标题', () => {
    const text = renderCeshuNarrative(createDefaultCeshu({ scope: 'full', name: '星海计划' }))
    expect(text).toContain('星海计划')
    expect(text).not.toContain('## 项目概述')
    expect(text).not.toContain('## 技术架构')
  })
})
