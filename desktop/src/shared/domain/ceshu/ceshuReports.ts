import { CHAPTER_KEYS, CHAPTER_LABELS } from '../../ceshu/reference/ceshuConstants'
import type { CeshuChangelog } from '../../ceshu/workflow/ceshuDiff'
import { groupValidationMessages, VALIDATION_SEVERITY_LABELS } from '../../ceshu/validation/ceshuValidationGroups'
import type { ValidationSeverity } from '../../ceshu/validation/ceshuValidationGroups'

/**
 * 策划书报告渲染纯逻辑（渲染层生成文本 → 主进程原子写盘）。
 *
 * - `buildValidationReportMarkdown` —— 匹平迁移 旧版
 *   `ui/ceshu/validation_dialog::ValidationReportDialog._build_markdown`（含错误分类与章节完成度表）。
 * - `buildChangelog{Markdown,Text,Html}` —— 匹平迁移 旧版
 *   `core/ceshu/ceshu_changelog::Changelog.to_{markdown,text,html}`。
 *
 * 全为纯函数：`gameName`/`versionLabel`/`timestamp` 由调用方传入，便于渲染层展示与测试固定。
 */

/* ---------------- 校验报告 ---------------- */

export type ValidationCategory = 'required' | 'conflict' | 'warning' | 'dep' | 'other'

/** 错误分类关键字（与 ceshu_model.validate() 输出保持一致） */
const CATEGORY_REQUIRED = '必填项'
const CATEGORY_CONFLICT = '一致性冲突'
const CATEGORY_WARNING = '一致性警告'
const CATEGORY_DEP = '依赖缺失'

/** 单条错误归类 */
export function categorizeValidationError(error: string): ValidationCategory {
  if (error.includes(CATEGORY_DEP)) return 'dep'
  if (error.includes(CATEGORY_CONFLICT)) return 'conflict'
  if (error.includes(CATEGORY_WARNING)) return 'warning'
  if (error.includes(CATEGORY_REQUIRED)) return 'required'
  return 'other'
}

/** 分类展示元数据 */
export const VALIDATION_CATEGORY_META: Record<ValidationCategory, { title: string; icon: string; color: string; tip: string }> = {
  required: { title: '必填字段缺失', icon: '🔴', color: '#e57373', tip: '影响工业级 GDD 完整性，必须修复' },
  conflict: { title: '一致性冲突', icon: '🟠', color: '#ffb74d', tip: '章节间硬冲突，会导致执行歧义' },
  warning: { title: '一致性警告', icon: '🟡', color: '#fff176', tip: '软警告，建议统一以提升一致性' },
  dep: { title: '依赖缺失', icon: '🔵', color: '#64b5f6', tip: '启用的系统依赖未启用，运行时会出错' },
  other: { title: '其他问题', icon: '⚪', color: '#bdbdbd', tip: '未分类问题' }
}

/** 摘要计数顺序 */
const SUMMARY_ORDER: ValidationCategory[] = ['required', 'conflict', 'warning', 'dep', 'other']
/** 问题清单分组顺序 */
const LIST_ORDER: ValidationCategory[] = ['required', 'conflict', 'dep', 'warning', 'other']

/**
 * 生成校验报告的 Markdown。
 *
 * @param gameName 项目名称（空则显示「未命名」）
 * @param versionLabel 版本标签（空则显示「v1.0」）
 * @param timestamp 生成时间字符串
 * @param errors 校验错误列表（`ceshu:validate` 的返回）
 * @param progress 章节完成度（0~1；`computeChapterProgress` 的返回，含 `total`）
 */
