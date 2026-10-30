// 属性求值引擎（attr 域域逻辑，自 shared/ceshu/attrSystem.ts 拆出）：
// - evaluateFormula / calculateAttributes 是 attr 域的域逻辑（含 min/max 截断、环依赖语义）；
// - 模型与拓扑排序留在 contract 根 attrSystem.ts——main 进程的 validateAttrSystem /
//   buildAttrGameConfig / AttrSystemStore 需要它们（README rule 4：main 不碰 domain/**）；
// - 本文件 import contract 根（domain → contract，README §1.1 允许方向）。
import { topoSortAttributes, type AttrFormula, type AttrSystem } from '../../ceshu/attrSystem'

/** 系数求值 */
export function evaluateFormula(formula: AttrFormula, context: Record<string, number>): number {
  let value = formula.baseValue
  for (const [name, coeff] of Object.entries(formula.coefficients)) {
    if (coeff === 0) continue
    value += coeff * (context[name] ?? 0)
  }
  return value
}

export interface AttrCalculation {
  /** 基础属性输入 + 逐条计算的派生/战斗属性 */
  values: Record<string, number>
  /** 环依赖成员（非 null 时计算不完整） */
  cycle: string[] | null
}

/**
 * 计算全部属性：
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
