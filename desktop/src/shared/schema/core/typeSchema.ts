/**
 * 内置数据类型 schema 的查询纯函数层。
 * 数据表（12 种内置类型 `BUILTIN_DATA_TYPES`）已拆分至 `typeSchemaData.ts`；本文件只放
 * 按传入 `types` 列表工作的两个纯查询函数，`BUILTIN_DATA_TYPES` 经 `export *` 再导出，
 * 外部 `import { BUILTIN_DATA_TYPES, getTypeById, getTypeByLegacyKey } from './typeSchema'` 不变。
 */

import type { DataTypeDef } from '../../types'
export * from '../adapters/typeSchemaData'

/** 按类型 id 查找（types 为运行期 schema 列表） */
export function getTypeById(types: DataTypeDef[], id: string): DataTypeDef | undefined {
  return types.find((t) => t.id === id)
}

/** 按旧版数据文件的键（复数键或单数键）查找类型 */
export function getTypeByLegacyKey(types: DataTypeDef[], key: string): DataTypeDef | undefined {
  return types.find((t) => t.pluralKey === key || t.id === key)
}