export function buildValidationReportMarkdown(
  gameName: string,
  versionLabel: string,
  timestamp: string,
  errors: string[],
  progress: Record<string, number>
): string {
  const name = gameName || '未命名'
  const vlabel = versionLabel || 'v1.0'
  const totalPct = Math.trunc((progress['total'] ?? 0) * 100)
  // 评分：100 - 错误数*3（最低 0）
  const score = Math.max(0, 100 - errors.length * 3)
  const grade = score >= 80 ? '✓ 通过' : score >= 50 ? '⚠ 待改进' : '✗ 不合格'

  const lines: string[] = []
  lines.push('# 工业级 GDD 校验报告')
  lines.push('')
  lines.push(`**项目名称**: ${name}  `)
  lines.push(`**版本**: ${vlabel}  `)
  lines.push(`**生成时间**: ${timestamp}  `)
  lines.push(`**完整性评分**: **${score}/100** (${grade})  `)
  lines.push(`**总进度**: ${totalPct}%  `)
  lines.push('')

  // 问题概览：报告开头先回答「必须先修什么、有多少」，避免读者在五分类清单里自己数。
  // 分组复用面板同一套规则（groupValidationMessages），但只是**新增摘要段**，
  // 下方与 旧版 `_build_markdown` 对齐的五分类输出保持不变（历史契约）。
  if (errors.length > 0) {
    const groups = groupValidationMessages(errors)
    lines.push('## 问题概览')
    lines.push('')
    const severityRows: Array<{ severity: ValidationSeverity; icon: string }> = [
      { severity: 'error', icon: '⛔' },
      { severity: 'warning', icon: '⚠' }
    ]
    for (const { severity, icon } of severityRows) {
      const scoped = groups.filter((group) => group.severity === severity)
      const total = scoped.reduce((sum, group) => sum + group.items.length, 0)
      // 该严重度为 0 时整行省略，避免出现「必须修复：0 个」这类噪音
      if (total === 0) continue
      const detail = scoped.map((group) => `${group.label} ${group.items.length}`).join(' / ')
      lines.push(`- ${icon} ${VALIDATION_SEVERITY_LABELS[severity]}：${total} 个（${detail}）`)
    }
    lines.push('')
  }

  // 摘要
  lines.push('## 摘要')
  lines.push('')
  const counts: Record<ValidationCategory, number> = { required: 0, conflict: 0, warning: 0, dep: 0, other: 0 }
  for (const error of errors) counts[categorizeValidationError(error)] += 1
  lines.push(`- 问题总数: **${errors.length}**`)
  for (const cat of SUMMARY_ORDER) {
    const meta = VALIDATION_CATEGORY_META[cat]
    lines.push(`- ${meta.icon} ${meta.title}: ${counts[cat]}`)
  }
  lines.push('')

  // 问题清单
  if (errors.length > 0) {
    lines.push('## 问题清单')
    lines.push('')
    const groups: Partial<Record<ValidationCategory, string[]>> = {}
    for (const error of errors) {
      const cat = categorizeValidationError(error)
      ;(groups[cat] ??= []).push(error)
    }
    for (const cat of LIST_ORDER) {
      const bucket = groups[cat]
      if (bucket === undefined) continue
      const meta = VALIDATION_CATEGORY_META[cat]
      lines.push(`### ${meta.icon} ${meta.title} (${bucket.length})`)
      lines.push('')
      lines.push(`> ${meta.tip}`)
      lines.push('')
      for (const err of bucket) lines.push(`- ${err}`)
      lines.push('')
    }
  } else {
    lines.push('## ✓ 校验通过')
    lines.push('')
    lines.push('策划书结构完整，达到工业级 GDD 完整性标准。')
    lines.push('')
  }

  // 章节完成度
  lines.push('## 章节完成度')
  lines.push('')
  lines.push('| 章节 | 完成度 | 状态 |')
  lines.push('|------|--------|------|')
  for (const key of CHAPTER_KEYS) {
    const pct = Math.trunc((progress[key] ?? 0) * 100)
    const status = pct >= 80 ? '✓' : pct >= 50 ? '⚠' : '✗'
    lines.push(`| ${CHAPTER_LABELS[key]} | ${pct}% | ${status} |`)
  }
  lines.push('')

  // 结论
  lines.push('## 结论与建议')
  lines.push('')
  if (errors.length === 0) {
    lines.push('策划书已达工业级 GDD 完整性标准，可进入开发评审阶段。')
  } else {
    lines.push('按优先级修复（红 > 橙 > 蓝 > 黄）：')
    lines.push('')
    lines.push('1. **必填字段**: 优先补全元信息、产品愿景、核心玩法等基础章节')
    lines.push('2. **一致性冲突**: 章节间硬冲突会导致执行歧义，必须解决')
    lines.push('3. **依赖缺失**: 启用的系统需补齐依赖系统，否则运行时报错')
    lines.push('4. **一致性警告**: 软警告，建议统一以提升 GDD 一致性')
  }
  lines.push('')
  lines.push('---')
  lines.push('*本报告由 GameEditorApp v5.0 工业级校验引擎生成*')

  return lines.join('\n')
}

/* ---------------- 变更日志 ---------------- */

/** HTML 特殊字符转义 */
function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return ''
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface ChangelogChangeLike {
  type: string
  chapter: string
  description: string
}

interface ChangelogLike {
  entries: Array<{ version: string; date: string; summary: string; changes: ChangelogChangeLike[] }>
}

/** 按章节分组（保持出现顺序），对应 旧版 中的 `by_chapter` 逻辑 */
function groupByChapter<T extends { chapter: string }>(changes: T[]): Array<{ chapter: string; items: T[] }> {
  const order: string[] = []
  const map = new Map<string, T[]>()
  for (const change of changes) {
    const key = change.chapter
    if (!map.has(key)) {
      map.set(key, [])
      order.push(key)
    }
    map.get(key)!.push(change)
  }
  return order.map((chapter) => ({ chapter, items: map.get(chapter)! }))
}

