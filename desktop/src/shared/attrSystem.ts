import { isPlainObject } from './ceshuModel'

/**
 * RPG 属性系统核心（自 Python core/attr_system.py + common/graph.py 匹平迁移）：
 * - 模型：属性 = { 类型(base/derived/combat)、分类、显示名、最小/上限、默认值、系数公式 }
 * - 公式：与 Python Formula 一致采用「系数 + 常数项」结构；JSON 以旧版文本形式互转（= 力量*10 + 体质*20）
 * - 计算：拓扑排序（Kahn）逐条求值、未定义依赖按 0、系数 0 跳过、min/max 截断；环依赖返回成员而非抛裸异常
 * - 文件：<userData>/attr_system.json，与 Python 同构（顶层为「属性名 → 定义」的平铺对象、snake_case 键）
 * 有意改进（相对 Python 的缺陷）：公式解析失败返回 null（Python 静默当 0/崩溃）；环依赖返回成员供 UI 提示；
 * 上限 max_value 序列化保留（Python 的 Formula.max_value 不落盘，往返后丢失战斗属性上限）。
 */

export const ATTR_TYPES = ['base', 'derived', 'combat'] as const
export type AttrType = (typeof ATTR_TYPES)[number]

export const ATTR_TYPE_LABELS: Record<AttrType, string> = {
  base: '基础属性',
  derived: '派生属性',
  combat: '战斗属性'
}

/** 系数公式（对应 Python Formula：coefficients + base_value + max_value） */
export interface AttrFormula {
  /** 依赖属性名 → 系数 */
  coefficients: Record<string, number>
  /** 常数项 */
  baseValue: number
}

export interface AttrDefinition {
  name: string
  type: AttrType
  category: string
  displayName: string
  minValue: number
  /** 上限（null = 无上限） */
  maxValue: number | null
  defaultValue: number
  formula: AttrFormula
}

export interface AttrSystem {
  attributes: Record<string, AttrDefinition>
}

/* ---- 默认属性系统（照抄 Python AttributeSystem._build_default_system） ---- */

function createAttr(
  name: string,
  type: AttrType,
  category: string,
  options: { displayName?: string; minValue?: number; maxValue?: number | null; defaultValue?: number; formula?: AttrFormula } = {}
): AttrDefinition {
  return {
    name,
    type,
    category,
    displayName: options.displayName ?? name,
    minValue: options.minValue ?? 0,
    maxValue: options.maxValue ?? null,
    defaultValue: options.defaultValue ?? 0,
    formula: options.formula ?? { coefficients: {}, baseValue: 0 }
  }
}

/** 内置默认属性系统（基础 4 + 派生 7 + 战斗 6） */
export function createDefaultAttrSystem(): AttrSystem {
  const attributes: Record<string, AttrDefinition> = {}
  const add = (attr: AttrDefinition): void => {
    attributes[attr.name] = attr
  }

  for (const name of ['力量', '智力', '敏捷', '体质']) {
    add(createAttr(name, 'base', '基础属性', { defaultValue: 10 }))
  }

  add(createAttr('HP', 'derived', '派生属性', { formula: { coefficients: { 力量: 10, 体质: 20, 敏捷: 5 }, baseValue: 0 } }))
  add(createAttr('MP', 'derived', '派生属性', { formula: { coefficients: { 智力: 15, 体质: 5 }, baseValue: 0 } }))
  add(createAttr('物攻', 'derived', '派生属性', { formula: { coefficients: { 力量: 2, 敏捷: 1 }, baseValue: 0 } }))
  add(
    createAttr('物防', 'derived', '派生属性', {
      formula: { coefficients: { 力量: 0.5, 敏捷: 0.5, 体质: 2 }, baseValue: 0 }
    })
  )
  add(createAttr('魔攻', 'derived', '派生属性', { formula: { coefficients: { 智力: 3 }, baseValue: 0 } }))
  add(createAttr('魔防', 'derived', '派生属性', { formula: { coefficients: { 智力: 1, 体质: 1 }, baseValue: 0 } }))
  add(createAttr('速度', 'derived', '派生属性', { formula: { coefficients: { 敏捷: 2 }, baseValue: 0 } }))

  add(
    createAttr('暴击率', 'combat', '战斗属性', {
      maxValue: 100,
      formula: { coefficients: { 敏捷: 0.4 }, baseValue: 5 }
    })
  )
  add(
    createAttr('暴击伤害', 'combat', '战斗属性', {
      maxValue: 999,
      formula: { coefficients: { 敏捷: 0.5 }, baseValue: 150 }
    })
  )
  add(
    createAttr('命中率', 'combat', '战斗属性', {
      maxValue: 100,
      formula: { coefficients: { 敏捷: 0.3 }, baseValue: 85 }
    })
  )
  add(
    createAttr('闪避率', 'combat', '战斗属性', {
      maxValue: 100,
      formula: { coefficients: { 敏捷: 0.4 }, baseValue: 5 }
    })
  )
  add(createAttr('回血/回合', 'combat', '战斗属性', { formula: { coefficients: { 体质: 1 }, baseValue: 0 } }))
  add(createAttr('回蓝/回合', 'combat', '战斗属性', { formula: { coefficients: { 智力: 0.5 }, baseValue: 0 } }))

  return { attributes }
}

