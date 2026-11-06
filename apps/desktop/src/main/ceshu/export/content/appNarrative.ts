/**
 * 应用档（SDD）叙事版导出。
 *
 * 与游戏版 `narrative.ts` 的区别：游戏版按「首页→走读→核心机制→数值→MVP→可玩原型」
 * 的玩法叙事组织，满是核心循环 / 状态机 / NPC 等游戏概念。软件设计没有这些，
 * 故另写一份按「为什么做 → 做什么 → 怎么做 → 做多好 → 怎么上线」的叙事：
 *
 *   项目概述 → 用户与场景 → 范围与非目标 → 功能与设计 → 技术架构
 *   → 质量与保障 → 横切关注点 → 交付与治理 → 变更记录
 *
 * 覆盖 SDD 全部章（基础 16 + AI 模型层 4，字段同源，不重算）。取数、标签、pipeList 表格全部走
 * `common` 的 ForDoc 系列，按文档档位自动跟着应用章表走。
 */
import { chapterLabelForDoc, formatLocalTimestamp } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { readText } from '@mobai/shared/util/io'
import {
  chapterDataForDocExport,
  fieldLabelForDoc,
  formatFieldValue,
  orderedFieldEntriesForDoc,
  pipeTableForDoc
} from '../common'

export function renderAppNarrative(doc: CeshuDocument): string {
  const blocks = [
    renderAppOverview(doc),
    renderSection(doc, '用户与场景', ['users']),
    renderSection(doc, '范围与非目标', ['scope']),
    renderSection(doc, '功能与设计', ['features', 'flows', 'interaction']),
    renderSection(doc, '技术架构', ['architecture', 'data_interface']),
    renderSection(doc, '质量与保障', ['nonfunctional', 'testing']),
    renderSection(doc, '横切关注点', ['security']),
    renderSection(doc, '交付与治理', ['release', 'milestones', 'risks']),
    renderAppChangelog(doc)
  ].filter((block) => block.trim() !== '')
  return blocks.join('\n\n---\n\n') + '\n'
}

/** # 项目名 + 版本/平台行 + 定位 + 项目概述章 */
function renderAppOverview(doc: CeshuDocument): string {
  const name = readText(doc.meta.project_name) || readText(doc.meta.game_name) || '未命名软件设计文档'
  const platform = Array.isArray(doc.meta.platform)
    ? (doc.meta.platform as unknown[])
        .filter((item): item is string => typeof item === 'string')
        .join('/')
    : ''
  const lines = [
    `# ${name}`,
    '',
    `> 版本: ${doc.version_label || 'v1.0'} | 平台: ${platform || '—'} | 日期: ${formatLocalTimestamp().slice(0, 10)}`
  ]
  const positioning = readText(doc.meta.positioning)
  if (positioning) lines.push('', `**定位**： ${positioning}`)
  const body = renderChapterFields(doc, 'overview')
  if (body) lines.push('', '## 项目概述', '', body)
  return lines.join('\n')
}

/** ## 分区标题 + 多个 ### 章 */
function renderSection(doc: CeshuDocument, title: string, chapters: readonly string[]): string {
  const parts = chapters
    .map((chapter) => {
      const body = renderChapterFields(doc, chapter)
      return body ? `### ${chapterLabelForDoc(doc, chapter)}\n\n${body}` : ''
    })
    .filter((part) => part !== '')
  if (parts.length === 0) return ''
  return `## ${title}\n\n${parts.join('\n\n')}`
}

/** 单章全部字段（按 schema 顺序、跳过机读与空值），逐字段渲染 */
function renderChapterFields(doc: CeshuDocument, chapter: string): string {
  const data = chapterDataForDocExport(doc, chapter)
  const entries = orderedFieldEntriesForDoc(doc, chapter, data)
  if (entries.length === 0) return ''
  return entries
    .map(([field, value]) => renderField(doc, chapter, field, value).join('\n'))
    .join('\n\n')
}

/** 字段 → `**标签**: 值`（pipeList 有列定义时渲染成 Markdown 表） */
function renderField(doc: CeshuDocument, chapter: string, field: string, value: unknown): string[] {
  const label = fieldLabelForDoc(doc, chapter, field)
  const table = pipeTableForDoc(doc, chapter, field, value)
  if (table !== null) {
    return [
      `**${label}**:`,
      '',
      `| ${table.headers.map(mdCell).join(' | ')} |`,
      `| ${table.headers.map(() => '---').join(' | ')} |`,
      ...table.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
      ''
    ]
  }
  const formatted = formatFieldValue(value)
  return formatted.includes('\n')
    ? [`**${label}**:`, ...formatted.split('\n').filter((line) => line.trim() !== '')]
    : [`**${label}**: ${formatted}`]
}

function renderAppChangelog(doc: CeshuDocument): string {
  return ['## 变更记录', '', `- 版本：${doc.version_label || 'v1.0'}`, `- 更新：${doc.updated_at || '—'}`].join('\n')
}

function mdCell(text: unknown): string {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}
