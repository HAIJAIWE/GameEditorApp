import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { getTypeByLegacyKey } from '../../shared/schema/core'
import type { DataTypeDef, ImportSummary } from '../../shared/types'
import type { DataService, ImportRecord } from './service'

/**
 * 旧版数据导入（Phase 1 数据核心）：
 * 兼容 早期版本数据文件格式 —— 顶层为 { 复数键: [条目, ...] }（如 { "roles": [...], "skills": [...] }）。
 * - 复数键映射为单数类型 id（roles → role）
 * - 未收录的键：数据保留入库（type 用原键名），并在汇总中报告
 * - 条目缺 id 时生成 UUID 并回写进条目；数值型 id转字符串保留
 * - 剥离内部元数据字段 _base_type（镜像 早期版本 _clean_metadata_fields）
 */

export interface ParsedLegacyData {
  records: ImportRecord[]
  skipped: number
  unknownTypes: Record<string, number>
}

export function parseLegacyData(raw: unknown, types: DataTypeDef[]): ParsedLegacyData {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('旧数据文件格式不正确：顶层应为「数据类型 → 条目数组」的对象')
  }

  const records: ImportRecord[] = []
  const unknownTypes: Record<string, number> = {}
  let skipped = 0

  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) {
      continue
    }
    const typeDef = getTypeByLegacyKey(types, key)
    const resolvedType = typeDef?.id ?? key

    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        skipped++
        continue
      }
      const item: Record<string, unknown> = { ...entry }
      delete item['_base_type']

      const rawId = item['id']
      // 旧版 数据文件里 id 常为数值（`"id": 0`）——数值同属有效 id，统一转字符串存储；
      // 仅缺失/空串才生成 UUID 回写
      const id: string =
        (typeof rawId === 'string' && rawId !== '') || typeof rawId === 'number'
          ? String(rawId)
          : randomUUID()
      if (id !== rawId) {
        item['id'] = id
      }

      records.push({ type: resolvedType, id, data: item })
      if (!typeDef) {
        unknownTypes[key] = (unknownTypes[key] ?? 0) + 1
      }
    }
  }

  return { records, skipped, unknownTypes }
}

export async function importLegacyDataFile(
  filePath: string,
  service: DataService,
  types: DataTypeDef[]
): Promise<ImportSummary> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(`读取旧数据文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }

  const parsed = parseLegacyData(raw, types)
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
    // 旧版 JSON 交换格式：每条都带业务 id（`data.id` 由 parseLegacyData 补齐），不存在「没主键」的情况
    missingIdSources: []
  }
}