/** 基础属性默认值构成的输入（示例值预览 / 无参数计算用） */
export function defaultBaseValues(system: AttrSystem): Record<string, number> {
  const values: Record<string, number> = {}
  for (const [name, attr] of Object.entries(system.attributes)) {
    if (attr.type === 'base') values[name] = attr.defaultValue
  }
  return values
}

/* ---- 公式文本互转（匹平 Formula.to_legacy_string / from_legacy_string） ---- */

/** 系数公式 → 旧版文本（如 "= 力量*10 + 体质*20"；空公式为 "=0"） */
export function formulaToText(formula: AttrFormula): string {
  const parts: string[] = []
  if (formula.baseValue !== 0) parts.push(formatNumber(formula.baseValue))
  for (const [name, coeff] of Object.entries(formula.coefficients)) {
    if (coeff === 0) continue
    parts.push(`${name}*${formatNumber(coeff)}`)
  }
  return parts.length === 0 ? '=0' : `= ${parts.join(' + ')}`
}

/** 旧版文本 → 系数公式；无法解析返回 null（对应 Python from_legacy_string，但失败不静默） */
export function parseFormulaText(text: string): AttrFormula | null {
  const trimmed = (text ?? '').trim()
  if (trimmed === '') return { coefficients: {}, baseValue: 0 }
  if (!trimmed.startsWith('=')) {
    const value = Number(trimmed)
    return Number.isFinite(value) ? { coefficients: {}, baseValue: value } : null
  }

  const coefficients: Record<string, number> = {}
  let baseValue = 0
  for (const part of trimmed.slice(1).split('+')) {
    const term = part.trim()
    if (term === '') continue
    if (term.includes('*')) {
      const index = term.indexOf('*')
      const name = term.slice(0, index).trim()
      const coeffText = term.slice(index + 1).trim()
      if (name === '' || coeffText === '') return null
      const coeff = Number(coeffText)
      if (!Number.isFinite(coeff)) return null
      coefficients[name] = coeff
    } else {
      const value = Number(term)
      if (!Number.isFinite(value)) return null
      baseValue = value
    }
  }
  return { coefficients, baseValue }
}

/** 公式的可读展示（如 "力量×10 + 体质×20 + 5"；全空为 "0"） */
export function formulaToDisplay(formula: AttrFormula): string {
  const parts: string[] = []
  for (const [name, coeff] of Object.entries(formula.coefficients)) {
    if (coeff === 0) continue
    parts.push(`${name}×${formatNumber(coeff)}`)
  }
  if (formula.baseValue !== 0) parts.push(formatNumber(formula.baseValue))
  return parts.length === 0 ? '0' : parts.join(' + ')
}

