/**
 * GDD 完备性检查清单：评估逻辑（runChecklist）与 Markdown 报告（buildChecklistMarkdown）。
 * 常量 / 类型 / 条目定义 / 自动检查函数见同目录 ceshuChecklistItems.ts。
 */
import type { CeshuDocument } from './ceshuConstants'
import {
  ALL_CATEGORIES,
  AUTO_CHECK_REGISTRY,
  getChecklistItems,
  getChecklistItemsByCategory,
  STATUS_MANUAL,
  STATUS_META,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARNING,
  STATUS_NA,
  type ChecklistResult,
  type ChecklistReport,
  type ChecklistStatus
} from './ceshuChecklistItems'

export function runChecklist(doc: CeshuDocument): ChecklistReport {
  const items = getChecklistItems()
  const results: ChecklistResult[] = []
  let passed = 0
  let failed = 0
  let warnings = 0
  let manual = 0
  let notApplicable = 0
  const failedRequiredIds: string[] = []

  for (const item of items) {
    if (item.auto_check === null) {
      results.push({
        item_id: item.id,
        status: STATUS_MANUAL,
        message: `请人工核查：${item.description}`,
        auto_checked: false
      })
      manual += 1
      continue
    }

    const check = AUTO_CHECK_REGISTRY[item.auto_check]
    if (!check) {
      results.push({
        item_id: item.id,
        status: STATUS_WARNING,
        message: `未注册的检查函数: ${item.auto_check}`,
        auto_checked: false
      })
      warnings += 1
      continue
    }

    let status: ChecklistStatus
    let message: string
    try {
      ;[status, message] = check(doc)
    } catch (error) {
      status = STATUS_WARNING
      message = `检查异常: ${error instanceof Error ? error.message : String(error)}`
    }

    results.push({ item_id: item.id, status, message, auto_checked: true })

    if (status === STATUS_PASS) passed += 1
    else if (status === STATUS_FAIL) {
      failed += 1
      if (item.required) failedRequiredIds.push(item.id)
    } else if (status === STATUS_WARNING) warnings += 1
    else if (status === STATUS_NA) notApplicable += 1
  }

  const scoredTotal = passed + failed + warnings
  const readiness = scoredTotal > 0 ? Math.round((passed / scoredTotal) * 1000) / 10 : 0

  return {
    results,
    total_items: items.length,
    passed,
    failed,
    warnings,
    manual,
    not_applicable: notApplicable,
    readiness_score: readiness,
    is_production_ready: failedRequiredIds.length === 0
  }
}

/* ---- Markdown 报告（对应 Python checklist_dialog._build_markdown） ---- */

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

/** 生成检查报告 Markdown（timestamp 由调用方传入，便于渲染层展示与测试固定） */
export function buildChecklistMarkdown(gameName: string, report: ChecklistReport, timestamp: string): string {
  const resultMap = new Map(report.results.map((result) => [result.item_id, result]))
  const lines: string[] = [
    '# GDD 完备性检查报告',
    '',
    `**生成时间**: ${timestamp}`,
    `**游戏名称**: ${gameName || '未命名'}`,
    `**就绪状态**: ${report.is_production_ready ? '✅ 制作就绪' : '❌ 未就绪'}`,
    `**就绪度评分**: ${report.readiness_score.toFixed(1)} / 100`,
    '',
    '## 统计摘要',
    '',
    `- 总检查项: ${report.total_items}`,
    `- 通过: ${report.passed}`,
    `- 失败: ${report.failed}`,
    `- 警告: ${report.warnings}`,
    `- 人工核查: ${report.manual}`,
    `- 不适用: ${report.not_applicable}`,
    ''
  ]
  for (const category of ALL_CATEGORIES) {
    const items = getChecklistItemsByCategory(category)
    if (items.length === 0) continue
    lines.push(`## ${category}`, '', '| 状态 | 标题 | 类型 | 检查消息 |', '|------|------|------|----------|')
    for (const item of items) {
      const result = resultMap.get(item.id)
      const status = result?.status ?? STATUS_MANUAL
      const meta = STATUS_META[status]
      lines.push(
        `| ${meta.icon} ${meta.label} | ${escapeCell(item.title)} | ${item.required ? '必需' : '建议'} | ${escapeCell(result?.message ?? '未运行')} |`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
// 向后兼容：原 ceshuChecklist.ts 的公共导出全部重定向到 ceshuChecklistItems.ts
export {
  CATEGORY_PROJECT, CATEGORY_DESIGN, CATEGORY_TECH, CATEGORY_MARKET, CATEGORY_TEAM, CATEGORY_RISK,
  ALL_CATEGORIES,
  STATUS_PASS, STATUS_FAIL, STATUS_WARNING, STATUS_MANUAL, STATUS_NA,
  STATUS_META,
  AUTO_CHECK_REGISTRY,
  getChecklistItems,
  getChecklistItemsByCategory
} from './ceshuChecklistItems'
export type { ChecklistItem, ChecklistResult, ChecklistReport, ChecklistStatus } from './ceshuChecklistItems'
