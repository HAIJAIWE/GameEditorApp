import { randomUUID } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import ExcelJS from 'exceljs'

import { getTypeByLegacyKey } from '../../shared/schema/core/typeSchema'
import { orderHeadersWithId, RECORD_ID_KEY } from '../../shared/util/recordHeaders'
import type { ParsedImport } from './importSession'
import type { DataTypeDef, ExportSummary, ImportSummary, ItemRecord } from '../../shared/types'
import type { DataService, ImportRecord } from './service'

/**
 * Excel 导入/导出。
 * 样式与 ceshu excel 导出共享同一套约定：表头蓝底（FF4472C4）白字加粗 + 细边框、冻结首行、列宽 clamp 8~60。
 *
 * 有意偏离 旧版（均为修正）：
 * - 工作表名用 def.name（中文，如「角色」），而非硬编码 EXCEL_TYPE_LABELS —— 那份表还漏了
 *   story/task/dialog/job；用 def.name 覆盖全部 12 类且不会与 schema 脱节。往返兼容 旧版 文件，
 *   因为那些 sheet 名恰好等于 def.name。
 * - 表头取该类型全部条目键的并集（保首次出现顺序），而非 旧版 只取 items[0].keys()——
 *   避免首条缺字段导致后续条目数据落表丢失。
 * - 列宽 clamp 到 [8, 60]。
 */

/** 样式常量（exceljs 需要 ARGB，故补 FF 前缀） */
const HEADER_FILL_COLOR = 'FF4472C4'
const HEADER_FONT_COLOR = 'FFFFFFFF'
const BORDER_COLOR = 'FFD9D9D9'
const ALT_ROW_FILL_COLOR = 'FFF2F2F2'
const HEADER_FONT_NAME = 'Microsoft YaHei'
const MAX_CELL_LEN = 40
const COLUMN_WIDTH_PAD = 4
const MIN_COLUMN_WIDTH = 8
const MAX_COLUMN_WIDTH = 60
const EXPORT_FILE_NAME = 'game_data.xlsx'

/** 单元格可落表的原始值（数组/对象经 JSON.stringify 后变字符串） */
type CellValue = string | number | boolean | null