/* ---- 求值与拓扑计算 ---- */

/** 系数求值（对应 Python Formula.evaluate：未定义依赖按 0、系数 0 跳过） */
export function evaluateFormula(formula: AttrFormula, context: Record<string, number>): number {
  let value = formula.baseValue
  for (const [name, coeff] of Object.entries(formula.coefficients)) {
    if (coeff === 0) continue
    value += coeff * (context[name] ?? 0)
  }
  return value
}

export interface TopoResult {
  order: string[]
  /** 环依赖成员（非 null 时 order 不完整） */
  cycle: string[] | null
}

/** 拓扑排序（Kahn，对应 Python common/graph.py；未定义的依赖忽略） */
export function topoSortAttributes(system: AttrSystem): TopoResult {
  const names = Object.keys(system.attributes)
  const inDegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const name of names) {
    inDegree.set(name, 0)
    dependents.set(name, [])
  }
  for (const name of names) {
    const deps = Object.keys(system.attributes[name]?.formula.coefficients ?? {})
    for (const dep of deps) {
      if (!inDegree.has(dep)) continue
      inDegree.set(name, (inDegree.get(name) ?? 0) + 1)
      dependents.get(dep)?.push(name)
    }
  }

  const queue = names.filter((name) => inDegree.get(name) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const node = queue.shift() as string
    order.push(node)
    for (const dependent of dependents.get(node) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, remaining)
      if (remaining === 0) queue.push(dependent)
    }
  }

  if (order.length !== names.length) {
    const sorted = new Set(order)
    return { order, cycle: names.filter((name) => !sorted.has(name)) }
  }
  return { order, cycle: null }
}

export interface AttrCalculation {
  /** 基础属性输入 + 逐条计算的派生/战斗属性 */
  values: Record<string, number>
  /** 环依赖成员（非 null 时计算不完整） */
  cycle: string[] | null
}

/**
 * 计算全部属性（对应 Python AttributeSystem.calculate_all）：
 * 入参 base_values 中的属性直接采用；其余按拓扑序计算并做 min/max 截断。
 */
export function calculateAttributes(system: AttrSystem, baseValues: Record<string, number>): AttrCalculation {
  const topo = topoSortAttributes(system)
  if (topo.cycle) {
    return { values: { ...baseValues }, cycle: topo.cycle }
  }
  const values: Record<string, number> = { ...baseValues }
  for (const name of topo.order) {
    if (name in baseValues) continue
    const attr = system.attributes[name]
    if (!attr) continue
    let value = evaluateFormula(attr.formula, values)
    if (Number.isFinite(attr.minValue)) value = Math.max(value, attr.minValue)
    if (attr.maxValue !== null && Number.isFinite(attr.maxValue)) value = Math.min(value, attr.maxValue)
    values[name] = value
  }
  return { values, cycle: null }
}

/* ---- 领域校验（保存前共用） ---- */

/** 返回中文错误列表；空数组表示通过 */
export function validateAttrSystem(system: AttrSystem): string[] {
  const errors: string[] = []
  const entries = Object.entries(system.attributes)
  if (entries.length === 0) {
    errors.push('属性系统至少需要一个属性')
    return errors
  }
  for (const [key, attr] of entries) {
    const label = attr.displayName || key || '(未命名属性)'
    if (!key.trim()) errors.push('存在属性名为空的条目')
    if (attr.name !== key) errors.push(`属性「${label}」的名称与键名不一致（${attr.name} ≠ ${key}）`)
    if (!ATTR_TYPES.includes(attr.type)) errors.push(`属性「${label}」的类型不合法：${attr.type}`)
    if (!Number.isFinite(attr.minValue)) errors.push(`属性「${label}」的最小值不是数字`)
    if (attr.maxValue !== null && !Number.isFinite(attr.maxValue)) errors.push(`属性「${label}」的上限不是数字`)
    if (attr.maxValue !== null && Number.isFinite(attr.minValue) && attr.minValue > attr.maxValue) {
      errors.push(`属性「${label}」的最小值大于上限`)
    }
    if (!Number.isFinite(attr.defaultValue)) errors.push(`属性「${label}」的默认值不是数字`)
    if (!Number.isFinite(attr.formula.baseValue)) errors.push(`属性「${label}」的公式常数项不是数字`)
    for (const [dep, coeff] of Object.entries(attr.formula.coefficients)) {
      if (!Number.isFinite(coeff)) errors.push(`属性「${label}」的公式系数不合法：${dep}=${String(coeff)}`)
      if (!(dep in system.attributes)) errors.push(`属性「${label}」的公式依赖了不存在的属性「${dep}」`)
    }
  }
  const topo = topoSortAttributes(system)
  if (topo.cycle) errors.push(`检测到循环依赖：${topo.cycle.join(' → ')}`)
  return errors
}

