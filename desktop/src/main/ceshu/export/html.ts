import { CHAPTER_LABELS, type CeshuDocument } from '../../../shared/ceshuConstants'
import { computeChapterProgress, formatLocalTimestamp, getGddScope } from '../../../shared/ceshuModel'

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
 * HTML 导出器：生成自包含的可打印 HTML（浅色主题、微软雅黑、A4 友好）。
 * 同一份 HTML 也是 PDF 导出的渲染源（Electron printToPDF），保证两种格式版式一致。
 */

export function renderCeshuHtml(doc: CeshuDocument): string {
  const today = formatLocalTimestamp().slice(0, 10)
  const gameName = readString(doc.meta.game_name) || '未命名策划书'
  const scope = getGddScope(doc)
  const entries = visibleChapterEntries(scope)

  const body: string[] = []
  body.push(renderHeader(doc, gameName, today))
  body.push(renderToc(entries))
  for (const entry of entries) {
    body.push(renderChapter(doc, entry))
  }
  body.push(renderProgressReport(doc, entries))

  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(gameName)}</title>`,
    `<style>${STYLES}</style>`,
    '</head>',
    '<body>',
    ...body,
    '</body>',
    '</html>'
  ].join('\n')
}

function renderHeader(doc: CeshuDocument, gameName: string, today: string): string {
  const versionLabel = doc.version_label || 'v1.0'
  const gameType = readString(doc.meta.game_type) || EMPTY_PLACEHOLDER
  const positioning = readString(doc.meta.positioning) || EMPTY_PLACEHOLDER
  return [
    '<header class="doc-header">',
    `<h1>${escapeHtml(gameName)}</h1>`,
    `<p class="meta">版本: ${escapeHtml(versionLabel)} | 类型: ${escapeHtml(gameType)} | 日期: ${escapeHtml(today)}</p>`,
    `<p class="meta">定位: ${escapeHtml(positioning)}</p>`,
    '</header>'
  ].join('\n')
}

function renderToc(entries: VisibleChapterEntry[]): string {
  const items = entries
    .map((entry) => `<li><a href="#${chapterAnchor(entry.index)}">${escapeHtml(chapterHeading(entry))}</a></li>`)
    .join('')
  return `<nav class="toc"><h2>目录</h2><ol>${items}</ol></nav>`
}

function renderChapter(doc: CeshuDocument, entry: VisibleChapterEntry): string {
  const heading = `<h2 id="${chapterAnchor(entry.index)}">${escapeHtml(chapterHeading(entry))}</h2>`
  const data = doc[entry.key]

  if (entry.key === 'systems') {
    return `<section class="chapter">${heading}\n${renderSystems(data)}</section>`
  }

  if (!data || Object.keys(data).length === 0) {
    return `<section class="chapter">${heading}\n<p class="empty">(本章暂无内容)</p></section>`
  }

  const fields = orderedFieldEntries(entry.key, data)
    .map(([fieldName, value]) => {
      const formatted = formatFieldValue(value, { bullet: '- ' })
      return [
        '<div class="field">',
        `<div class="field-label">${escapeHtml(fieldName)}</div>`,
        `<pre class="field-value">${escapeHtml(formatted)}</pre>`,
        '</div>'
      ].join('')
    })
    .join('\n')
  return `<section class="chapter">${heading}\n${fields}</section>`
}

function renderSystems(data: Record<string, unknown> | undefined): string {
  const [enabled, disabled] = classifySystems(data)
  const rows = [...enabled, ...disabled].map(([systemId, systemData], index) => {
    const status = index < enabled.length ? '✅ 启用' : '⬜ 未启用'
    const dataType = readString(systemData.data_type) || systemId
    const name = readString(systemData.name) || systemId
    return `<tr><td>${escapeHtml(systemId)}</td><td>${status}</td><td>${escapeHtml(dataType)}</td><td>${escapeHtml(name)}</td></tr>`
  })
  const table =
    rows.length > 0
      ? `<table><thead><tr><th>系统</th><th>状态</th><th>数据类型</th><th>名称</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
      : '<p class="empty">(未配置任何游戏系统)</p>'

  const details = enabled
    .map(([systemId, systemData]) => {
      const name = readString(systemData.name) || systemId
      const config = isRecord(systemData.config) ? systemData.config : {}
      const entries = Object.entries(config)
      const configHtml =
        entries.length > 0
          ? `<pre class="field-value">${escapeHtml(
              entries.map(([fieldName, value]) => `${fieldName}: ${formatFieldValue(value)}`).join('\n')
            )}</pre>`
          : '<p class="empty">(无配置)</p>'
      return `<h3>${escapeHtml(`${name} (${systemId})`)}</h3>${configHtml}`
    })
    .join('\n')

  return `${table}\n${enabled.length > 0 ? `<h3 class="detail-title">已启用系统配置详情</h3>${details}` : ''}`
}

function renderProgressReport(doc: CeshuDocument, entries: VisibleChapterEntry[]): string {
  const progress = computeChapterProgress(doc)
  const rows = entries
    .map((entry) => {
      const percent = Math.round((progress[entry.key] ?? 0) * 100)
      return `<tr><td>${escapeHtml(CHAPTER_LABELS[entry.key])}</td><td>${percent}%</td></tr>`
    })
    .join('')
  const total = Math.round((progress.total ?? 0) * 100)
  return [
    '<section class="chapter appendix">',
    '<h2>附录：章节完成度</h2>',
    `<table><thead><tr><th>章节</th><th>进度</th></tr></thead><tbody>${rows}<tr><td><strong>总进度</strong></td><td><strong>${total}%</strong></td></tr></tbody></table>`,
    '</section>'
  ].join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const STYLES = `
  :root { color-scheme: light; }
  body {
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 28px 64px;
    color: #1f2937;
    font: 14px/1.75 "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    background: #ffffff;
  }
  .doc-header h1 { font-size: 26px; margin: 0 0 8px; }
  .meta { color: #6b7280; margin: 2px 0; }
  nav.toc { margin: 24px 0; padding: 12px 18px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; }
  nav.toc h2 { font-size: 16px; margin: 0 0 8px; }
  nav.toc ol { margin: 0; padding-left: 22px; }
  nav.toc a { color: #0f766e; text-decoration: none; }
  section.chapter { margin: 28px 0; page-break-inside: auto; }
  h2 { font-size: 19px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin: 28px 0 12px; }
  h3 { font-size: 15px; margin: 16px 0 6px; }
  .field { margin: 10px 0; }
  .field-label { font-weight: 600; color: #374151; }
  pre.field-value {
    margin: 4px 0 0;
    padding: 8px 10px;
    background: #f9fafb;
    border-left: 3px solid #0f766e;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    font: 13px/1.7 "Microsoft YaHei", "PingFang SC", monospace;
  }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 13px; text-align: left; }
  th { background: #f3f4f6; }
  .empty { color: #9ca3af; }
  .detail-title { margin-top: 20px; }
  @media print {
    body { padding: 0; max-width: none; }
    section.chapter { page-break-inside: auto; }
    h2 { page-break-after: avoid; }
  }
`