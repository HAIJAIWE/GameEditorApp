import { calculateAttributes } from './attrEngine'
import type { AttrSystem } from '../../attrSystem'

/**
 * 装备/Buff 预览（对应 旧版 EquipmentPreviewWidget + InspectorPanel）：
 * - 数据映射与 旧版 同构：装备 bonuses 取 base_attrs + extra_attrs（平铺），slot=part、rarity=rarity||rare；
 *   Buff 按 value + effect_type 映射到单个属性（属性提升/降低→力量、持续伤害→物攻、持续治疗/护盾→体质、加速/减速→敏捷）
 * - TS 扩展（为让 TS 原生装备可用）：无 base_attrs/extra_attrs 时按 (effect, value) 推导单项加成；支持导入扩展 percentage_bonuses
 * - 明确修复 旧版 缺陷：① Buff 卡片此前不参与计算（仅展示）——TS 参与（固定加成 + 百分比）；
 *   ② 未知 effect_type 不再默认加「力量」；③ 槽位与 schema「部位」对齐（旧版 为 7 槽、含无对应部位的「饰品」且缺护腿/项链/披风）
 * - 计算：全部固定加成先加，再乘全部百分比加成 → 拓扑计算；对比「基础 → 最终」与差值
 */

export interface EquipPreviewItem {
  itemId: string
  name: string
  /** 槽位（装备=part，Buff=type） */
  slot: string
  /** 固定加成（属性名 → 数值） */
  bonuses: Record<string, number>
  /** 百分比加成（属性名 → 百分数） */
  percentageBonuses: Record<string, number>
  rarity: string
  desc: string
}

/** 装备槽位（与装备 schema「部位」一致：9 个） */
export const EQUIP_SLOTS = ['武器', '头盔', '胸甲', '护腿', '靴子', '手套', '戒指', '项链', '披风']

/** 装备「效果类型」→ 属性名（TS 扩展：无 base_attrs/extra_attrs 时按效果 + 数值推导） */
const EQUIP_EFFECT_ATTRS: Record<string, string> = {
  攻击加成: '物攻',
  防御加成: '物防',
  生命加成: 'HP',
  法力加成: 'MP',
  暴击率: '暴击率',
  闪避率: '闪避率',
  魔法抗性: '魔防'
}

/** Buff「效果类别」→ 属性名（照抄 旧版 _buff_dict_to_data_item 的 attr_mapping） */
const BUFF_EFFECT_ATTRS: Record<string, string> = {
  属性提升: '力量',
  属性降低: '力量',
  持续伤害: '物攻',
  持续治疗: '体质',
  护盾: '体质',
  加速: '敏捷',
  减速: '敏捷'
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

/** 读取加成字典（非对象返回空；零值剔除） */
function readBonusMap(value: unknown): Record<string, number> {
  const result: Record<string, number> = {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const numeric = readNumber(raw)
    if (numeric !== null && numeric !== 0) result[name] = numeric
  }
  return result
}

/** 数据表装备记录 → 预览项（旧版 同构 + effect/value 推导扩展） */
export function equipRecordToItem(data: Record<string, unknown>): EquipPreviewItem {
  const bonuses = { ...readBonusMap(data['base_attrs']), ...readBonusMap(data['extra_attrs']) }
  if (Object.keys(bonuses).length === 0) {
    const value = readNumber(data['value'])
    const attrName = EQUIP_EFFECT_ATTRS[String(data['effect'] ?? '')]
    if (attrName !== undefined && value !== null && value !== 0) bonuses[attrName] = value
  }
  return {
    itemId: String(data['id'] ?? ''),
    name: String(data['name'] ?? '未命名装备'),
    slot: String(data['part'] ?? ''),
    bonuses,
    percentageBonuses: readBonusMap(data['percentage_bonuses']),
    rarity: String(data['rarity'] ?? data['rare'] ?? '普通'),
    desc: String(data['desc'] ?? '')
  }
}

/** 数据表 Buff 记录 → 预览项（旧版 同构；未知效果类别不加成——旧版 会默认加「力量」，已修正） */
export function buffRecordToItem(data: Record<string, unknown>): EquipPreviewItem {
  const bonuses: Record<string, number> = {}
  const value = readNumber(data['value'])
  const attrName = BUFF_EFFECT_ATTRS[String(data['effect_type'] ?? '')]
  if (attrName !== undefined && value !== null && value !== 0) bonuses[attrName] = value
  return {
    itemId: String(data['id'] ?? ''),
    name: String(data['name'] ?? '未命名Buff'),
    slot: String(data['type'] ?? '增益'),
    bonuses,
    percentageBonuses: readBonusMap(data['percentage_bonuses']),
    rarity: '普通',
    desc: String(data['desc'] ?? '')
  }
}

export interface EquipComparisonRow {
  name: string
  displayName: string
  base: number
  final: number
  diff: number
}

export interface EquipComparison {
  rows: EquipComparisonRow[]
  /** 环依赖成员（非 null 时无法计算，rows 为空） */
  cycle: string[] | null
}

/** 「基础 → 装备 + Buff → 最终」对比（固定加成先加、百分比后乘；旧版 不计算 Buff 卡片） */
export function computeEquipComparison(
  system: AttrSystem,
  baseValues: Record<string, number>,
  equipped: EquipPreviewItem[],
  buffs: EquipPreviewItem[]
): EquipComparison {
  const enhanced: Record<string, number> = { ...baseValues }
  const allItems = [...equipped, ...buffs]
  for (const item of allItems) {
    for (const [name, bonus] of Object.entries(item.bonuses)) {
      enhanced[name] = (enhanced[name] ?? 0) + bonus
    }
  }
  for (const item of allItems) {
    for (const [name, percent] of Object.entries(item.percentageBonuses)) {
      enhanced[name] = (enhanced[name] ?? 0) * (1 + percent / 100)
    }
  }

  const baseCalculation = calculateAttributes(system, baseValues)
  const finalCalculation = calculateAttributes(system, enhanced)
  const cycle = baseCalculation.cycle ?? finalCalculation.cycle
  if (cycle) return { rows: [], cycle }

  const rows = Object.entries(system.attributes).map(([name, attr]) => {
    const base = baseCalculation.values[name] ?? 0
    const final = finalCalculation.values[name] ?? 0
    return { name, displayName: attr.displayName || name, base, final, diff: final - base }
  })
  return { rows, cycle: null }
}

/** 数值展示：整数省略小数，否则 1 位（对应 旧版 的 int 判断显示） */
export function formatPreviewNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}