/* ---- 文件序列化 / 解析（与 Python attr_system.json 同构） ---- */

export interface AttrSystemFileEntry {
  name: string
  type: string
  category: string
  display_name: string
  min_value: number
  max_value: number | null
  default_value: number
  formula: string
}

/** Python 同构：顶层为「属性名 → 定义」的平铺对象（无版本号，与 Python 一致） */
export type AttrSystemFile = Record<string, AttrSystemFileEntry>

export function serializeAttrSystem(system: AttrSystem): AttrSystemFile {
  const file: AttrSystemFile = {}
  for (const [key, attr] of Object.entries(system.attributes)) {
    file[key] = {
      name: attr.name,
      type: attr.type,
      category: attr.category,
      display_name: attr.displayName,
      min_value: attr.minValue,
      max_value: attr.maxValue,
      default_value: attr.defaultValue,
      formula: formulaToText(attr.formula)
    }
  }
  return file
}

/** 解析属性系统文件；结构/公式异常以 warnings 上报并尽力保留数据（不静默丢弃） */
export function parseAttrSystemFile(raw: unknown): { system: AttrSystem; warnings: string[] } {
  if (!isPlainObject(raw)) {
    throw new Error('属性系统文件格式不正确：顶层应为 JSON 对象')
  }
  const warnings: string[] = []
  const attributes: Record<string, AttrDefinition> = {}

  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) {
      warnings.push(`属性「${key}」的定义不是对象，已跳过`)
      continue
    }
    const rawType = value['type']
    const type: AttrType = ATTR_TYPES.includes(rawType as AttrType) ? (rawType as AttrType) : 'base'
    if (rawType !== undefined && rawType !== type) {
      warnings.push(`属性「${key}」的类型「${String(rawType)}」未知，已按基础属性处理`)
    }
    const formulaText = typeof value['formula'] === 'string' ? value['formula'] : ''
    let formula = parseFormulaText(formulaText)
    if (!formula) {
      warnings.push(`属性「${key}」的公式无法解析（${formulaText}），已按空公式处理`)
      formula = { coefficients: {}, baseValue: 0 }
    }
    const maxRaw = value['max_value']
    const name = typeof value['name'] === 'string' && value['name'] !== '' ? value['name'] : key
    attributes[key] = {
      name,
      type,
      category: readText(value['category']) || ATTR_TYPE_LABELS[type],
      displayName: readText(value['display_name']) || name,
      minValue: readNumber(value['min_value'], 0, `属性「${key}」的最小值`, warnings),
      maxValue: maxRaw === null || maxRaw === undefined ? null : readNumber(maxRaw, 0, `属性「${key}」的上限`, warnings),
      defaultValue: readNumber(value['default_value'], 0, `属性「${key}」的默认值`, warnings),
      formula
    }
  }

  if (Object.keys(attributes).length === 0) {
    throw new Error('属性系统文件为空：未解析出任何属性')
  }
  return { system: { attributes }, warnings }
}

function formatNumber(value: number): string {
  return String(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number, label: string, warnings: string[]): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value !== undefined && value !== null) {
    warnings.push(`${label}不是数字（${String(value)}），已按 ${fallback} 处理`)
  }
  return fallback
}