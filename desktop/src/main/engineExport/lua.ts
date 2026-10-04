import { getTypeById } from '../../shared/typeSchema'
import { DEFAULT_TYPE_SCHEMA_VERSION } from '../../shared/typeSchemaFile'
import type { DataTypeDef, ItemRecord } from '../../shared/types'

import { toLuaKey, toLuaLiteral } from './luaLiteral'

/**
 * 全量数据 → 单个 Lua 数据模块（纯函数，便于在无 Electron 环境下用 vitest 断言）。
 * - 外层键：`DataTypeDef.pluralKey`（按 schema 顺序）；未收录类型用 `record.type` 原文排序追加（数据无损）
 * - 内层键：`["<id>"]`
 * - 字段名 / 字段值原样输出，**不做类型换算**（schema 中以字符串存的数字仍输出字符串，避免语义丢失）
 * - 键序稳定：记录字段先 schema 字段序、再额外键（排序追加），保证同输入两次渲染字符串完全相等
 * - 有意不含生成时间戳：以满足「同输入两次渲染结果相等」的幂等要求（时间戳会破坏稳定性）
 */
export function renderLuaGameData(records: ItemRecord[], types: DataTypeDef[]): string {
  if (types.length === 0) {
    throw new Error('数据类型定义为空，无法导出引擎数据')
  }

  const knownKeys = new Set(types.map((def) => def.pluralKey))
  const buckets = new Map<string, ItemRecord[]>()
  for (const record of records) {
    const key = getTypeById(types, record.type)?.pluralKey ?? record.type
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(record)
    } else {
      buckets.set(key, [record])
    }
  }

  const schemaKeys = types.map((def) => def.pluralKey)
  const extraKeys = [...buckets.keys()].filter((key) => !knownKeys.has(key)).sort()
  const orderedKeys = [...schemaKeys, ...extraKeys]

  const header = [
    '-- 墨白可视化编辑 · 引擎数据导出',
    `-- engine: lua  schema: ${DEFAULT_TYPE_SCHEMA_VERSION}`,
    `-- count: ${orderedKeys.map((key) => `${key} ${buckets.get(key)?.length ?? 0}`).join(' / ')}`
  ].join('\n')

  const lines: string[] = ['local GameData = {}']
  for (const key of orderedKeys) {
    const items = [...(buckets.get(key) ?? [])].sort(compareById)
    lines.push('')
    lines.push(`${renderGroupAccess(key)} = {`)
    for (const record of items) {
      lines.push(...renderRecord(record, types))
    }
    lines.push('}')
  }
  lines.push('')
  lines.push('return GameData')

  return `${header}\n\n${lines.join('\n')}\n`
}

/** `GameData.roles`（合法键）或 `GameData["weird key"]`（非法键） */
function renderGroupAccess(key: string): string {
  const rendered = toLuaKey(key)
  return rendered.startsWith('[') ? `GameData${rendered}` : `GameData.${rendered}`
}

/** 单条记录：`["<id>"] = { 字段 = 值, ... }`（字段按 schema 字段序 + 额外键排序） */
function renderRecord(record: ItemRecord, types: DataTypeDef[]): string[] {
  const def = getTypeById(types, record.type)
  const schemaFieldNames = def ? def.formFields.map((field) => field.name) : []
  const fieldKeys = orderFieldKeys(record.data, schemaFieldNames)

  const lines = [`  [${toLuaLiteral(record.id)}] = {`]
  fieldKeys.forEach((field, index) => {
    const comma = index < fieldKeys.length - 1 ? ',' : ''
    lines.push(`    ${toLuaKey(field)} = ${toLuaLiteral(record.data[field])}${comma}`)
  })
  lines.push('  },')
  return lines
}

/** 字段键排序：先出现的 schema 字段序，再未收录键（按字典序），保证键序稳定 */
function orderFieldKeys(data: Record<string, unknown>, schemaFieldNames: string[]): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const name of schemaFieldNames) {
    if (Object.prototype.hasOwnProperty.call(data, name)) {
      ordered.push(name)
      seen.add(name)
    }
  }
  const extras = Object.keys(data)
    .filter((key) => !seen.has(key))
    .sort()
  return [...ordered, ...extras]
}

/** 记录按 id 升序输出：与输入顺序无关的稳定序，便于 git diff 比对 */
function compareById(a: ItemRecord, b: ItemRecord): number {
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}
