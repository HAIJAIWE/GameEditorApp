import { randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { getTypeByLegacyKey } from '../../shared/typeSchema'
import { orderHeadersWithId, RECORD_ID_KEY } from '../../shared/util/recordHeaders'
import type { ParsedImport } from './importSession'
import type {
  CsvExportSummary,
  DataTypeDef,
  FieldType,
  ImportSummary,
  ItemRecord,
  TypeFieldDef
} from '../../shared/types'
import type { DataService, ImportRecord } from './service'

/**
 * CSV 导入/导出（Phase 1 数据核心）：匹平 早期版本 `export_csv` / `import_csv`。
 * - 导出：每种数据类型一个独立文件，文件名为该类型的复数键
 * - 导入：以文件名的 stem 作为数据类型键（复数键 → 单数类型 id，未收录键保留原键名入库）
 *
 * 相对 早期版本的**有意修正**：
 * - 复杂值（数组/对象）序列化为**真 JSON**（旧版 `csv` 对 list/dict 直接 str() 出单引号伪 JSON，
 *   往返会坏）；导入侧用 `decodeCsvCell` 还原回对象。
 * - 导入侧再按 schema 把**数字类字段**（`spinbox` / `double_spin`）从文本还原为 `number`：
 *   CSV 天然只有字符串，不还原会让这类字段从数字退化成字符串，违反
 *   `itemFormUtils` 建立的「数字类字段存真数字」不变量（后果：批量调数会静默跳过这些条目）。
 * - 表头取**全部条目键的并集**。
 * - 写出 UTF-8 BOM 且行分隔用 CRLF（Excel 打开中文/换行更友好）。
 */

/** 单元格值 → CSV 文本片段（不含引号转义，转义在 buildCsvText 内统一处理）。 */
export function serializeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/** 全部条目键的并集，按首次出现顺序去重（异质条目不丢列）。 */
export function collectHeaders(records: ItemRecord[]): string[] {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const record of records) {
    for (const key of Object.keys(record.data)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }
  // id 是往返主键，固定放首列（放最后极易被整列删掉，删了导入就全表翻倍）
  return orderHeadersWithId(headers)
}

/** 需要引号包裹时按 RFC4180 转义（值含 , " \r \n 之一）。 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\r') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

/**
 * 构造 CSV 文本：首行表头，其后每行按表头取值。
 * 行分隔用 `\r\n`（Excel 友好）；records 为空时返回 `''`（不产文件）。
 */
export function buildCsvText(records: ItemRecord[]): string {
  if (records.length === 0) {
    return ''
  }
  const headers = collectHeaders(records)
  const lines: string[] = [headers.map((header) => escapeCsvField(header)).join(',')]
  for (const record of records) {
    lines.push(headers.map((header) => escapeCsvField(serializeCsvCell(record.data[header]))).join(','))
  }
  return `${lines.join('\r\n')}\r\n`
}

/**
 * RFC4180 风格状态机解析器：正确处理引号内的逗号/换行/`""` 转义；
 * CRLF 与 LF 皆可；忽略末尾完全空白的行；空文本返回 `[]`。
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  if (text.length === 0) {
    return rows
  }

  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }

    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }

    if (ch === '\r') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      i += text[i + 1] === '\n' ? 2 : 1
      continue
    }

    if (ch === '\n') {
      row.push(field)
      field = ''
      rows.push(row)
      row = []
      i++
      continue
    }

    field += ch
    i++
  }

  row.push(field)
  rows.push(row)

  // 去掉末尾完全空白的行（CRLF/LF 收尾产生的空行伪影）
  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell === '')) {
    rows.pop()
  }
  return rows
}

/** 若文本是 JSON 数组/对象（以 [ 或 { 开头），尝试解析；失败或非该形状则原样返回字符串。 */
export function decodeCsvCell(raw: string): unknown {
  const first = raw[0]
  if (first === '[' || first === '{') {
    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  }
  return raw
}

/**
 * 按 schema 声明的字段类型把 CSV 单元格还原为 JSON 类型。
 *
 * 只有 `spinbox` / `double_spin`（数字类）需要转换——与 `itemFormUtils` 的表单归一同一口径。
 * 空串与非有限数**保持原字符串**：不产 `NaN`、不丢数据（宁可留下可见的脏值，也不静默改坏）。
 * 未提供 schema 字段（未知类型文件）时不转换。
 */
function coerceCellValue(value: unknown, fieldType: FieldType | undefined): unknown {
  if (typeof value !== 'string') {
    return value
  }
  if (fieldType !== 'spinbox' && fieldType !== 'double_spin') {
    return value
  }
  if (value.trim() === '') {
    return value
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

/**
 * 解析后的行 → 导入记录：`rows[0]` 为表头；整行全空跳过（skipped++）；
 * 跳过空表头与越界列；id 为非空字符串则保留，否则生成 UUID 并写回 `item.id`。
 *
 * `fields` 为已解析类型的 schema 字段（`DataTypeDef.formFields`），用于把数字类字段还原为
 * `number`（见 `coerceCellValue`）；未知类型文件传 `undefined`，此时一律保持字符串。
 */
export function rowsToImportRecords(
  rows: string[][],
  type: string,
  fields?: readonly TypeFieldDef[]
): { records: ImportRecord[]; skipped: number; hasIdColumn: boolean } {
  const records: ImportRecord[] = []
  let skipped = 0
  if (rows.length === 0) {
    return { records, skipped, hasIdColumn: false }
  }

  const headers = rows[0] ?? []
  const hasIdColumn = headers.includes(RECORD_ID_KEY)
  const fieldTypes = new Map((fields ?? []).map((field) => [field.name, field.type]))
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]
    if (row.every((cell) => cell === '')) {
      skipped++
      continue
    }

    const item: Record<string, unknown> = {}
    for (let col = 0; col < headers.length; col++) {
      const header = headers[col]
      if (!header || col >= row.length) {
        continue
      }
      item[header] = coerceCellValue(decodeCsvCell(row[col]), fieldTypes.get(header))
    }

    const rawId = item['id']
    const id = typeof rawId === 'string' && rawId !== '' ? rawId : randomUUID()
    item['id'] = id

    records.push({ type, id, data: item })
  }

  return { records, skipped, hasIdColumn }
}

/** 按 schema 顺序聚合：得到「键（复数键或原键名）→ 条目」的分桶。 */
function groupByFileKey(records: ItemRecord[], types: DataTypeDef[]): Map<string, ItemRecord[]> {
  const buckets = new Map<string, ItemRecord[]>()
  for (const record of records) {
    const def = getTypeByLegacyKey(types, record.type)
    const key = def?.pluralKey ?? record.type
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(record)
    } else {
      buckets.set(key, [record])
    }
  }
  return buckets
}

