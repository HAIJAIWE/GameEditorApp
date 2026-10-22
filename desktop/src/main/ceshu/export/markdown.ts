import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument } from '../../../shared/ceshuConstants'
import { fieldStatusOf } from '../../../shared/ceshuFieldStatus'
import { countFieldStatuses, formatFieldStatusSummary } from '../../../shared/ceshuFieldStatusStats'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'
import { formatLocalTimestamp, getGddScope } from '../../../shared/ceshuModel'
import { validateCeshu } from '../../../shared/ceshuValidation'

import {
  EMPTY_PLACEHOLDER,
  chapterAnchor,
  chapterHeading,
  classifySystems,
  formatFieldValue,
  orderedFieldEntries,
  visibleChapterEntries,
  type VisibleChapterEntry
} from './common'

/**
 * Markdown 导出器（自 Python ceshu_markdown_exporter.py 匹平迁移）。
 * 文档信息 + 16 章结构（按档位裁剪）+ 目录锚点 + systems 表格 + 完成度附录；适合 Git 版本控制。
 */

const MD_BULLET = '- '
const MD_SEPARATOR = '\n\n---\n\n'

export function renderCeshuMarkdown(doc: CeshuDocument): string {
  const today = formatLocalTimestamp().slice(0, 10)
  const blocks: string[] = [renderHeader(doc, today), renderToc(doc)]
  for (const entry of visibleChapterEntries(getGddScope(doc))) {
    blocks.push(renderChapter(doc, entry))
  }
  blocks.push(renderReviewProgress(doc))
  blocks.push(renderValidationReport(doc))
  return blocks.join(MD_SEPARATOR) + '\n'
}

/** 文档头部：标题 + 元信息引用块 */
function renderHeader(doc: CeshuDocument, today: string): string {
  const gameName = readString(doc.meta.game_name) || '未命名策划书'
  const versionLabel = doc.version_label || 'v1.0'
  const gameType = readString(doc.meta.game_type) || EMPTY_PLACEHOLDER
  const positioning = readString(doc.meta.positioning) || EMPTY_PLACEHOLDER
  return [
    `# ${gameName}`,
    '',
    `> 版本: ${versionLabel} | 类型: ${gameType} | 日期: ${today}`,
    `> 定位: ${positioning}`,
    ''
  ].join('\n')
}

/** 目录（带锚点链接） */
function renderToc(doc: CeshuDocument): string {
  const lines = ['## 目录', '']
  for (const entry of visibleChapterEntries(getGddScope(doc))) {
    lines.push(`${entry.index}. [${CHAPTER_LABELS[entry.key]}](#${chapterAnchor(entry.index)})`)
  }
  return lines.join('\n')
}

/** 单章渲染 */
function renderChapter(doc: CeshuDocument, entry: VisibleChapterEntry): string {
  const lines = [`<a id="${chapterAnchor(entry.index)}"></a>`, `## ${chapterHeading(entry)}`, '']
  const data = doc[entry.key]
  if (entry.key === 'systems') {
    lines.push(...renderSystemsTable(data))
    return lines.join('\n')
  }
  if (!data || Object.keys(data).length === 0) {
    lines.push('(本章暂无内容)')
    return lines.join('\n')
  }
  for (const [fieldName, value] of orderedFieldEntries(entry.key, data)) {
    const formatted = formatFieldValue(value, { bullet: MD_BULLET })
    if (formatted.includes('\n')) {
      lines.push(`**${fieldName}**:`)
      for (const line of formatted.split('\n')) {
        if (line.trim()) lines.push(line)
      }
    } else {
      lines.push(`**${fieldName}**: ${formatted}`)
    }
  }
  return lines.join('\n')
}

/** systems 章节：状态表 + 已启用系统配置详情（对齐 Python） */
function renderSystemsTable(data: Record<string, unknown> | undefined): string[] {
  const [enabled, disabled] = classifySystems(data)
  const lines = ['| 系统 | 状态 | 数据类型 | 名称 |', '|------|------|----------|------|']
  for (const [systemId, systemData] of enabled) {
    lines.push(`| ${systemId} | ✅ 启用 | ${readString(systemData.data_type) || systemId} | ${readString(systemData.name) || systemId} |`)
  }
  for (const [systemId, systemData] of disabled) {
    lines.push(`| ${systemId} | ⬜ 未启用 | ${readString(systemData.data_type) || systemId} | ${readString(systemData.name) || systemId} |`)
  }
  if (enabled.length === 0 && disabled.length === 0) {
    lines.push('| (未配置任何游戏系统) | — | — | — |')
  }
  if (enabled.length > 0) {
    lines.push('', '### 已启用系统配置详情')
    for (const [systemId, systemData] of enabled) {
      const name = readString(systemData.name) || systemId
      lines.push('', `#### ${name} (${systemId})`)
      const config = isRecord(systemData.config) ? systemData.config : {}
      if (Object.keys(config).length > 0) {
        for (const [fieldName, value] of Object.entries(config)) {
          lines.push(`- **${fieldName}**: ${formatFieldValue(value, { bullet: MD_BULLET })}`)
        }
      } else {
        lines.push('- (无配置)')
      }
    }
  }
  return lines
}

/**
 * 附录：审核进度。
 *
 * 为什么要有：这份 Markdown 是发给同事「人读」的那一轨，收件人无法从正文里
 * 分辨哪些字段还是 AI 草稿、没人看过。列在附录里（而不是逐字段标注）是为了
 * 不改动章节渲染，也让 diff 稳定。
 *
 * 为什么零记录也输出：附录存在与否若随内容浮动，每次导出都会多/少一整段，
 * 在 Git 里看起来像「有人删了附录」。固定输出一行「无审核记录」更可 diff。
 */
function renderReviewProgress(doc: CeshuDocument): string {
  const lines = ['## 附录：审核进度', '']
  const total = { ai_draft: 0, human_edited: 0, approved: 0 }
  const pendingChapters: string[] = []
  for (const chapter of CHAPTER_KEYS) {
    const counts = countFieldStatuses(fieldStatusOf(doc.meta, chapter), CESHU_CHAPTER_FIELDS[chapter] ?? [])
    total.ai_draft += counts.ai_draft
    total.human_edited += counts.human_edited
    total.approved += counts.approved
    // 只列还有待审的章：已批准/人改的章不需要催人，列出来只会稀释注意力
    if (counts.ai_draft > 0) {
      pendingChapters.push(`${MD_BULLET}${CHAPTER_LABELS[chapter]}：${counts.ai_draft} 待审`)
    }
  }
  const summary = formatFieldStatusSummary(total)
  lines.push(`${MD_BULLET}全文档：${summary || '无审核记录'}`)
  lines.push(...pendingChapters)
  return lines.join('\n')
}

/** 附录：数据校验报告（对应 Python _render_validation_report） */
function renderValidationReport(doc: CeshuDocument): string {
  const lines = ['## 附录：数据校验报告', '']
  const errors = validateCeshu(doc)
  if (errors.length === 0) {
    lines.push('✅ 所有校验通过，未发现错误。')
    return lines.join('\n')
  }
  lines.push(`共发现 ${errors.length} 个问题：`, '')
  errors.forEach((error, index) => lines.push(`${index + 1}. ${error}`))
  return lines.join('\n')
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}