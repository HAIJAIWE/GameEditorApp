import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'

import {
  CHAPTER_LABELS,
  SYSTEM_LABELS,
  type CeshuDocument,
  type ChapterData
} from '../../../shared/ceshu/ceshuConstants'
import { computeChapterProgress, formatLocalTimestamp, getGddScope, isPlainObject } from '../../../shared/ceshu/ceshuModel'
import {
  EMPTY_PLACEHOLDER,
  chapterHeading,
  classifySystems,
  formatFieldValue,
  orderedFieldEntries,
  visibleChapterEntries
} from './common'

/**
 * 策划书 docx 渲染器（纯函数式，返回 Buffer，写盘由上层 exporter 负责）。
 * 结构参照 Python ceshu_docx_exporter.py：封面元信息 → 各章正文 → 完成度附录。
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

/** 系统中文名/数据类型回退（与 Python name/data_type 缺省规则一致） */
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
    const entries = Object.entries(config)
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

/** docx 渲染器：返回文档 Buffer（写盘由上层 exporter 负责） */
export async function renderCeshuDocx(doc: CeshuDocument): Promise<Buffer> {
  const meta = doc.meta
  const gameName =
    typeof meta.game_name === 'string' && meta.game_name.trim() ? meta.game_name : '未命名策划书'
  const gameType =
    typeof meta.game_type === 'string' && meta.game_type.trim() ? meta.game_type : EMPTY_PLACEHOLDER
  const positioning =
    typeof meta.positioning === 'string' && meta.positioning.trim() ? meta.positioning : EMPTY_PLACEHOLDER
  const date = formatLocalTimestamp().slice(0, 10)

  const children: Array<Paragraph | Table> = [
    headingParagraph(gameName, HeadingLevel.HEADING_1),
    bodyParagraph(`版本: ${doc.version_label} | 类型: ${gameType} | 日期: ${date}`),
    bodyParagraph(`定位: ${positioning}`)
  ]

  const entries = visibleChapterEntries(getGddScope(doc))
  for (const entry of entries) {
    children.push(headingParagraph(chapterHeading(entry), HeadingLevel.HEADING_2))
    const data = doc[entry.key]
    if (entry.key === 'systems') {
      children.push(systemsTable(data), ...enabledSystemDetails(data))
      continue
    }
    const fields = orderedFieldEntries(entry.key, data)
    if (fields.length === 0) {
      children.push(bodyParagraph('(本章暂无内容)'))
      continue
    }
    for (const [name, value] of fields) children.push(...fieldParagraphs(name, value))
  }

  // 附录：章节完成度
  const progress = computeChapterProgress(doc)
  children.push(headingParagraph('附录：章节完成度', HeadingLevel.HEADING_2))
  for (const entry of entries) {
    const percent = Math.round((progress[entry.key] ?? 0) * 100)
    children.push(bodyParagraph(`${CHAPTER_LABELS[entry.key]}: ${percent}%`))
  }
  children.push(bodyParagraph(`总进度: ${Math.round((progress.total ?? 0) * 100)}%`))

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
        children
      }
    ]
  })

  return Packer.toBuffer(document)
}