/**
 * 将每种数据类型导出为独立 CSV 文件。
 * 仅导出有 ≥1 条数据的类型；内容带 UTF-8 BOM；原子写（tmp + rename）。
 */
export async function exportCsvFiles(dir: string, service: DataService, types: DataTypeDef[]): Promise<CsvExportSummary> {
  const records = service.listAllItems()
  const buckets = groupByFileKey(records, types)

  const orderedKeys: string[] = []
  for (const def of types) {
    if (buckets.has(def.pluralKey)) {
      orderedKeys.push(def.pluralKey)
    }
  }
  const knownKeys = new Set(types.map((def) => def.pluralKey))
  const extraKeys = [...buckets.keys()].filter((key) => !knownKeys.has(key)).sort()
  for (const key of extraKeys) {
    orderedKeys.push(key)
  }

  const files: string[] = []
  const byType: Record<string, number> = {}
  let totalItems = 0

  for (const key of orderedKeys) {
    const items = buckets.get(key) ?? []
    if (items.length === 0) {
      continue
    }

    const filePath = join(dir, `${key}.csv`)
    const tempPath = `${filePath}.tmp`
    const content = `\uFEFF${buildCsvText(items)}`
    try {
      await writeFile(tempPath, content, 'utf-8')
      await rename(tempPath, filePath)
    } catch (error) {
      throw new Error(`写入导出文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }

    files.push(filePath)
    const def = getTypeByLegacyKey(types, key)
    byType[def?.id ?? key] = items.length
    totalItems += items.length
  }

  return { dir, files, totalItems, byType }
}

/**
 * 从单个 CSV 文件导入（文件名 stem 为数据类型键）。
 * BOM 被剥离；复数键 stem 解析为单数类型 id；未命中 schema 时数据仍入库并记入 unknownTypes。
 */
/** 只解析、不落库（导入预览用）。`importCsvFile` 也走它，保证预览与写入是同一份。 */
export async function parseCsvImport(filePath: string, types: DataTypeDef[]): Promise<ParsedImport> {
  const stem = basename(filePath, '.csv')
  const def = getTypeByLegacyKey(types, stem)
  const resolvedType = def?.id ?? stem

  let text: string
  try {
    text = await readFile(filePath, 'utf-8')
  } catch (error) {
    throw new Error(`读取 CSV 文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1)
  }

  // 传 schema 字段：数字类字段（spinbox/double_spin）按声明还原为 number
  const parsed = rowsToImportRecords(parseCsvText(text), resolvedType, def?.formFields)

  const unknownTypes: Record<string, number> = {}
  if (!def) {
    unknownTypes[stem] = parsed.records.length
  }

  // CSV 没有 id 列时每行都会被当新条目（可能整表翻倍），要报出来
  const missingIdSources: string[] = []
  if (!parsed.hasIdColumn && parsed.records.length > 0) missingIdSources.push(`CSV「${stem}」`)

  return { records: parsed.records, skipped: parsed.skipped, unknownTypes, missingIdSources }
}

/** 解析 + 立即落库（不预览的快捷路径；菜单走的是 preview → apply） */
export async function importCsvFile(
  filePath: string,
  service: DataService,
  types: DataTypeDef[]
): Promise<ImportSummary> {
  const parsed = await parseCsvImport(filePath, types)
  return applyParsedImport(filePath, parsed, service)
}

/** 把解析结果落库并汇总（与 Excel 共用同一套计数，避免两条路径数字不一致） */
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
