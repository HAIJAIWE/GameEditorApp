import type { ItemRecord } from './types'

/**
 * 数据表操作纯逻辑（匹平 Python ui/components/virtual_list.py 的 ListModel.set_filter
 * 与 ui/dialogs/batch_edit.py 的批量操作）：列表搜索过滤 + 批量字段操作。
 * 渲染层用于即时过滤/预览，主进程用于批量写入前的逐条计算（同一份语义）。
 */

/* ---- 列表搜索过滤 ---- */

/** 搜索字段：与 Python ListModel 一致（仅取字符串值参与匹配） */
export const ITEM_SEARCH_FIELDS = ['name', 'desc', 'id'] as const

/**
 * 搜索过滤（对应 Python ListModel.set_filter）：
 * 小写、空格拆分为多个关键词、全部命中（AND）即保留；仅 name/desc/id 的字符串值参与匹配。
 */
export function filterItemRecords(items: ItemRecord[], query: string): ItemRecord[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return items
  const terms = normalized.split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    const text = ITEM_SEARCH_FIELDS.map((field) => {
      const value = item.data[field]
      return typeof value === 'string' ? value : ''
    })
      .join(' ')
      .toLowerCase()
    return terms.every((term) => text.includes(term))
  })
}

/* ---- 批量操作 ---- */

export const BATCH_OP_KINDS = ['set_value', 'append_value', 'adjust_number', 'add_tag'] as const
export type BatchOpKind = (typeof BATCH_OP_KINDS)[number]

export const ADJUST_MODES = ['add', 'multiply', 'set'] as const
export type AdjustMode = (typeof ADJUST_MODES)[number]

export const BATCH_OP_LABELS: Record<BatchOpKind, string> = {
  set_value: '设置字段值',
  append_value: '追加字段值（文本）',
  adjust_number: '数值增减',
  add_tag: '添加标签'
}

export const ADJUST_MODE_LABELS: Record<AdjustMode, string> = {
  add: '加/减',
  multiply: '乘以',
  set: '设为'
}

export interface BatchOp {
  kind: BatchOpKind
  /** 目标字段名 */
  field: string
  /** 新值 / 追加内容 / 标签 */
  value?: string
  /** 追加分隔符（默认 ","） */
  separator?: string
  /** 数值模式（默认 add） */
  mode?: AdjustMode
  /** 增减量/乘数/目标值（默认 0） */
  adjust?: number
}

/**
 * 对单条数据应用批量操作（对应 Python _on_apply 各分支；不修改入参）。
 * 返回新的 data 对象；adjust_number 遇到非数值时返回 null（该条跳过，与 Python continue 一致）。
 * 说明：对象/数组值的文本化用 JSON.stringify（Python 为 str() 输出），仅影响对结构字段做文本追加的极端用法。
 */
export function applyBatchOp(data: Record<string, unknown>, op: BatchOp): Record<string, unknown> | null {
  switch (op.kind) {
    case 'set_value':
      return { ...data, [op.field]: op.value ?? '' }
    case 'append_value': {
      const old = valueToText(data[op.field])
      const appended = op.value ?? ''
      const separator = op.separator ?? ','
      return { ...data, [op.field]: old ? `${old}${separator}${appended}` : appended }
    }
    case 'add_tag': {
      const old = valueToText(data[op.field])
      const tag = op.value ?? ''
      return { ...data, [op.field]: old ? `${old},${tag}` : tag }
    }
    case 'adjust_number': {
      const raw = valueToText(data[op.field] ?? '0').replaceAll('%', '').trim()
      if (raw === '') return null
      const old = Number(raw)
      if (!Number.isFinite(old)) return null
      const adjust = op.adjust ?? 0
      let next: number
      if (op.mode === 'multiply') {
        // 乘 0 视为无效，保留原值（与 Python `old * adj if adj != 0 else old` 一致）
        next = adjust !== 0 ? old * adjust : old
      } else if (op.mode === 'set') {
        next = adjust
      } else {
        next = old + adjust
      }
      // 与 Python str(int(v)) if v == int(v) else str(v) 等效：JS 数字无 4.0 与 4 之分
      return { ...data, [op.field]: String(next) }
    }
  }
}

/** 值的文本化（对应 Python str()；缺失视为空串） */
function valueToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}