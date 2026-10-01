import { rename, writeFile } from 'node:fs/promises'

import { DATA_TYPES, getTypeById } from '../../shared/typeSchema'
import type { ExportSummary, ItemRecord } from '../../shared/types'
import type { DataService } from './service'

/**
 * 数据导出（Phase 1 数据核心 W2）：把入库数据导回旧版 JSON 交换格式 { 复数键: [条目] }。
 * - 12 种内置类型按 schema 顺序输出（空类型也保留空数组，与旧版文件同构）
 * - 未收录类型键保持原键名，排序后追加（数据无损）
 * - 条目按 record.data 原样写出（导入前形状）
 * - 原子写：临时文件 + rename
 */

export function buildLegacyPayload(records: ItemRecord[]): Record<string, unknown[]> {
  const knownPluralKeys = new Set(DATA_TYPES.map((def) => def.pluralKey))
  const buckets = new Map<string, unknown[]>()

  for (const record of records) {
    const key = getTypeById(record.type)?.pluralKey ?? record.type
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(record.data)
    } else {
      buckets.set(key, [record.data])
    }
  }

  const payload: Record<string, unknown[]> = {}
  for (const def of DATA_TYPES) {
    payload[def.pluralKey] = buckets.get(def.pluralKey) ?? []
  }
  const extraKeys = [...buckets.keys()].filter((key) => !knownPluralKeys.has(key)).sort()
  for (const key of extraKeys) {
    payload[key] = buckets.get(key) ?? []
  }
  return payload
}

export async function exportLegacyDataFile(filePath: string, service: DataService): Promise<ExportSummary> {
  const records = service.listAllItems()
  const payload = buildLegacyPayload(records)
  const content = JSON.stringify(payload, null, 2)

  const tempPath = `${filePath}.tmp`
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, filePath)
  } catch (error) {
    throw new Error(`写入导出文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  const byType: Record<string, number> = {}
  for (const record of records) {
    byType[record.type] = (byType[record.type] ?? 0) + 1
  }
  return { filePath, totalItems: records.length, byType }
}