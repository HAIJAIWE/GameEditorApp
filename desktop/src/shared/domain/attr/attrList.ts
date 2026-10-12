import { calculateAttributes } from './attrEngine'
import type { AttrSystem, AttrType } from '../../attrSystem'

/**
 * 条目级属性列表（job.attr_list 等 attrtable 字段）的编辑 / 保存 / 预览逻辑：
 * - 存储形态与 Python 一致：[{ name, value }]（value 为数值）；行内未知键原样保留
 * - 编辑形态：数值以字符串保存（表单输入），名称可自由输入；空名称行不落盘、空数值按 0
 * - 计算预览：以列表行作为输入按属性系统拓扑计算（替代 Python 角色/怪物的行序自算缺陷），
 *   未在列表中的属性按 0 参与计算；列表中未被属性系统收录的名称不计入并单独提示
 */

/** 编辑态行：value 为字符串以便输入，其余键（导入数据可能携带）原样保留 */
export interface AttrRow {
  name: string
  value: string
  [key: string]: unknown
}

/** 存储值 → 编辑行（宽松兼容：非数组返回空、数组元素非对象时按名称处理） */
export function attrListToRows(value: unknown): AttrRow[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => {
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>
      const rawValue = record['value']
      return {
        ...record,
        name: typeof record['name'] === 'string' ? record['name'] : String(record['name'] ?? ''),
        value: rawValue === undefined || rawValue === null || rawValue === '' ? '' : String(rawValue)
      }
    }
    return { name: entry === undefined || entry === null ? '' : String(entry), value: '' }
  })
}

/**
 * 编辑行 → 存储数组：空名称行忽略、空数值按 0、非数字抛错（错误含字段名与行号）；
 * 行内未知键原样带回。
 */
export function rowsToAttrList(rows: AttrRow[], fieldLabel: string): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  rows.forEach((row, index) => {
    const name = String(row.name ?? '').trim()
    if (name === '') return
    const numeric = numericValueOf(row)
    if (numeric === null) {
      throw new Error(`字段「${fieldLabel}」第 ${index + 1} 行的数值不是数字：${String(row.value)}`)
    }
    result.push({ ...row, name, value: numeric })
  })
  return result
}

/** 编辑行数值：空文本按 0，非法文本返回 null */
function numericValueOf(row: AttrRow): number | null {
  const text = String(row.value ?? '').trim()
  if (text === '') return 0
  const numeric = Number(text)
  return Number.isFinite(numeric) ? numeric : null
}

export type AttrValueSource = 'input' | 'computed'

export interface AttrPreviewEntry {
  name: string
  displayName: string
  type: AttrType
  value: number
  /** input：来自属性列表行；computed：由属性系统公式算出（含未提供输入而缺省为 0 的属性） */
  source: AttrValueSource
}

export interface AttrPreview {
  /** 按属性系统定义顺序列出全部属性及其取值 */
  entries: AttrPreviewEntry[]
  /** 环依赖成员（非 null 时无法计算，entries 为空） */
  cycle: string[] | null
  /** 属性列表中未被属性系统收录的名称（不参与计算） */
  unknownNames: string[]
}

/** 以属性列表行作为输入计算全部属性（预览用，容错：非法数值行不参与） */
export function buildAttrPreview(system: AttrSystem, rows: AttrRow[]): AttrPreview {
  const baseValues: Record<string, number> = {}
  const unknownNames: string[] = []
  for (const row of rows) {
    const name = String(row.name ?? '').trim()
    if (name === '') continue
    if (!(name in system.attributes)) {
      if (!unknownNames.includes(name)) unknownNames.push(name)
      continue
    }
    const numeric = numericValueOf(row)
    if (numeric === null) continue
    baseValues[name] = numeric
  }

  const calculation = calculateAttributes(system, baseValues)
  if (calculation.cycle) {
    return { entries: [], cycle: calculation.cycle, unknownNames }
  }
  const entries = Object.entries(system.attributes).map(([name, attr]) => ({
    name,
    displayName: attr.displayName || name,
    type: attr.type,
    value: calculation.values[name] ?? 0,
    source: (name in baseValues ? 'input' : 'computed') as AttrValueSource
  }))
  return { entries, cycle: null, unknownNames }
}