import ExcelJS from 'exceljs'

import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterData } from '../../../shared/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshuFields'
import { fieldStatusOf } from '../../../shared/ceshuFieldStatus'
import { countFieldStatuses, formatFieldStatusSummary } from '../../../shared/ceshuFieldStatusStats'
import { computeChapterProgress, isPlainObject } from '../../../shared/ceshuModel'
import { validateCeshu } from '../../../shared/ceshuValidation'
import {
  groupValidationMessages,
  VALIDATION_SEVERITY_LABELS,
  type ValidationSeverity
} from '../../../shared/ceshuValidationGroups'

import { classifySystems, formatFieldValue } from './common'
import { readText } from '../../../shared/util/readText'

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

  /*
   * 审核进度：Excel 常被转发给同事看，收件人没有应用可查状态，
   * 所以把「审到哪了」直接写进概览 —— 否则对方只能靠猜。
   * 口径与界面上方摘要一致（都走 countFieldStatuses，只统计 schema 内字段），
   * 避免出现「表里说 3 个待审、应用里只有 2 个徽标」。
   */
  const perChapter = CHAPTER_KEYS.map((chapter) => ({
    chapter,
    counts: countFieldStatuses(fieldStatusOf(doc.meta, chapter), CESHU_CHAPTER_FIELDS[chapter] ?? [])
  }))
  const totals = { ai_draft: 0, human_edited: 0, approved: 0 }
  for (const { counts } of perChapter) {
    totals.ai_draft += counts.ai_draft
    totals.human_edited += counts.human_edited
    totals.approved += counts.approved
  }
  // 三态全零说明这份文档从没走过审核流程，写空串会让人以为是导出出错
  const hasRecord = totals.ai_draft + totals.human_edited + totals.approved > 0
  rows.push(['审核进度', hasRecord ? formatFieldStatusSummary(totals) : '无审核记录'])
  // 只列还有待审的章节：审核者只关心「哪几章还没审」，已审完的章节列出来纯属噪音
  for (const { chapter, counts } of perChapter) {
    if (counts.ai_draft > 0) rows.push([`待审字段（${CHAPTER_LABELS[chapter]}）`, counts.ai_draft])
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
  const characters = chapterOf(doc, 'story')
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

/** 严重度图标（⛔/⚠ 均为单码位字符，不带变体选择符，Excel 各版本渲染一致） */
const VALIDATION_SEVERITY_ICONS: Record<ValidationSeverity, string> = {
  error: '⛔',
  warning: '⚠'
}

function writeValidationSheet(workbook: ExcelJS.Workbook, doc: CeshuDocument): void {
  let messages: string[]
  try {
    messages = validateCeshu(doc)
  } catch (error) {
    messages = [`校验过程异常: ${error instanceof Error ? error.message : String(error)}`]
  }
  /*
   * 按严重度分组而不是平铺：这份 xlsx 常被转发给不看应用的人，
   * 平铺时「必填没写」会被夹在「术语不统一」之间，读者得逐行判断哪条要紧。
   * 分组后 error 组天然排在前（顺序由 groupValidationMessages 保证），先给结论再给细节。
   * 通过提示语仍放在「问题」列（前两列留空），既不伪造严重度/类别，也保留原文案。
   */
  const rows: CellValue[][] =
    messages.length === 0
      ? [['', '', '✅ 所有校验通过，未发现错误']]
      : groupValidationMessages(messages).flatMap((group) =>
          group.items.map((item) => [
            `${VALIDATION_SEVERITY_ICONS[group.severity]} ${VALIDATION_SEVERITY_LABELS[group.severity]}`,
            group.label,
            item.message
          ])
        )
  writeSheet(workbook, '校验报告', ['严重度', '类别', '问题'], rows)
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

function chapterOf(doc: CeshuDocument, key: 'numeric' | 'story' | 'mvp' | 'risk_handling' | 'market_analysis'): ChapterData {
  const data = doc[key]
  return isPlainObject(data) ? data : {}
}

function readConfig(data: ChapterData): Record<string, unknown> {
  const config = data['config']
  return isPlainObject(config) ? config : {}
}

