import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType
} from 'docx'

import {
  SYSTEM_LABELS,
  type CeshuDocument,
  type ChapterData,
} from '@mobai/shared/ceshu/reference'
import { fieldStatusOf } from '@mobai/shared/ceshu/fields'
import { countFieldStatuses, formatFieldStatusSummary } from '@mobai/shared/ceshu/fields'
import { chapterFieldsForDoc, chapterLabelForDoc, computeChapterProgress, formatLocalTimestamp, isPlainObject, isSoftwareDoc, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import {
  EMPTY_PLACEHOLDER,
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
  type PipeTable
} from '../common'

/**
 * 策划书 docx 渲染器（纯函数式，返回 Buffer，写盘由上层 exporter 负责）。
 * 结构参照 旧版 ceshu_docx_exporter：封面元信息 → 各章正文 → 完成度附录。
 */

/** 中文字体（正文与标题统一，避免 Word 回退到默认西文字体） */
const FONT = '微软雅黑'
/** 正文默认字号（半磅，即 11pt） */
const BODY_SIZE = 22

type DocxHeading = (typeof HeadingLevel)[keyof typeof HeadingLevel]

/** 统一中文字体的文本 run */
function textRun(text: string, options: { bold?: boolean } = {}): TextRun {
  return new TextRun({ text, font: FONT, bold: options.bold, size: BODY_SIZE })
}

/** 标题段落（heading 样式 + 中文字体 run） */
function headingParagraph(text: string, level: DocxHeading): Paragraph {
  return new Paragraph({ heading: level, children: [textRun(text)] })
}

/** 单行文本段落 */
function bodyParagraph(text: string): Paragraph {
  return new Paragraph({ children: [textRun(text)] })
}

/** 字段渲染：`字段名: 值`（字段名加粗），多行值逐行成段并保留缩进/列表前缀 */
function fieldParagraphs(name: string, value: unknown): Paragraph[] {
  const lines = formatFieldValue(value, { indent: 0, bullet: '- ' }).split('\n')
  const [first = EMPTY_PLACEHOLDER, ...rest] = lines
  const paragraphs: Paragraph[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [textRun(`${name}: `, { bold: true }), textRun(first)]
    })
  ]
  for (const line of rest) {
    if (line.trim() === '') continue
    paragraphs.push(new Paragraph({ spacing: { after: 40 }, children: [textRun(line)] }))
  }
  return paragraphs
}

/** 系统中文名/数据类型回退 */
function systemName(sysId: string, sysData: ChapterData): string {
  return typeof sysData.name === 'string' && sysData.name ? sysData.name : (SYSTEM_LABELS[sysId] ?? sysId)
}

function systemDataType(sysId: string, sysData: ChapterData): string {
  return typeof sysData.data_type === 'string' && sysData.data_type ? sysData.data_type : sysId
}

