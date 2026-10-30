import { rename, writeFile } from 'node:fs/promises'

import { getTypeById } from '../../shared/schema/core/typeSchema'
import type { DataTypeDef, ExportSummary, ItemRecord } from '../../shared/types'
import type { DataService } from './service'

/**
 * 数据导出（Phase 1 数据核心 W2）：把入库数据导回旧版 JSON 交换格式 { 复数键: [条目] }。
 * - 全部类型按当前 schema 顺序输出
 * - 未收录类型键保持原键名，排序后追加（数据无损）
 * - 条目按 record.data 原样写出（导入前形状）
 * - 原子写：临时文件 + rename
 */

export function buildLegacyPayload(records: ItemRecord[], types: DataTypeDef[]): Record<string, unknown[]> {
  const knownPluralKeys = new Set(types.map((def) => def.pluralKey))
  const buckets = new Map<string, unknown[]>()

  for (const record of records) {
    const key = getTypeById(types, record.type)?.pluralKey ?? record.type
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(record.data)
    } else {
      buckets.set(key, [record.data])
    }
  }

  const payload: Record<string, unknown[]> = {}
  for (const def of types) {
    payload[def.pluralKey] = buckets.get(def.pluralKey) ?? []
  }
  const extraKeys = [...buckets.keys()].filter((key) => !knownPluralKeys.has(key)).sort()
  for (const key of extraKeys) {
    payload[key] = buckets.get(key) ?? []
  }
  return payload
}

export async function exportLegacyDataFile(
  filePath: string,
  service: DataService,
  types: DataTypeDef[]
): Promise<ExportSummary> {
  const records = service.listAllItems()
  const payload = buildLegacyPayload(records, types)
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