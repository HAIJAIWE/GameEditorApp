import type { DataTypeDef } from '../../../shared/types'

/** 引用类型下拉：列出现有类型（值为复数键，与内置 schema refType 语义一致），并保留当前未知值 */
export function refOptions(types: DataTypeDef[], currentRef: string | undefined): DataTypeDef[] {
  if (!currentRef) return types
  if (types.some((def) => def.pluralKey === currentRef || def.id === currentRef)) return types
  return [...types, { id: currentRef, name: currentRef, pluralKey: currentRef, color: '#607D8B', formFields: [] }]
}

export function parseOptionalNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}
