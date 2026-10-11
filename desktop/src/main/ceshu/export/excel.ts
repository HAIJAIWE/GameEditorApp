import ExcelJS from 'exceljs'

import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterData } from '../../../shared/ceschu/ceshuConstants'
import { computeChapterProgress, isPlainObject } from '../../../shared/ceschu/ceshuModel'
import { validateCeshu } from '../../../shared/ceschu/ceshuValidation'

import { classifySystems, formatFieldValue } from './common'

/**
 * Excel 导出（自 Python core/ceshu/ceshu_excel_exporter.py 匹平迁移，改用 exceljs）。
 * 8 个 Sheet：概览 / 系统配置 / 数值表 / 角色 / 里程碑 / 风险 / 竞品 / 校验报告。
 * 共同样式：标题行加粗白字 + 蓝底（4472C4）、冻结首行、列宽自适应（表头/正文首行长度 +2，clamp 8~60）。
 * 与 Python 一致：数值型字符串按 int/float 落表（保证 Excel 里是数字而非文本）。
 * 有意偏离：Python 定义了但从未使用的 _SUBHEADER_FILL_COLOR / _DATE_FORMAT 未移植。
 */

/** 样式常量（exceljs 需要 ARGB，故补 FF 前缀） */
const HEADER_FILL_COLOR = 'FF4472C4'
const HEADER_FONT_COLOR = 'FFFFFFFF'
const MIN_COLUMN_WIDTH = 8
const MAX_COLUMN_WIDTH = 60

type CellValue = string | number | boolean | null

/** 构建工作簿（纯内存，便于单测直接断言单元格） */
export function buildExcelWorkbook(doc: CeshuDocument): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  writeOverviewSheet(workbook, doc)
  writeSystemsSheet(workbook, doc)
  writeNumericSheet(workbook, doc)
  writeCharactersSheet(workbook, doc)
  writeMilestonesSheet(workbook, doc)
  writeRisksSheet(workbook, doc)
  writeCompetitorsSheet(workbook, doc)
  writeValidationSheet(workbook, doc)
  return workbook
}

/** 渲染为 xlsx 字节（导出管道负责原子写盘） */
export async function renderCeshuExcel(doc: CeshuDocument): Promise<Buffer> {
  const buffer = await buildExcelWorkbook(doc).xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/* ---- Sheet 1：概览 ---- */

function writeOverviewSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const progress = computeChapterProgress(doc)
  const rows: CellValue[][] = [
    ['游戏名称', readText(doc.meta.game_name)],
    ['游戏类型', readText(doc.meta.game_type)],
    ['版本标签', doc.version_label || 'v1.0'],
    ['版本号', doc.version],
    ['创建时间', doc.created_at],
    ['更新时间', doc.updated_at],
    ['风格', doc.style],
    ['模块类型', doc.module_type],
    ['总完成度', coerceNumeric(`${progress['total'] ?? 0}`)]
  ]
  for (const key of CHAPTER_KEYS) {
    rows.push([CHAPTER_LABELS[key], coerceNumeric(`${progress[key] ?? 0}`)])
  }
  writeSheet(workbook, '概览', ['项目', '值'], rows)
}

/* ---- Sheet 2：系统配置 ---- */

function writeSystemsSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const [enabled, disabled] = classifySystems(doc.systems)
  const allEntries = [...enabled, ...disabled]
  const allFields: string[] = []
  for (const [, data] of allEntries) {
    const config = readConfig(data)
    for (const field of Object.keys(config)) {
      if (!allFields.includes(field)) allFields.push(field)
    }
  }
  const rows: CellValue[][] = allEntries.map(([systemId, data]) => {
    const config = readConfig(data)
    return [
      systemId,
      readText(data['name']) || systemId,
      data['enabled'] ? '启用' : '未启用',
      ...allFields.map((field) => formatFieldValue(config[field]))
    ]
  })
  writeSheet(workbook, '系统配置', ['系统Key', '系统名称', '状态', ...allFields], rows)
}

/* ---- Sheet 3：数值表 ---- */

function writeNumericSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const rows: CellValue[][] = []
  for (const [key, value] of Object.entries(chapterOf(doc, 'numeric'))) {
    if (Array.isArray(value) || isPlainObject(value)) {
      rows.push([key, coerceNumeric(formatFieldValue(value))])
      continue
    }
    if (typeof value === 'string') {
      rows.push([key, coerceNumeric(value)])
      continue
    }
    rows.push([key, (value ?? null) as CellValue])
  }
  writeSheet(workbook, '数值表', ['参数名', '值'], rows)
}

/* ---- Sheet 4：角色 ---- */

function writeCharactersSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const characters = chapterOf(doc, 'characters')
  const rows: CellValue[][] = []
  const npcList = Array.isArray(characters['npc_list']) ? characters['npc_list'] : []
  npcList.forEach((npc, index) => {
    if (isPlainObject(npc)) {
      rows.push([
        index + 1,
        readText(npc['name']),
        readText(npc['role']),
        readText(npc['location']),
        readText(npc['personality']),
        readText(npc['quest_hook'])
      ])
    } else {
      rows.push([index + 1, String(npc), '', '', '', ''])
    }
  })
  if (characters['protagonist']) {
    rows.push(['', '主角', '', '', '', readText(characters['protagonist'])])
  }
  writeSheet(workbook, '角色', ['序号', '名称', '角色类型', '位置', '性格', '任务钩子'], rows)
}