/** 渲染为 Markdown */
export function buildChangelogMarkdown(log: ChangelogLike): string {
  const lines: string[] = ['# 变更日志', '']
  const totalChanges = log.entries.reduce((sum, entry) => sum + entry.changes.length, 0)
  if (log.entries.length === 0) {
    lines.push('（暂无变更记录）')
    return lines.join('\n')
  }
  lines.push(`共 ${log.entries.length} 个版本，${totalChanges} 处变更。`)
  lines.push('')
  for (const entry of log.entries) {
    lines.push(`## ${entry.version} — ${entry.summary}`)
    lines.push('')
    const metaParts: string[] = []
    if (entry.date) metaParts.push(`**日期**: ${entry.date}`)
    metaParts.push(`**变更数**: ${entry.changes.length}`)
    lines.push(metaParts.join(' | '))
    lines.push('')
    if (entry.changes.length === 0) {
      lines.push('（无变更）')
      lines.push('')
      continue
    }
    for (const group of groupByChapter(entry.changes)) {
      lines.push(`### ${group.chapter}`)
      lines.push('')
      for (const change of group.items) lines.push(`- [${change.type}] ${change.description}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

/** 渲染为纯文本 */
export function buildChangelogText(log: ChangelogLike): string {
  const lines: string[] = ['变更日志', '='.repeat(40), '']
  const totalChanges = log.entries.reduce((sum, entry) => sum + entry.changes.length, 0)
  if (log.entries.length === 0) {
    lines.push('（暂无变更记录）')
    return lines.join('\n')
  }
  lines.push(`共 ${log.entries.length} 个版本，${totalChanges} 处变更。`)
  lines.push('')
  for (const entry of log.entries) {
    lines.push(`[${entry.version}] ${entry.summary}`)
    const metaParts: string[] = []
    if (entry.date) metaParts.push(`日期: ${entry.date}`)
    metaParts.push(`变更数: ${entry.changes.length}`)
    lines.push('  ' + metaParts.join(' | '))
    if (entry.changes.length === 0) {
      lines.push('  （无变更）')
      lines.push('')
      continue
    }
    for (const group of groupByChapter(entry.changes)) {
      lines.push(`  [${group.chapter}]`)
      for (const change of group.items) lines.push(`    - (${change.type}) ${change.description}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** 渲染为 HTML */
export function buildChangelogHtml(log: ChangelogLike): string {
  const parts: string[] = [
    '<!DOCTYPE html>',
    "<html lang='zh-CN'>",
    "<head><meta charset='UTF-8'>",
    '<style>',
    "body { font-family: 'Microsoft YaHei', sans-serif; padding: 20px; }",
    'h1 { color: #4f8cf7; }',
    'h2 { color: #2c3e50; border-bottom: 1px solid #ddd; padding-bottom: 4px; }',
    'h3 { color: #555; }',
    '.meta { color: #888; font-size: 12px; }',
    '.change { margin: 2px 0; }',
    '.type-added { color: #22C55E; font-weight: bold; }',
    '.type-removed { color: #EF4444; font-weight: bold; }',
    '.type-modified { color: #F59E0B; font-weight: bold; }',
    '.chapter { margin-top: 8px; font-weight: bold; color: #333; }',
    '</style>',
    '</head>',
    '<body>',
    '<h1>变更日志</h1>'
  ]
  const totalChanges = log.entries.reduce((sum, entry) => sum + entry.changes.length, 0)
  if (log.entries.length === 0) {
    parts.push('<p>（暂无变更记录）</p>')
  } else {
    parts.push(`<p>共 ${log.entries.length} 个版本，${totalChanges} 处变更。</p>`)
    for (const entry of log.entries) {
      parts.push(`<h2>${escapeHtml(entry.version)} — ${escapeHtml(entry.summary)}</h2>`)
      const metaParts: string[] = []
      if (entry.date) metaParts.push(`日期: ${escapeHtml(entry.date)}`)
      metaParts.push(`变更数: ${entry.changes.length}`)
      parts.push(`<p class='meta'>${metaParts.join(' | ')}</p>`)
      if (entry.changes.length === 0) {
        parts.push('<p>（无变更）</p>')
        continue
      }
      for (const group of groupByChapter(entry.changes)) {
        parts.push(`<div class='chapter'>[${escapeHtml(group.chapter)}]</div>`)
        for (const change of group.items) {
          parts.push(
            `<div class='change'><span class='type-${escapeHtml(change.type)}'>[${escapeHtml(change.type)}]</span> ${escapeHtml(change.description)}</div>`
          )
        }
      }
    }
  }
  parts.push('</body></html>')
  return parts.join('\n')
}

/** 便捷类型：`ceshu:changelog` 的返回可直接传入三个 builder */
export type ChangelogForExport = CeshuChangelog
