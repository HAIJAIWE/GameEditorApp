import type { ImportFieldChange, ImportPreview, ImportRecordPreview, ItemRecord } from '@mobai/shared/types'
import type { ImportRecord } from './service'

/**
 * 导入会话：**解析一次、预览、确认后落库**。
 *
 * 为什么不复用 `importExcelFile` 的「解析 + 立即落库」：
 * 导入是不可撤销的批量写（撤销栈只记单条），先给用户看清楚「改了什么」再落，
 * 是这类操作唯一负责任的做法。解析结果暂存在这里，apply 时直接用，
 * 避免「预览读一遍、导入再读一遍」出现两次读取不一致（TOCTOU）。
 */

/** 一次解析的结果（还没落库） */
export interface ParsedImport {
  records: ImportRecord[]
  skipped: number
  unknownTypes: Record<string, number>
  missingIdSources: string[]
}

interface PendingImport extends ParsedImport {
  kind: 'excel' | 'csv'
  filePath: string
  createdAt: number
}

/** 会话有效期：10 分钟。过期作废，避免长期驻留一份可能已过时的解析结果 */
const SESSION_TTL_MS = 10 * 60 * 1000

/** 最多同时保留的会话数（正常只会有一个；防连续点菜单把内存堆起来） */
const MAX_SESSIONS = 4

export class ImportSessionStore {
  private readonly pending = new Map<string, PendingImport>()

  /** 暂存解析结果，返回会话 id（交给渲染层，确认导入时带回） */
  put(kind: 'excel' | 'csv', filePath: string, parsed: ParsedImport): string {
    this.sweep()
    const id = `imp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    this.pending.set(id, { ...parsed, kind, filePath, createdAt: Date.now() })
    while (this.pending.size > MAX_SESSIONS) {
      const oldest = [...this.pending.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0]
      if (oldest === undefined) break
      this.pending.delete(oldest[0])
    }
    return id
  }

  /** 取出并**消费**会话（确认导入只能生效一次，避免重复点击写两遍） */
  take(id: string): PendingImport | undefined {
    this.sweep()
    const session = this.pending.get(id)
    if (session === undefined) return undefined
    this.pending.delete(id)
    return session
  }

  /** 丢弃会话（用户点「取消」时调用） */
  drop(id: string): void {
    this.pending.delete(id)
  }

  private sweep(): void {
    const now = Date.now()
    for (const [id, session] of this.pending) {
      if (now - session.createdAt > SESSION_TTL_MS) this.pending.delete(id)
    }
  }
}

/** 预览里最多列出多少条记录（UI 不会把上万条变更渲染出来） */
export const IMPORT_PREVIEW_LIMIT = 300

function asString(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

/** 比较用的稳定序列化：对象/数组按 JSON 比，其余按原始值比 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || a === undefined || b === undefined) return a === b
  if (typeof a === 'object' || typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch {
      return false
    }
  }
  return false
}

/** 与库内条目比对，算出这次导入会「新增多少、改哪些字段」 */
export function buildImportPreview(
  incoming: readonly ImportRecord[],
  existing: readonly ItemRecord[],
  meta: { kind: 'excel' | 'csv'; filePath: string; skipped: number; unknownTypes: Record<string, number>; missingIdSources: string[] },
  limit: number = IMPORT_PREVIEW_LIMIT
): ImportPreview {
  // 已有条目按「类型 + 业务短 id」索引：这正是 importRecords 的 upsert 键
  const index = new Map<string, ItemRecord>()
  for (const record of existing) {
    const businessId = asString(record.data['id'])
    if (businessId === '') continue
    index.set(`${record.type}\u0000${businessId}`, record)
  }

  const preview: ImportPreview = {
    kind: meta.kind,
    filePath: meta.filePath,
    totalRows: incoming.length + meta.skipped,
    createCount: 0,
    updateCount: 0,
    unchangedCount: 0,
    skipped: meta.skipped,
    byType: {},
    records: [],
    truncated: false,
    unknownTypes: meta.unknownTypes,
    missingIdSources: meta.missingIdSources
  }

  for (const record of incoming) {
    const businessId = asString(record.data['id'])
    const before = businessId === '' ? undefined : index.get(`${record.type}\u0000${businessId}`)
    const bucket = (preview.byType[record.type] ??= { create: 0, update: 0, unchanged: 0 })
    const name = asString(record.data['name']) || businessId || '(无名称)'

    if (before === undefined) {
      preview.createCount += 1
      bucket.create += 1
      pushPreview(preview, { type: record.type, businessId, name, kind: 'create', changes: [] }, limit)
      continue
    }

    const changes: ImportFieldChange[] = []
    const keys = new Set([...Object.keys(before.data), ...Object.keys(record.data)])
    for (const key of keys) {
      // id 相同是命中条件本身，不算变更
      if (key === 'id') continue
      const oldValue = before.data[key]
      const newValue = record.data[key]
      if (!sameValue(oldValue, newValue)) changes.push({ key, before: oldValue, after: newValue })
    }

    if (changes.length === 0) {
      preview.unchangedCount += 1
      bucket.unchanged += 1
      continue
    }
    preview.updateCount += 1
    bucket.update += 1
    pushPreview(preview, { type: record.type, businessId, name, kind: 'update', changes }, limit)
  }

  return preview
}

function pushPreview(preview: ImportPreview, item: ImportRecordPreview, limit: number): void {
  if (preview.records.length >= limit) {
    preview.truncated = true
    return
  }
  preview.records.push(item)
}
