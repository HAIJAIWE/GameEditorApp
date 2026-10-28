import type { CeshuFieldDef } from './ceshuConstants'

/**
 * 字段值的**只读展示**格式化（一页总览视图 + 一页导出共用，避免两套实现漂移）。
 *
 * 与编辑器的 `pipeList` 双形态保持一致：
 * - 有列定义：对象按列顺序拼 `a | b`；
 * - 无列定义：字符串行原样、对象按自身值拼。
 * 空值一律返回 `''`（是否显示「（待填）」由调用方决定）。
 */
export function optionLabel(field: CeshuFieldDef, item: unknown): string {
  const key = String(item)
  return field.optionLabels?.[key] ?? key
}

export function displayFieldValue(field: CeshuFieldDef, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  switch (field.kind) {
    case 'stringList':
    case 'multiCombo': {
      if (!Array.isArray(value)) return String(value)
      return value.map((item) => optionLabel(field, item)).join('、')
    }
    case 'pipeList': {
      if (!Array.isArray(value)) return ''
      const columns = field.columns ?? []
      return value
        .map((item) => {
          if (typeof item === 'string') return item
          if (item !== null && typeof item === 'object') {
            const obj = item as Record<string, unknown>
            const values = columns.length > 0 ? columns.map((column) => obj[column.key]) : Object.values(obj)
            return values.map((cell) => (cell === null || cell === undefined ? '' : String(cell))).join(' | ')
          }
          return String(item)
        })
        .filter((row) => row.trim() !== '')
        .join('；')
    }
    case 'checkbox':
      return value ? '是' : '否'
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value)
    default:
      if (typeof value === 'boolean') return value ? '是' : '否'
      if (typeof value === 'number') return String(value)
      return ''
  }
}