/** 系统概览表：列 = 系统 / 状态 / 数据类型 / 名称，已启用在前 */
function systemsTable(data: ChapterData): Table {
  const [enabled, disabled] = classifySystems(data)
  const header = ['系统', '状态', '数据类型', '名称'].map(
    (label) => new TableCell({ children: [new Paragraph({ children: [textRun(label, { bold: true })] })] })
  )
  const rows: TableRow[] = [new TableRow({ children: header })]

  const append = (sysId: string, sysData: ChapterData, status: string): void => {
    const cells = [sysId, status, systemDataType(sysId, sysData), systemName(sysId, sysData)].map(
      (text) => new TableCell({ children: [new Paragraph({ children: [textRun(text)] })] })
    )
    rows.push(new TableRow({ children: cells }))
  }

  for (const [sysId, sysData] of enabled) append(sysId, sysData, '✅ 启用')
  for (const [sysId, sysData] of disabled) append(sysId, sysData, '未启用')

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

/** 「已启用系统配置详情」小节：每个启用系统一个 H3，其 config 每字段一行 */
function enabledSystemDetails(data: ChapterData): Paragraph[] {
  const [enabled] = classifySystems(data)
  if (enabled.length === 0) return []

  const blocks: Paragraph[] = [headingParagraph('已启用系统配置详情', HeadingLevel.HEADING_3)]
  for (const [sysId, sysData] of enabled) {
    blocks.push(headingParagraph(`${systemName(sysId, sysData)} (${sysId})`, HeadingLevel.HEADING_3))
    const config = isPlainObject(sysData.config) ? sysData.config : {}
    const entries = Object.entries(config).filter(([, value]) => !isEmptyValue(value))
    if (entries.length === 0) {
      blocks.push(bodyParagraph('(无配置)'))
      continue
    }
    for (const [key, value] of entries) {
      blocks.push(
        new Paragraph({
          children: [textRun(`${key}: `, { bold: true }), textRun(formatFieldValue(value))]
        })
      )
    }
  }
  return blocks
}

/**
 * 附录：审核进度。
 *
 * 为什么要有：docx 是发给同事「人读」的出口，收件人无法从正文分辨哪些字段
 * 还是 AI 草稿。口径与 Markdown/HTML 的 `renderReviewProgress` 严格一致
 * （同用 `countFieldStatuses` + `formatFieldStatusSummary`），避免同一份文档
 * 在不同格式里报出不同数字。
 *
 * 为什么零记录也输出「无审核记录」：附录若随内容整段消失，收件人会以为
 * 导出漏了东西；固定一行占位更可解释。
 */
function renderReviewProgress(doc: CeshuDocument): Paragraph[] {
  const blocks: Paragraph[] = [headingParagraph('附录：审核进度', HeadingLevel.HEADING_2)]
  const total = { ai_draft: 0, human_edited: 0, approved: 0 }
  const pendingChapters: string[] = []
  for (const chapter of visibleChaptersForDoc(doc)) {
    const counts = countFieldStatuses(fieldStatusOf(doc.meta, chapter), chapterFieldsForDoc(doc, chapter))
    total.ai_draft += counts.ai_draft
    total.human_edited += counts.human_edited
    total.approved += counts.approved
    // 只列还有待审的章：已批准/人改的章不需要催人，列出来只会稀释注意力
    if (counts.ai_draft > 0) {
      pendingChapters.push(`${chapterLabelForDoc(doc, chapter)}：${counts.ai_draft} 待审`)
    }
  }
  blocks.push(bodyParagraph(`全文档：${formatFieldStatusSummary(total) || '无审核记录'}`))
  for (const line of pendingChapters) blocks.push(bodyParagraph(line))
  return blocks
}

/** 字段中文标签段落（pipeList 表格前用，表格另起一段） */
function fieldLabelParagraph(label: string): Paragraph {
  return new Paragraph({ spacing: { before: 120, after: 40 }, children: [textRun(`${label}:`, { bold: true })] })
}

/** pipeList → Word 表格（表头加粗） */
function pipeTableToDocx(table: PipeTable): Table {
  const header = new TableRow({
    children: table.headers.map(
      (label) => new TableCell({ children: [new Paragraph({ children: [textRun(label, { bold: true })] })] })
    )
  })
  const rows: TableRow[] = [header]
  for (const row of table.rows) {
    rows.push(
      new TableRow({
        children: row.map(
          (cell) => new TableCell({ children: [new Paragraph({ children: [textRun(cell)] })] })
        )
      })
    )
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

/** 单个字段 → 段落/表格（pipeList 有列定义时渲染成真表格，否则回落成文本段落） */
function fieldBlock(doc: CeshuDocument, chapter: string, fieldKey: string, value: unknown): Array<Paragraph | Table> {
  const label = fieldLabelForDoc(doc, chapter, fieldKey)
  const table = pipeTableForDoc(doc, chapter, fieldKey, value)
  if (table !== null) return [fieldLabelParagraph(label), pipeTableToDocx(table)]
  return fieldParagraphs(label, value)
}

/** 附录：验收与机读数据（正文只留人读字段，机读表格集中在此） */
function renderMachineAppendix(doc: CeshuDocument): Array<Paragraph | Table> {
  const blocks: Array<Paragraph | Table> = []
  let any = false
  for (const entry of visibleChapterEntriesForDoc(doc)) {
    const data = chapterDataForDocExport(doc, entry.key)
    if (!data) continue
    const machine = machineFieldEntriesForDoc(doc, entry.key, data)
    if (machine.length === 0) continue
    if (!any) {
      blocks.push(headingParagraph('附录：验收与机读数据', HeadingLevel.HEADING_2))
      any = true
    }
    blocks.push(headingParagraph(chapterHeadingForDoc(doc, entry), HeadingLevel.HEADING_3))
    for (const [fieldKey, value] of machine) blocks.push(...fieldBlock(doc, entry.key, fieldKey, value))
  }
  return blocks
}

/** docx 渲染器：返回文档 Buffer（写盘由上层 exporter 负责） */
export async function renderCeshuDocx(doc: CeshuDocument): Promise<Buffer> {
  const meta = doc.meta
  const isApp = isSoftwareDoc(doc)
  const rawName = isApp
    ? (typeof meta.project_name === 'string' && meta.project_name.trim() ? meta.project_name : meta.game_name)
    : meta.game_name
  const gameName =
    typeof rawName === 'string' && rawName.trim() ? rawName : (isApp ? '未命名软件设计文档' : '未命名策划书')
  const platform = Array.isArray(meta.platform)
    ? meta.platform.filter((item): item is string => typeof item === 'string').join('、')
    : ''
  const gameType = isApp
    ? platform || EMPTY_PLACEHOLDER
    : typeof meta.game_type === 'string' && meta.game_type.trim() ? meta.game_type : EMPTY_PLACEHOLDER
  const positioning =
    typeof meta.positioning === 'string' && meta.positioning.trim() ? meta.positioning : EMPTY_PLACEHOLDER
  const date = formatLocalTimestamp().slice(0, 10)

  const entries = visibleChapterEntriesForDoc(doc)

  // 正文：目录域 → 章节 → 机读附录 → 内部附录（审核进度 / 完成度）
  const children: Array<Paragraph | Table> = [
    new Paragraph({ children: [new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-2' })] }),
    new Paragraph({
      children: [
        new TextRun({
          text: '（若目录为空，请在 Word 中右键「更新域」或按 F9 刷新页码）',
          font: FONT,
          size: 16,
          color: '888888'
        })
      ]
    })
  ]

  for (const entry of entries) {
    children.push(headingParagraph(chapterHeadingForDoc(doc, entry), HeadingLevel.HEADING_2))
    const data = chapterDataForDocExport(doc, entry.key)
    if (entry.key === 'systems') {
      children.push(systemsTable(data), ...enabledSystemDetails(data))
      continue
    }
    const fields = data ? orderedFieldEntriesForDoc(doc, entry.key, data) : []
    if (fields.length === 0) {
      children.push(bodyParagraph('(本章暂无内容)'))
      continue
    }
    for (const [fieldKey, value] of fields) children.push(...fieldBlock(doc, entry.key, fieldKey, value))
  }

  // 附录：验收与机读数据（机读表格集中在此，不切碎正文）
  children.push(...renderMachineAppendix(doc))

  // 附录：审核进度（放在完成度之前，与 Markdown 的附录顺序一致）
  children.push(...renderReviewProgress(doc))

  // 附录：章节完成度
  const progress = computeChapterProgress(doc)
  children.push(headingParagraph('附录：小节完成度', HeadingLevel.HEADING_2))
  for (const entry of entries) {
    const percent = Math.round((progress[entry.key] ?? 0) * 100)
    children.push(bodyParagraph(`${chapterLabelForDoc(doc, entry.key)}: ${percent}%`))
  }
  children.push(bodyParagraph(`总进度: ${Math.round((progress.total ?? 0) * 100)}%`))

  // 封面（独立分节，不显示页码）
  const cover: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 3000, after: 200 },
      children: [new TextRun({ text: gameName, font: FONT, bold: true, size: 56 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: '游戏设计文档（GDD）', font: FONT, size: 32 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: `版本 ${doc.version_label || 'v1.0'} · ${date}`, font: FONT, size: 24 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: `类型：${gameType}`, font: FONT, size: 24 })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `定位：${positioning}`, font: FONT, size: 24 })]
    })
  ]

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: '第 ', font: FONT, size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18 }),
          new TextRun({ text: ' 页', font: FONT, size: 18 })
        ]
      })
    ]
  })

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: { eastAsia: FONT, ascii: FONT, hAnsi: FONT } },
          paragraph: { spacing: { after: 120, line: 276 } }
        }
      }
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children: cover
      },
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        footers: { default: footer },
        children
      }
    ]
  })

  return Packer.toBuffer(document)
}