/** 构建工作簿（纯内存，便于单测直接断言单元格） */
export function buildDataWorkbook(records: ItemRecord[], types: DataTypeDef[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  for (const def of types) {
    const items = records.filter((record) => record.type === def.id)
    if (items.length === 0) continue
    writeTypeSheet(workbook, def.name, items)
  }
  return workbook
}

/** 渲染为 xlsx 字节（导出管道负责原子写盘） */
export async function renderDataExcel(records: ItemRecord[], types: DataTypeDef[]): Promise<Buffer> {
  const buffer = await buildDataWorkbook(records, types).xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * 导出全部 schema 类型条目到 `${dir}/game_data.xlsx`（原子写：.tmp → rename）。
 * 非 schema 类型（record.type 未命中）被跳过，且不计入汇总。
 */
export async function exportExcelFile(
  dir: string,
  service: DataService,
  types: DataTypeDef[]
): Promise<ExportSummary> {
  const records = service.listAllItems().filter((record) => types.some((def) => def.id === record.type))
  const buffer = await renderDataExcel(records, types)
  const filePath = join(dir, EXPORT_FILE_NAME)
  const tempPath = `${filePath}.tmp`
  try {
    await writeFile(tempPath, buffer)
    await rename(tempPath, filePath)
  } catch (error) {
    throw new Error(`写入导出文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  const byType: Record<string, number> = {}
  for (const record of records) byType[record.type] = (byType[record.type] ?? 0) + 1
  return { filePath, totalItems: records.length, byType }
}

/**
 * 从 Excel 工作簿导入（工作表名映射到数据类型）。
 * - sheet 名 → 类型：先按 def.name 匹配，否则按旧版复数/单数键，最后回退 sheetTitle.toLowerCase()
 * - 未命中任何 schema 类型的 sheet 数据仍入库（type 用回退名），并在 unknownTypes 中报告
 * - 首行为表头；其后非空行构造条目，缺 id 时生成 UUID 回写
 */
/**
 * 只解析、不落库（导入预览用）。`importExcelFile` 也走它，保证「预览看到的」与「导入写入的」是同一份。
 */
export async function parseExcelImport(filePath: string, types: DataTypeDef[]): Promise<ParsedImport> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(filePath)
  } catch (error) {
    throw new Error(`读取 Excel 文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  const records: ImportRecord[] = []
  const unknownTypes: Record<string, number> = {}
  /** 没有 id 列的工作表：每行都会被当新条目（可能整表翻倍），要报出来 */
  const missingIdSources: string[] = []
  let skipped = 0

  for (const worksheet of workbook.worksheets) {
    const sheetTitle = worksheet.name
    const matched = types.find((def) => def.name === sheetTitle) ?? getTypeByLegacyKey(types, sheetTitle)
    const resolvedType = matched ? matched.id : sheetTitle.toLowerCase()

    const headerRow = worksheet.getRow(1)
    const headers: string[] = []
    for (let col = 1; col <= headerRow.cellCount; col += 1) {
      const raw = readCellRaw(headerRow.getCell(col))
      headers.push(String(raw ?? ''))
    }
    if (headers.every((header) => header === '')) continue

    // 该表有没有 id 列：没有 ⇒ 下面每一行都会拿到新 id（= 新增），必须报给用户
    const hasIdColumn = headers.includes(RECORD_ID_KEY)
    let sheetRows = 0

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const item: Record<string, unknown> = {}
      let rowHasValue = false
      for (let col = 1; col <= headers.length; col += 1) {
        const header = headers[col - 1]
        const raw = readCellRaw(row.getCell(col))
        if (!isBlank(raw)) rowHasValue = true
        if (!header || isBlank(raw)) continue
        item[header] = parseCellValue(raw)
      }
      if (!rowHasValue) return
      if (Object.keys(item).length === 0) {
        // 整行数据都落在无表头的列 → 无法构造条目
        skipped += 1
        return
      }
      const rawId = item['id']
      const id = typeof rawId === 'string' && rawId !== '' ? rawId : randomUUID()
      if (id !== rawId) item['id'] = id

      records.push({ type: resolvedType, id, data: item })
      sheetRows += 1
      if (!matched) unknownTypes[sheetTitle] = (unknownTypes[sheetTitle] ?? 0) + 1
    })

    if (!hasIdColumn && sheetRows > 0) missingIdSources.push(`工作表「${sheetTitle}」`)
  }

  return { records, skipped, unknownTypes, missingIdSources }
}

/** 解析 + 立即落库（不预览的快捷路径；菜单走的是 preview → apply） */
export async function importExcelFile(
  filePath: string,
  service: DataService,
  types: DataTypeDef[]
): Promise<ImportSummary> {
  const parsed = await parseExcelImport(filePath, types)
  return applyParsedImport(filePath, parsed, service)
}

/** 把解析结果落库并汇总（预览确认后也走这里，保证两条路径同一套计数） */
export async function applyParsedImport(
  filePath: string,
  parsed: ParsedImport,
  service: DataService
): Promise<ImportSummary> {
  const { imported, updated } = await service.importRecords(parsed.records)

  const byType: Record<string, number> = {}
  for (const record of parsed.records) {
    byType[record.type] = (byType[record.type] ?? 0) + 1
  }

  return {
    filePath,
    totalItems: parsed.records.length + parsed.skipped,
    imported,
    updated,
    skipped: parsed.skipped,
    byType,
    unknownTypes: parsed.unknownTypes,
    missingIdSources: parsed.missingIdSources
  }
}

/* ---- 内部辅助 ---- */

/** 写入一个类型 Sheet：表头样式 + 正文样式 + 隔行底色 + 冻结首行 + 自动筛选 + 自适应列宽 */
function writeTypeSheet(workbook: ExcelJS.Workbook, name: string, items: ItemRecord[]): void {
  const sheet = workbook.addWorksheet(name)

  const collected: string[] = []
  for (const item of items) {
    for (const key of Object.keys(item.data)) {
      if (!collected.includes(key)) collected.push(key)
    }
  }
  // id 是往返主键，固定放首列（放最后极易被整列删掉，删了导入就全表翻倍）
  const headers = orderHeadersWithId(collected)
  const rows: CellValue[][] = items.map((item) => headers.map((header) => serializeCell(item.data[header])))

  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)

  const headerRow = sheet.getRow(1)
  for (let col = 1; col <= headers.length; col += 1) {
    const cell = headerRow.getCell(col)
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR }, name: HEADER_FONT_NAME }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_COLOR } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = thinBorder()
  }

  for (let index = 0; index < rows.length; index += 1) {
    const sheetRow = sheet.getRow(index + 2)
    // 数据行序号从 1 开始，偶数行加底
    const isEvenOrdinal = (index + 1) % 2 === 0
    for (let col = 1; col <= headers.length; col += 1) {
      const cell = sheetRow.getCell(col)
      cell.alignment = { wrapText: true, vertical: 'middle' }
      cell.border = thinBorder()
      if (isEvenOrdinal) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_ROW_FILL_COLOR } }
      }
    }
  }

  if (headers.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: headers.length }
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]

  headers.forEach((header, index) => {
    let maxLength = String(header).length
    for (const row of rows) {
      const value = row[index]
      if (value === null || value === undefined) continue
      maxLength = Math.max(maxLength, Math.min(String(value).length, MAX_CELL_LEN))
    }
    const width = Math.min(Math.max(maxLength + COLUMN_WIDTH_PAD, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH)
    sheet.getColumn(index + 1).width = width
  })
}

/** 值落表规则：null/undefined → 空；数组/对象 → JSON 字符串；字符串/数字/布尔原样 */
function serializeCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

/** 取单元格原始值：普通文本/数字/布尔直接返回；富文本/公式对象取其 text/result；其余转字符串 */
function readCellRaw(cell: ExcelJS.Cell): unknown {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'object') {
    const record = value as unknown as Record<string, unknown>
    const result = record['result']
    if (result !== undefined) {
      return result === null || typeof result === 'object' ? cell.text : result
    }
    const text = record['text']
    if (typeof text === 'string') return text
    const richText = record['richText']
    if (Array.isArray(richText)) {
      return richText
        .map((run) =>
          typeof run === 'object' && run !== null ? String((run as { text?: unknown }).text ?? '') : ''
        )
        .join('')
    }
    return cell.text
  }
  return String(value)
}

/** 单元格文本若是 JSON 数组/对象（以 [ 或 { 开头），尝试解析；失败原样返回 */
function parseCellValue(value: unknown): unknown {
  if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/** 细边框（每次新建，避免多单元格共享同一对象） */
function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER_COLOR } }
  return { top: side, left: side, bottom: side, right: side }
}
