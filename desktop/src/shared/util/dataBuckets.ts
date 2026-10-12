import { getTypeById } from '../typeSchema'
import type { DataTypeDef, ItemRecord } from '../types'

/**
 * 数据按 schema 的 `pluralKey` 归桶。
 *
 * 与 Python 的 `data_manager.data`（`dict[str, list[dict]]`，键是复数类型名）语义对齐 ——
 * 两处消费者共用本函数，避免各写一份口径不同的：
 * - `main/engineExport/engines.ts`：四个引擎导出的输入分桶
 * - 策划书「游戏数据预览」面板：把全库数据摊成 JSON 树
 *
 * `pluralKey` 缺失时回退 `record.type` 原文，**保证数据不丢**。
 * 桶内保持记录原有顺序（不排序），键序由调用方决定 —— 引擎导出要的是 schema 序，
 * 预览面板要的是「有数据的类型在前 + 字典序」，两者诉求不同。
 */
export function bucketize(
  records: ItemRecord[],
  types: DataTypeDef[]
): Map<string, Record<string, unknown>[]> {
  const buckets = new Map<string, Record<string, unknown>[]>()
  for (const record of records) {
    const key = getTypeById(types, record.type)?.pluralKey ?? record.type
    const bucket = buckets.get(key)
    const row = record.data as Record<string, unknown>
    if (bucket) {
      bucket.push(row)
    } else {
      buckets.set(key, [row])
    }
  }
  return buckets
}
