import PptxGenJS from 'pptxgenjs'

import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  SYSTEM_LABELS,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey
} from '../../../shared/ceshuConstants'
import { fieldStatusOf } from '../../../shared/ceshuFieldStatus'
import { countFieldStatuses, formatFieldStatusSummary } from '../../../shared/ceshuFieldStatusStats'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'
import { computeChapterProgress, formatLocalTimestamp, getGddScope, isPlainObject } from '../../../shared/ceshuModel'
import {
  EMPTY_PLACEHOLDER,
  chapterHeading,
  classifySystems,
  formatFieldValue,
  orderedFieldEntries,
  visibleChapterEntries
} from './common'

/**
 * 策划书 pptx 渲染器（纯函数式，返回 Buffer，写盘由上层 exporter 负责）。
 * 结构：封面 → 每章一页 → 完成度页；16:9 版式，统一微软雅黑。
 */

/** 中文字体 */
const FONT = '微软雅黑'
/** 单页允许的最大字符数（超出截断，避免幻灯片溢出） */
const MAX_SLIDE_CHARS = 900

const COLORS = {
  bg: '1F2937',
  accent: '4F8CF7',
  title: 'F2F5FA',
  body: 'E5E7EB',
  muted: '9CA3AF'
}

/** 取字符串字段，空值回退占位符 */
function asText(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : EMPTY_PLACEHOLDER
}

/** 系统中文名回退 */
function systemName(sysId: string, sysData: ChapterData): string {
  return typeof sysData.name === 'string' && sysData.name ? sysData.name : (SYSTEM_LABELS[sysId] ?? sysId)
}

/** 普通章节正文：字段名一行 + 多行值（bullet 用 "• "） */
function chapterBodyText(key: ChapterKey, data: ChapterData): string {
  const fields = orderedFieldEntries(key, data)
  if (fields.length === 0) return '(本章暂无内容)'

  const lines: string[] = []
  for (const [name, value] of fields) {
    lines.push(`${name}:`)
    const formatted = formatFieldValue(value, { bullet: '• ' })
    for (const line of formatted.split('\n')) {
      if (line.trim() === '') continue
      lines.push(`  ${line}`)
    }
    lines.push('')
  }
  const text = lines.join('\n').trim()
  return text || '(本章暂无内容)'
}

/** 截断过长文本，避免单页溢出 */
function truncate(text: string): string {
  if (text.length <= MAX_SLIDE_CHARS) return text
  return `${text.slice(0, MAX_SLIDE_CHARS)}\n...(内容已截断，完整内容请查看 docx/pdf)`
}

/** 系统表行：已启用在前（与 docx 同列） */
function systemsTableRows(data: ChapterData): PptxGenJS.TableRow[] {
  const [enabled, disabled] = classifySystems(data)
  const header = ['系统', '状态', '数据类型', '名称'].map((label) => ({
    text: label,
    options: { bold: true, color: COLORS.title, fill: { color: COLORS.accent } }
  }))
  const rows: PptxGenJS.TableRow[] = [header]
  const append = (sysId: string, sysData: ChapterData, status: string): void => {
    const dataType = typeof sysData.data_type === 'string' && sysData.data_type ? sysData.data_type : sysId
    rows.push([
      { text: sysId },
      { text: status },
      { text: dataType },
      { text: systemName(sysId, sysData) }
    ])
  }
  for (const [sysId, sysData] of enabled) append(sysId, sysData, '✅ 启用')
  for (const [sysId, sysData] of disabled) append(sysId, sysData, '未启用')
  return rows
}

/** 已启用系统配置一行式摘要（避免溢出） */
function systemsConfigSummary(data: ChapterData): string {
  const [enabled] = classifySystems(data)
  const lines: string[] = []
  for (const [sysId, sysData] of enabled) {
    const config = isPlainObject(sysData.config) ? sysData.config : {}
    const pairs = Object.entries(config)
      .slice(0, 5)
      .map(([key, value]) => `${key}=${formatFieldValue(value).replace(/\n+/g, ' / ')}`)
    lines.push(`${systemName(sysId, sysData)} (${sysId}): ${pairs.join(', ') || '(无配置)'}`)
  }
  return lines.join('\n')
}

/**
 * 附录页：审核进度文案。
 *
 * 为什么要有：pptx 常被拿去汇报，听众看不到哪些内容是 AI 草稿；一页汇总
 * 比逐字段标注更适合幻灯片。口径与 Markdown/HTML/docx 完全一致
 * （同用 `countFieldStatuses` + `formatFieldStatusSummary`）。
 *
 * 为什么零记录也保留这一页：演示稿的页序固定，附录页忽有忽无会让人以为
 * 漏导出了；固定一行「无审核记录」更好解释。
 */
