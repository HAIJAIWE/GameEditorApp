import {
  type CeshuDocument,
} from '@mobai/shared/ceshu/reference'
import { fieldStatusOf } from '@mobai/shared/ceshu/fields'
import { countFieldStatuses, formatFieldStatusSummary } from '@mobai/shared/ceshu/fields'
import { chapterFieldsForDoc, chapterLabelForDoc, computeChapterProgress, formatLocalTimestamp, isSoftwareDoc, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { renderDocDiagrams } from '../content/diagrams'

import {
  EMPTY_PLACEHOLDER,
  chapterAnchor,
  chapterDataForDocExport,
  chapterHeadingForDoc,
  classifySystems,
  fieldLabelForDoc,
  formatFieldValue,
  isEmptyValue,
  machineFieldEntriesForDoc,
  orderedFieldEntriesForDoc,
  pipeTableForDoc,
  visibleChapterEntriesForDoc,
  type DocChapterEntry
} from '../common'

/**
 * HTML 导出器：生成自包含的可打印 HTML（浅色主题、微软雅黑、A4 友好）。
 * 同一份 HTML 也是 PDF 导出的渲染源（Electron printToPDF），保证两种格式版式一致。
 */

export function renderCeshuHtml(doc: CeshuDocument): string {
  const today = formatLocalTimestamp().slice(0, 10)
  const isApp = isSoftwareDoc(doc)
  const gameName = (isApp
    ? readString(doc.meta.project_name) || readString(doc.meta.game_name)
    : readString(doc.meta.game_name)) || (isApp ? '未命名软件设计文档' : '未命名策划书')
  const entries = visibleChapterEntriesForDoc(doc)

  const body: string[] = []
  body.push(renderHeader(doc, gameName, today))
  body.push(renderToc(doc, entries))
  body.push(renderDiagrams(doc))
  for (const entry of entries) {
    body.push(renderChapter(doc, entry))
  }
  body.push(renderMachineAppendix(doc))
  body.push(renderReviewProgress(doc))
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
  const platform = Array.isArray(doc.meta.platform)
    ? doc.meta.platform.filter((item): item is string => typeof item === 'string').join('、')
    : ''
  const isAppDoc = isSoftwareDoc(doc)
  const gameType = isAppDoc ? platform || EMPTY_PLACEHOLDER : readString(doc.meta.game_type) || EMPTY_PLACEHOLDER
  const positioning = readString(doc.meta.positioning) || EMPTY_PLACEHOLDER
  return [
    '<header class="doc-header">',
    `<h1>${escapeHtml(gameName)}</h1>`,
    `<p class="meta">版本: ${escapeHtml(versionLabel)} | 类型: ${escapeHtml(gameType)} | 日期: ${escapeHtml(today)}</p>`,
    `<p class="meta">定位: ${escapeHtml(positioning)}</p>`,
    '</header>'
  ].join('\n')
}

/**
 * 图示区（对标豆包交付物的 gameflow.svg）：核心循环 + 核心状态机，内联 SVG。
 *
 * 放在目录之后、正文之前：读者先看图建立整体印象，再逐章读细节。
 * 无数据时整段不渲染（不输出空图或占位）。
 */
function renderDiagrams(doc: CeshuDocument): string {
  // 核心循环 / 状态机 / 成长曲线都是游戏专属图示；应用档即使兼容底座里留着
  // 游戏章数据也不该在 SDD 里画出这些图。
  if (isSoftwareDoc(doc)) return ''
  const { coreLoop, stateMachine, growthChart } = renderDocDiagrams(doc)
  if (coreLoop === null && stateMachine === null && growthChart === null) return ''
  const parts: string[] = ['<section class="diagrams">', '<h2>图示</h2>']
  if (coreLoop !== null) parts.push(`<figure class="diagram">${coreLoop}</figure>`)
  if (stateMachine !== null) parts.push(`<figure class="diagram">${stateMachine}</figure>`)
  if (growthChart !== null) parts.push(`<figure class="diagram">${growthChart}</figure>`)
  parts.push('</section>')
  return parts.join('\n')
}

function renderToc(doc: CeshuDocument, entries: DocChapterEntry[]): string {
  const items = entries
    .map((entry) => `<li><a href="#${chapterAnchor(entry.index)}">${escapeHtml(chapterHeadingForDoc(doc, entry))}</a></li>`)
    .join('')
  return `<nav class="toc"><h2>目录</h2><ol>${items}</ol></nav>`
}

function renderChapter(doc: CeshuDocument, entry: DocChapterEntry): string {
  const heading = `<h2 id="${chapterAnchor(entry.index)}">${escapeHtml(chapterHeadingForDoc(doc, entry))}</h2>`
  const data = chapterDataForDocExport(doc, entry.key)

  if (entry.key === 'systems') {
    return `<section class="chapter">${heading}\n${renderSystems(data)}</section>`
  }

  const entries = data ? orderedFieldEntriesForDoc(doc, entry.key, data) : []
  if (entries.length === 0) {
    return `<section class="chapter">${heading}\n<p class="empty">(本章暂无内容)</p></section>`
  }

  const fields = entries.map(([fieldKey, value]) => renderFieldBlock(doc, entry.key, fieldKey, value)).join('\n')
  return `<section class="chapter">${heading}\n${fields}</section>`
}

/** 单个字段 → HTML（pipeList 有列定义时渲染成真表格，否则回落成等宽文本块） */
function renderFieldBlock(doc: CeshuDocument, chapter: string, fieldKey: string, value: unknown): string {
  const label = escapeHtml(fieldLabelForDoc(doc, chapter, fieldKey))
  const table = pipeTableForDoc(doc, chapter, fieldKey, value)
  if (table !== null) {
    const head = `<thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>`
    const body = `<tbody>${table.rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>`
    return `<div class="field"><div class="field-label">${label}</div><table>${head}${body}</table></div>`
  }
  const formatted = formatFieldValue(value, { bullet: '- ' })
  return `<div class="field"><div class="field-label">${label}</div><pre class="field-value">${escapeHtml(formatted)}</pre></div>`
}

/** 附录：验收与机读数据（正文只留人读字段，机读表格集中在此） */
function renderMachineAppendix(doc: CeshuDocument): string {
  const groups: string[] = []
  for (const entry of visibleChapterEntriesForDoc(doc)) {
    const data = chapterDataForDocExport(doc, entry.key)
    if (!data) continue
    const machine = machineFieldEntriesForDoc(doc, entry.key, data)
    if (machine.length === 0) continue
    const blocks = machine.map(([fieldKey, value]) => renderFieldBlock(doc, entry.key, fieldKey, value)).join('\n')
    groups.push(`<div class="appendix-group"><h3>${escapeHtml(chapterHeadingForDoc(doc, entry))}</h3>${blocks}</div>`)
  }
  if (groups.length === 0) return ''
  return ['<section class="chapter appendix">', '<h2>附录：验收与机读数据</h2>', ...groups, '</section>'].join('\n')
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
      const entries = Object.entries(config).filter(([, value]) => !isEmptyValue(value))
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

/**
 * 附录：审核进度。
 *
 * 为什么要有：HTML 是发给同事「人读」的那一轨，收件人无法从正文分辨哪些字段
 * 还是 AI 草稿。与 Markdown / Excel 概览共用同一套统计口径，避免三种出口对
 * 「还剩多少待审」给出不同答案。列在附录里而不逐字段标注，是为了不动章节渲染。
 *
 * 为什么零记录也输出：区块随内容浮动，两次导出之间会整段多/少，diff 看起来像
 * 有人删了附录；固定输出一行「无审核记录」更可 diff。
 */
function renderReviewProgress(doc: CeshuDocument): string {
  const total = { ai_draft: 0, human_edited: 0, approved: 0 }
  const pending: string[] = []
  for (const chapter of visibleChaptersForDoc(doc)) {
    const counts = countFieldStatuses(fieldStatusOf(doc.meta, chapter), chapterFieldsForDoc(doc, chapter))
    total.ai_draft += counts.ai_draft
    total.human_edited += counts.human_edited
    total.approved += counts.approved
    // 只列还有待审的章：已批准/人改的章不需要催人，列出来只会稀释注意力
    if (counts.ai_draft > 0) {
      pending.push(`<li>${escapeHtml(chapterLabelForDoc(doc, chapter))}：${counts.ai_draft} 待审</li>`)
    }
  }
  const summary = formatFieldStatusSummary(total)
  return [
    '<section class="chapter appendix">',
    '<h2>附录：审核进度</h2>',
    `<ul class="status-list"><li>全文档：${escapeHtml(summary || '无审核记录')}</li>${pending.join('')}</ul>`,
    '</section>'
  ].join('\n')
}

function renderProgressReport(doc: CeshuDocument, entries: DocChapterEntry[]): string {
  const progress = computeChapterProgress(doc)
  const rows = entries
    .map((entry) => {
      const percent = Math.round((progress[entry.key] ?? 0) * 100)
      return `<tr><td>${escapeHtml(chapterLabelForDoc(doc, entry.key))}</td><td>${percent}%</td></tr>`
    })
    .join('')
  const total = Math.round((progress.total ?? 0) * 100)
  return [
    '<section class="chapter appendix">',
    '<h2>附录：小节完成度</h2>',
    `<table><thead><tr><th>小节</th><th>进度</th></tr></thead><tbody>${rows}<tr><td><strong>总进度</strong></td><td><strong>${total}%</strong></td></tr></tbody></table>`,
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
  /* 图示区（核心循环 / 状态机）：白底卡片 + 可横向滚动，打印时按块避免截断 */
  .diagrams { margin: 24px 0 8px; }
  .diagrams h2 { font-size: 17px; margin: 0 0 12px; }
  .diagram { margin: 0 0 18px; padding: 12px; border: 1px solid #e3e8f2; border-radius: 8px; background: #fbfcfe; overflow-x: auto; page-break-inside: avoid; }
  .diagram svg { display: block; max-width: 100%; height: auto; }
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