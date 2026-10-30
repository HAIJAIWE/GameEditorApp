import { calculateAttributes } from './attrEngine'
import type { AttrFormula, AttrSystem } from '../../ceshu/attrSystem'

/**
 * 实时属性预览：
 * - 基础属性当前值 → 装备固定加成（+X）→ Buff 百分比加成（×(1 + p/100)，作用于「基础 + 装备」之后）→ 拓扑计算全部属性
 * - 计算过程文本（基础属性 / 装备加成 / Buff加成 / 派生属性 + 公式与结果）与 旧版 展示同构
 * 有意不迁移：旧版 的「等级」控件无任何实际计算（仅打印标题占位、不改变数值），待真实等级机制设计后再实现；
 * 旧版 过程文本对基础值做 int() 截断（12.5 → 12），TS 改为精确展示（整数省略小数、否则 1 位）。
 */

export interface LivePreviewInput {
  /** 基础属性当前值（缺省使用属性默认值） */
  baseValues: Record<string, number>
  /** 装备固定加成（按属性名；>0 生效） */
  equipBonuses: Record<string, number>
  /** Buff 百分比加成（按属性名；>0 生效） */
  buffBonuses: Record<string, number>
}

export interface LivePreviewResult {
  /** 应用加成后的基础属性值 */
  baseValues: Record<string, number>
  /** 全部属性计算值（含基础属性） */
  values: Record<string, number>
  /** 环依赖成员（非 null 时计算不完整） */
  cycle: string[] | null
  /** 计算过程文本行 */
  processLines: string[]
}

/** 基础属性名（定义顺序） */
export function baseAttrNames(system: AttrSystem): string[] {
  return Object.entries(system.attributes)
    .filter(([, attr]) => attr.type === 'base')
    .map(([name]) => name)
}

/** 派生 + 战斗属性名 */
export function derivedAndCombatNames(system: AttrSystem): string[] {
  return Object.entries(system.attributes)
    .filter(([, attr]) => attr.type === 'derived' || attr.type === 'combat')
    .map(([name]) => name)
}

export function computeLivePreview(system: AttrSystem, input: LivePreviewInput): LivePreviewResult {
  const baseNames = baseAttrNames(system)
  const effective: Record<string, number> = {}
  for (const name of baseNames) {
    let value = input.baseValues[name] ?? system.attributes[name].defaultValue
    const equip = input.equipBonuses[name] ?? 0
    if (equip > 0) value += equip
    const percent = input.buffBonuses[name] ?? 0
    if (percent > 0) value *= 1 + percent / 100
    effective[name] = value
  }

  const calculation = calculateAttributes(system, effective)

  const processLines: string[] = ['─── 基础属性 ───']
  for (const name of baseNames) {
    processLines.push(`  ${system.attributes[name].displayName} = ${formatNumber(effective[name])}`)
  }
  const equipEntries = baseNames.filter((name) => (input.equipBonuses[name] ?? 0) > 0)
  if (equipEntries.length > 0) {
    processLines.push('', '─── 装备加成 ───')
    for (const name of equipEntries) {
      processLines.push(`  ${system.attributes[name].displayName} +${formatNumber(input.equipBonuses[name])}`)
    }
  }
  const buffEntries = baseNames.filter((name) => (input.buffBonuses[name] ?? 0) > 0)
  if (buffEntries.length > 0) {
    processLines.push('', '─── Buff加成 ───')
    for (const name of buffEntries) {
      processLines.push(`  ${system.attributes[name].displayName} +${formatNumber(input.buffBonuses[name])}%`)
    }
  }
  processLines.push('', '─── 派生属性 ───')
  for (const name of derivedAndCombatNames(system)) {
    const attr = system.attributes[name]
    processLines.push(`  ${formulaLine(attr.displayName, attr.formula)}`)
    processLines.push(`    → ${(calculation.values[name] ?? 0).toFixed(1)}`)
  }

  return { baseValues: effective, values: calculation.values, cycle: calculation.cycle, processLines }
}

/** 数值展示：整数省略小数，否则保留 1 位 */
function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

/** 公式文本：'HP = 力量*10 + 体质*20' */
function formulaLine(displayName: string, formula: AttrFormula): string {
  const parts: string[] = []
  if (formula.baseValue !== 0) parts.push(String(formula.baseValue))
  for (const [name, coeff] of Object.entries(formula.coefficients)) {
    if (coeff === 0) continue
    parts.push(`${name}*${String(coeff)}`)
  }
  return `${displayName} = ${parts.length > 0 ? parts.join(' + ') : '0'}`
}