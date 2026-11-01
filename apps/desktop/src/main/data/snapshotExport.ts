import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'
import { serializeCsvCell } from './csvIO'

export type DataSnapshotFormat = 'json' | 'csv'

export interface DataSnapshotOptions {
  format: DataSnapshotFormat
  /** 目标路径（缺扩展名时按 format 兜底补 .json/.csv） */
  targetPath: string
}

export interface DataSnapshotResult {
  filePath: string
  format: DataSnapshotFormat
  bytes: number
  itemCount: number
  typeCount: number
}

const SNAPSHOT_SCHEMA = 'mb-data-snapshot/v1'

/**
 * 为什么做这个而不是导一份 SQLite 的 dump：
 * SQLite 是真相源，但仓库里它是二进制 blob，git/PR diff 全是噪声，人根本审不了。
 * 这里把全量数据渲染成**确定性**的 JSON/CSV——同样的库，两次导出字节级一致，
 * 只有真实数据变化才会体现在 diff 里。策划就能在 PR 里逐行 review 每次改了哪些属性/掉落。
 *
 * 关键约定（务必保持，否则 diff 失效）：
 * - 不含任何时间戳 / 绝对路径 / 机器相关信息（那些会让每次导出都不同）；
 * - 对象键递归排序、items/types 按 id 排序 ⇒ 与存入顺序无关；
 * - 原子写（tmp + rename），崩溃不残留半截文件。
 */

/** 递归排序对象键，使 JSON 输出与键顺序无关（git diff 只反映真实数据变化） */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) sorted[key] = sortValue(obj[key])
    return sorted
  }
  return value
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2)
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** CSV 字段转义（RFC4180）：含 , " \r \n 之一则整体引号包裹并双写内部引号 */
function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\r') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

/**
 * 确定性 JSON 快照（types + items + counts）。
 *
 * 导出为公共函数的原因：开发交接包（`ceshu/export/handoff.ts`）要把它内嵌进包里，
 * 而「快照长什么样」只该有一个定义 —— 复制一份到交接包，两边迟早不一致。
 */
export function buildJsonSnapshot(records: ItemRecord[], types: DataTypeDef[]): string {
  const items = records.slice().sort(byId)
  const sortedTypes = types.slice().sort(byId)
  const byType: Record<string, number> = {}
  for (const item of items) byType[item.type] = (byType[item.type] ?? 0) + 1
  const payload = {
    $schema: SNAPSHOT_SCHEMA,
    counts: { total: items.length, byType },
    types: sortedTypes,
    items
  }
  return stableStringify(payload)
}

/** 数据列统一前缀（与元数据列 type/id/时间戳区分，避免重名） */
const DATA_COLUMN_PREFIX = 'data.'

/**
 * 单表宽表：每行一条 item，列 = type/id/时间戳 + 全部 data 键的并集（排序、加 `data.` 前缀）。
 * 复杂值（数组/对象）走 `serializeCsvCell` 序列化成 JSON 字符串（与 csvIO 一致，可往返）。
 * 首行 BOM + CRLF 行分隔（Excel 友好，与 csvIO 同）。
 */
function buildCsvSnapshot(records: ItemRecord[]): string {
  const items = records.slice().sort(byId)
  const dataKeys = new Set<string>()
  for (const item of items) for (const key of Object.keys(item.data)) dataKeys.add(key)
  /*
   * data 列统一加 `data.` 前缀：数据里可能有与元数据同名的字段（尤其 `type`——
   * 「通用数据」模板就带一个 type=分类字段）。不加前缀会与元数据列重名，
   * 行映射被 `col === 'type'` 分支抢走 ⇒ 用户的分类值在 CSV 里**直接丢失**。
   */
  const columns = [
    'type',
    'id',
    'createdAt',
    'updatedAt',
    'aiGeneratedAt',
    ...[...dataKeys].sort().map((key) => `${DATA_COLUMN_PREFIX}${key}`)
  ]
  const rows = items.map((item) =>
    columns.map((col) => {
      if (col === 'type') return item.type
      if (col === 'id') return item.id
      if (col === 'createdAt') return item.createdAt
      if (col === 'updatedAt') return item.updatedAt
      if (col === 'aiGeneratedAt') return item.aiGeneratedAt ?? ''
      return serializeCsvCell(item.data[col.slice(DATA_COLUMN_PREFIX.length)])
    })
  )
  const lines = [columns.join(','), ...rows.map((row) => row.map((cell) => escapeCsvField(String(cell))).join(','))]
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

function ensureExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`
}

/** 原子写：先写 `<file>.tmp` 再 rename，崩溃不残留临时文件 */
function atomicWrite(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  try {
    writeFileSync(tmp, content, 'utf-8')
    renameSync(tmp, filePath)
  } catch (error) {
    throw new Error(`写入数据快照失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

export function exportDataSnapshot(
  records: ItemRecord[],
  types: DataTypeDef[],
  options: DataSnapshotOptions
): DataSnapshotResult {
  const extension = options.format === 'csv' ? '.csv' : '.json'
  const filePath = ensureExtension(options.targetPath, extension)
  const content = options.format === 'csv' ? buildCsvSnapshot(records) : buildJsonSnapshot(records, types)
  atomicWrite(filePath, content)
  return {
    filePath,
    format: options.format,
    bytes: Buffer.byteLength(content, 'utf-8'),
    itemCount: records.length,
    typeCount: types.length
  }
}