/* ---- Sheet 5：里程碑 ---- */

function writeMilestonesSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const milestones = chapterOf(doc, 'mvp')['milestones']
  const rows: CellValue[][] = []
  ;(Array.isArray(milestones) ? milestones : []).forEach((milestone, index) => {
    if (isPlainObject(milestone)) {
      const deliverables = milestone['deliverables']
      rows.push([
        index + 1,
        readText(milestone['name']),
        readText(milestone['date']),
        Array.isArray(deliverables) ? deliverables.map((item) => String(item)).join(', ') : readText(deliverables),
        readText(milestone['acceptance'])
      ])
    } else {
      rows.push([index + 1, String(milestone), '', '', ''])
    }
  })
  writeSheet(workbook, '里程碑', ['序号', '名称', '日期', '交付物', '验收标准'], rows)
}

/* ---- Sheet 6：风险 ---- */

function writeRisksSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const riskMatrix = chapterOf(doc, 'risk_handling')['risk_matrix']
  const rows: CellValue[][] = []
  ;(Array.isArray(riskMatrix) ? riskMatrix : []).forEach((risk, index) => {
    if (isPlainObject(risk)) {
      rows.push([
        index + 1,
        readText(risk['risk']),
        readText(risk['probability']),
        readText(risk['impact']),
        readText(risk['mitigation']),
        readText(risk['owner'])
      ])
    } else {
      rows.push([index + 1, String(risk), '', '', '', ''])
    }
  })
  writeSheet(workbook, '风险', ['序号', '风险', '概率', '影响', '缓解措施', '负责人'], rows)
}

/* ---- Sheet 7：竞品 ---- */

function writeCompetitorsSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  const competitors = chapterOf(doc, 'market_analysis')['competitors']
  const rows: CellValue[][] = []
  ;(Array.isArray(competitors) ? competitors : []).forEach((competitor, index) => {
    if (isPlainObject(competitor)) {
      rows.push([
        index + 1,
        readText(competitor['name']),
        readText(competitor['type']),
        readText(competitor['strengths']),
        readText(competitor['weaknesses']),
        readText(competitor['market_share'])
      ])
    } else {
      rows.push([index + 1, String(competitor), '', '', '', ''])
    }
  })
  writeSheet(workbook, '竞品', ['序号', '名称', '类型', '优势', '劣势', '市场份额'], rows)
}

/* ---- Sheet 8：校验报告 ---- */

function writeValidationSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  let errors: string[]
  try {
    errors = validateCeshu(doc)
  } catch (error) {
    errors = [`校验过程异常: ${error instanceof Error ? error.message : String(error)}`]
  }
  const rows: CellValue[][] =
    errors.length === 0
      ? [[1, '✅ 所有校验通过，未发现错误']]
      : errors.map((message, index) => [index + 1, message])
  writeSheet(workbook, '校验报告', ['序号', '问题描述'], rows)
}

/* ---- 公共写入 ---- */

/** 写入一个 Sheet：标题行样式 + 数据行 + 冻结首行 + 自适应列宽 */
function writeSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: CellValue[][]): void {
  const sheet = workbook.addWorksheet(safeSheetName(name))
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)

  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true, size: 11, color: { argb: HEADER_FONT_COLOR } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  headers.forEach((header, index) => {
    let maxLength = String(header).length
    for (const row of rows) {
      const value = row[index]
      if (value === null || value === undefined) continue
      const firstLine = String(value).split('\n')[0] ?? ''
      maxLength = Math.max(maxLength, firstLine.length)
    }
    sheet.getColumn(index + 1).width = Math.min(Math.max(maxLength + 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
  })
}

/** Excel sheet 名兜底：剔除非法字符 []:*?/\ 并限制 ≤31 字符（本项目章节标签均合规） */
function safeSheetName(name: string): string {
  const sanitized = name.replace(/[[\]:*?/\\]/g, '_')
  return sanitized.length > 31 ? sanitized.slice(0, 31) : sanitized
}

/** 数值型字符串转 int/float（对应 Python _coerce_numeric；仅接受十进制字面量，其余原样返回） */
function coerceNumeric(value: unknown): CellValue {
  if (typeof value !== 'string' || value === '') return (value ?? null) as CellValue
  const trimmed = value.trim()
  if (/^[+-]?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  if (/^[+-]?(\d+\.\d*|\.\d+)$/.test(trimmed)) return Number.parseFloat(trimmed)
  return value
}

function chapterOf(doc: CeshuDocument, key: 'numeric' | 'characters' | 'mvp' | 'risk_handling' | 'market_analysis'): ChapterData {
  const data = doc[key]
  return isPlainObject(data) ? data : {}
}

function readConfig(data: ChapterData): Record<string, unknown> {
  const config = data['config']
  return isPlainObject(config) ? config : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}