function reviewProgressLines(doc: CeshuDocument): string[] {
  const total = { ai_draft: 0, human_edited: 0, approved: 0 }
  const pendingChapters: string[] = []
  for (const chapter of CHAPTER_KEYS) {
    const counts = countFieldStatuses(fieldStatusOf(doc.meta, chapter), CESHU_CHAPTER_FIELDS[chapter] ?? [])
    total.ai_draft += counts.ai_draft
    total.human_edited += counts.human_edited
    total.approved += counts.approved
    // 只列还有待审的章：已批准/人改的章不需要催人
    if (counts.ai_draft > 0) {
      pendingChapters.push(`${CHAPTER_LABELS[chapter]}：${counts.ai_draft} 待审`)
    }
  }
  return [`全文档：${formatFieldStatusSummary(total) || '无审核记录'}`, ...pendingChapters]
}

/** pptx 渲染器：返回幻灯片文件 Buffer（写盘由上层 exporter 负责） */
export async function renderCeshuPptx(doc: CeshuDocument): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = asText(doc.meta.game_name) === EMPTY_PLACEHOLDER ? '未命名策划书' : String(doc.meta.game_name)
  pptx.author = 'GameEditorApp'

  const meta = doc.meta
  const gameName = typeof meta.game_name === 'string' && meta.game_name.trim() ? meta.game_name : '未命名策划书'
  const date = formatLocalTimestamp().slice(0, 10)
  const subtitle = `版本: ${doc.version_label} | 类型: ${asText(meta.game_type)} | 日期: ${date}`

  // 第 1 页：封面
  const cover = pptx.addSlide()
  cover.background = { color: COLORS.bg }
  cover.addText(gameName, {
    x: 0.6,
    y: 2.1,
    w: 12,
    h: 1.6,
    fontSize: 44,
    bold: true,
    color: COLORS.title,
    fontFace: FONT,
    align: 'center'
  })
  cover.addText([{ text: subtitle, options: { breakLine: true } }, { text: `定位: ${asText(meta.positioning)}` }], {
    x: 0.6,
    y: 4.1,
    w: 12,
    h: 1.4,
    fontSize: 18,
    color: COLORS.muted,
    fontFace: FONT,
    align: 'center'
  })

  // 每章一页
  const entries = visibleChapterEntries(getGddScope(doc))
  for (const entry of entries) {
    const slide = pptx.addSlide()
    slide.background = { color: COLORS.bg }
    slide.addText(chapterHeading(entry), {
      x: 0.5,
      y: 0.35,
      w: 12.3,
      h: 0.8,
      fontSize: 26,
      bold: true,
      color: COLORS.accent,
      fontFace: FONT
    })

    const data = doc[entry.key]
    if (entry.key === 'systems') {
      slide.addTable(systemsTableRows(data), {
        x: 0.5,
        y: 1.3,
        w: 12.3,
        colW: [2.5, 1.5, 3.3, 5],
        fontSize: 11,
        fontFace: FONT,
        color: COLORS.body,
        border: { type: 'solid', color: '3B4A63', pt: 1 }
      })
      const summary = systemsConfigSummary(data)
      if (summary) {
        slide.addText(truncate(summary), {
          x: 0.5,
          y: 6.1,
          w: 12.3,
          h: 1.2,
          fontSize: 10,
          color: COLORS.muted,
          fontFace: FONT,
          fit: 'shrink'
        })
      }
      continue
    }

    slide.addText(truncate(chapterBodyText(entry.key, data)), {
      x: 0.5,
      y: 1.3,
      w: 12.3,
      h: 5.8,
      fontSize: 14,
      color: COLORS.body,
      fontFace: FONT,
      valign: 'top',
      fit: 'shrink'
    })
  }

  // 附录页：审核进度（放在完成度页之前，与 Markdown 的附录顺序一致）
  const reviewSlide = pptx.addSlide()
  reviewSlide.background = { color: COLORS.bg }
  reviewSlide.addText('附录：审核进度', {
    x: 0.5,
    y: 0.35,
    w: 12.3,
    h: 0.8,
    fontSize: 26,
    bold: true,
    color: COLORS.accent,
    fontFace: FONT
  })
  reviewSlide.addText(reviewProgressLines(doc).join('\n'), {
    x: 0.5,
    y: 1.3,
    w: 12.3,
    h: 5.8,
    fontSize: 14,
    color: COLORS.body,
    fontFace: FONT,
    valign: 'top',
    fit: 'shrink'
  })

  // 末页：章节完成度
  const progress = computeChapterProgress(doc)
  const progressLines = entries.map((entry) => `${CHAPTER_LABELS[entry.key]}: ${Math.round((progress[entry.key] ?? 0) * 100)}%`)
  progressLines.push('', `总进度: ${Math.round((progress.total ?? 0) * 100)}%`)

  const progressSlide = pptx.addSlide()
  progressSlide.background = { color: COLORS.bg }
  progressSlide.addText('章节完成度', {
    x: 0.5,
    y: 0.35,
    w: 12.3,
    h: 0.8,
    fontSize: 26,
    bold: true,
    color: COLORS.accent,
    fontFace: FONT
  })
  progressSlide.addText(progressLines.join('\n'), {
    x: 0.5,
    y: 1.3,
    w: 12.3,
    h: 5.8,
    fontSize: 14,
    color: COLORS.body,
    fontFace: FONT,
    valign: 'top',
    fit: 'shrink'
  })

  const output = await pptx.write({ outputType: 'nodebuffer' })
  return Buffer.from(output as Uint8Array)
}