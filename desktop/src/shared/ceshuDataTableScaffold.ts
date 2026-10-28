import type { DataTypeDef, FieldType, TypeFieldDef } from './types'
import { resolveDataTable, type DataTableActual, type DataTableCheckResult, type DataTableRequirement } from './ceshuDataTableCheck'

/**
 * 按「所需数据表」的声明**补齐结构**：建类型、加字段。
 *
 * ## 边界（很重要）
 * 只补**结构**，绝不造数据行。声明里写「期望 200 条」不等于让系统凭空生成 200 条空记录——
 * 那是往库里灌垃圾，而且真正的数值还得人来定。条数缺口仍然靠人/AI 填，核对面板会继续报。
 *
 * ## 为什么不直接新建同名类型
 * 声明写「武器表」、库里已有「装备」时，新建一个「武器」类型等于制造重复表——
 * 正是这个功能想避免的问题。所以先做名称归一（去「表」后缀 / 包含关系），
 * 能对上就补字段，对不上才新建，并在计划里说明理由。
 *
 * 纯逻辑：`types` 进、`types` 出，落盘由调用方负责（`TypeSchemaStore.saveTypes`）。
 */

export interface ScaffoldFieldPlan {
  /** 带冒号的中文标签（与既有字段风格一致，如「攻击力:」） */
  label: string
  /** 字段键（英文，须符合 `^[A-Za-z_]\w*$`） */
  name: string
  type: FieldType
  /** 为什么推成这个类型——给用户看，别让人猜 */
  reason: string
}

export type ScaffoldAction = 'create_type' | 'add_fields' | 'skip'

export interface ScaffoldTablePlan {
  declaredName: string
  action: ScaffoldAction
  /** 目标类型 id（`create_type` 时为新分配的 id） */
  targetTypeId: string
  /** 新建类型时的复数键（非新建为空串）；落盘与展示用同一份，避免两处各算一次 */
  pluralKey: string
  targetTypeName: string
  /** 要新增的字段（`skip` 时为空） */
  fields: ScaffoldFieldPlan[]
  /** 声明了但已存在、无需新增的字段标签 */
  skippedFields: string[]
  /** 一句话说明这次动作的理由 */
  note: string
}

export interface ScaffoldPlan {
  tables: ScaffoldTablePlan[]
  createTypeCount: number
  addFieldCount: number
  skippedTableCount: number
}

/** 执行结果：计划 + 实际改动数 + 重新核对（让用户立刻看到「还差什么」） */
export interface ScaffoldApplyResult {
  plan: ScaffoldPlan
  createTypeCount: number
  addFieldCount: number
  check: DataTableCheckResult
}

/** 数值类关键词：命中即按数字字段建（策划最常写的就是这些） */
const NUMERIC_HINTS = [
  '血量', '生命', '攻击', '防御', '伤害', '价格', '售价', '数量', '等级', '概率', '几率',
  '冷却', '时长', '持续', '速度', '暴击', '命中', '闪避', '抗性', '上限', '下限', '加成',
  '倍率', '系数', '权重', '半径', '范围', '消耗', '耐久', '重量', '回复', '收益', '成本',
  '次数', '层数', '间隔', '经验', '金币', '帧', '秒'
] as const

/** 英文数值提示（设计里常用 attack / hp / cooldown 这类英文键，判类型别一律落到 entry） */
const NUMERIC_HINTS_EN = [
  'attack', 'atk', 'defense', 'def', 'hp', 'health', 'damage', 'dmg', 'cooldown',
  'duration', 'speed', 'crit', 'rate', 'level', 'price', 'count', 'weight',
  'range', 'cost', 'durability', 'difficulty', 'ratio', 'multiplier', 'amount'
] as const

/** 常见字段 → 键名（英文键是硬要求：`FIELD_NAME_PATTERN` 只认 ASCII） */
const KEY_DICTIONARY: Record<string, string> = {
  攻击力: 'atk',
  攻击: 'atk',
  防御力: 'def',
  防御: 'def',
  血量: 'hp',
  生命: 'hp',
  生命值: 'hp',
  魔法: 'mp',
  法力: 'mp',
  速度: 'speed',
  暴击率: 'crit_rate',
  暴击伤害: 'crit_dmg',
  命中: 'hit',
  闪避: 'dodge',
  等级: 'level',
  价格: 'price',
  售价: 'price',
  数量: 'count',
  品质: 'quality',
  稀有度: 'rare',
  冷却: 'cooldown',
  时长: 'duration',
  持续时间: 'duration',
  效果: 'effect',
  类型: 'type',
  分类: 'category',
  描述: 'desc',
  说明: 'desc',
  名称: 'name',
  名字: 'name',
  图片: 'image',
  标签: 'tags',
  用途: 'usage',
  概率: 'chance',
  重量: 'weight',
  权重: 'weight',
  耐久: 'durability',
  消耗: 'cost',
  范围: 'range',
  半径: 'radius',
  倍率: 'multiplier'
}

/** 新建类型的配色（按顺序取，循环使用） */
const TYPE_COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#795548', '#607D8B', '#E91E63']

/** 去掉「表 / 数据表 / 配置表」这类后缀再比名字，避免「装备表」和「装备」被当成两张表 */
function stripTableSuffix(text: string): string {
  return text.replace(/(配置表|数据表|表)$/, '').trim()
}

function normalize(text: string): string {
  return text.replace(/[:：]\s*$/, '').trim().toLowerCase()
}

/** 推定字段类型 + 给出理由 */
export function guessFieldType(label: string): { type: FieldType; reason: string } {
  const text = normalize(label)
  if (/图片/.test(text)) return { type: 'image', reason: '名字含「图片」' }
  if (/描述|说明|备注/.test(text)) return { type: 'desc', reason: '名字像长文本' }
  if (/标签/.test(text)) return { type: 'tags', reason: '名字含「标签」' }
  if (/列表|清单|集合/.test(text)) return { type: 'desc', reason: '多值内容，先按多行文本建，可在字段结构编辑器里改' }
  if (NUMERIC_HINTS.some((hint) => text.includes(hint)) || NUMERIC_HINTS_EN.some((hint) => text.includes(hint))) {
    return { type: 'spinbox', reason: '名字是数值指标' }
  }
  return { type: 'entry', reason: '未识别出更具体的类型，先按单行文本建' }
}

/** 生成合法且不冲突的字段键 */
export function guessFieldKey(label: string, taken: ReadonlySet<string>): string {
  const text = normalize(label)
  const known = KEY_DICTIONARY[text]
  if (known !== undefined && !taken.has(known)) return known

  // 英文 / ASCII 标签直接用作键（设计里常写 attack / defense / damage_rate 这类），
  // 否则会一律退化成 f1/f2，丢掉字段名。中文标签走下面的字典/后缀匹配。
  const ascii = text.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  if (/^[a-z_][a-z0-9_]*$/.test(ascii) && !taken.has(ascii)) return ascii

  // 精确没中，再试「后缀命中」：「图标图片」→ image、「攻击力加成」不会误中（不以后缀收尾）
  // 只做后缀不做包含：包含会把「攻击力上限」也映射成 atk，那是错的。
  const suffixKeys = Object.keys(KEY_DICTIONARY)
    .filter((key) => key.length >= 2 && text.length > key.length && text.endsWith(key))
    .sort((a, b) => b.length - a.length)
  for (const key of suffixKeys) {
    const candidate = KEY_DICTIONARY[key]
    if (candidate !== undefined && !taken.has(candidate)) return candidate
  }

  // 未收录：`f1`、`f2`…（不猜拼音——猜错比占位名更难排查）
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `f${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `f${Date.now()}`
}

/** 新建类型时分配 id（ASCII 硬要求；中文名只能用 custom_N） */
function allocateTypeId(name: string, taken: ReadonlySet<string>): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (/^[a-z_]\w*$/.test(ascii) && !taken.has(ascii)) return ascii

  for (let index = 1; index < 1000; index += 1) {
    const candidate = `custom_${index}`
    if (!taken.has(candidate)) return candidate
  }
  return `custom_${Date.now()}`
}

function allocatePluralKey(typeId: string, taken: ReadonlySet<string>): string {
  const candidates = [`${typeId}s`, `${typeId}_list`, `${typeId}_items`]
  for (const candidate of candidates) {
    if (!taken.has(candidate)) return candidate
  }
  return `${typeId}_${Date.now()}`
}

/** 逐条声明算出「要建什么」，不修改任何入参 */
export function planDataTableScaffold(
  requirements: readonly DataTableRequirement[],
  actual: readonly DataTableActual[],
  existingTypes: readonly DataTypeDef[]
): ScaffoldPlan {
  const plan: ScaffoldPlan = { tables: [], createTypeCount: 0, addFieldCount: 0, skippedTableCount: 0 }
  const takenTypeIds = new Set(existingTypes.map((def) => def.id))
  const takenPluralKeys = new Set(existingTypes.map((def) => def.pluralKey))

  for (const requirement of requirements) {
    // 与核对共用同一份表名归一：两边口径一旦分叉，就会出现「补完还报没建表」
    const resolved = resolveDataTable(requirement.tableName, actual)
    if (resolved !== undefined) {
      const { table } = resolved
      const existingDef = existingTypes.find((def) => def.id === table.typeId)
      const takenFieldNames = new Set(existingDef?.formFields.map((field) => field.name) ?? [])
      const knownLabels = [...table.fieldLabels, ...table.fieldNames].map(normalize)

      const fields: ScaffoldFieldPlan[] = []
      const skippedFields: string[] = []
      for (const declaredField of requirement.keyFields) {
        // `id` 是系统/通用字段（apply 时统一补 editable:false），声明里写了也跳过，避免生成 id_2
        if (normalize(declaredField) === 'id') {
          skippedFields.push(declaredField)
          continue
        }
        const text = normalize(declaredField)
        const exists = knownLabels.some(
          (known) => known === text || (text.length >= 2 && (known.includes(text) || text.includes(known)))
        )
        if (exists) {
          skippedFields.push(declaredField)
          continue
        }
        const { type, reason } = guessFieldType(declaredField)
        const name = guessFieldKey(declaredField, takenFieldNames)
        takenFieldNames.add(name)
        fields.push({ label: `${declaredField.replace(/[:：]\s*$/, '')}:`, name, type, reason })
      }

      if (fields.length === 0) {
        plan.skippedTableCount += 1
        plan.tables.push({
          declaredName: requirement.tableName,
          action: 'skip',
          targetTypeId: table.typeId,
          pluralKey: '',
          targetTypeName: table.typeName,
          fields: [],
          skippedFields,
          note: resolved.reason === '' ? '表与字段都已存在，无需改动' : `${resolved.reason}，字段也已齐全`
        })
        continue
      }

      plan.addFieldCount += fields.length
      plan.tables.push({
        declaredName: requirement.tableName,
        action: 'add_fields',
        targetTypeId: table.typeId,
        pluralKey: '',
        targetTypeName: table.typeName,
        fields,
        skippedFields,
        note: resolved.reason === '' ? '表已存在，补齐缺的字段' : `${resolved.reason}，补齐缺的字段`
      })
      continue
    }

    // 没有可复用的类型 → 新建
    const typeId = allocateTypeId(requirement.tableName, takenTypeIds)
    takenTypeIds.add(typeId)
    const pluralKey = allocatePluralKey(typeId, takenPluralKeys)
    takenPluralKeys.add(pluralKey)

    const takenFieldNames = new Set<string>(['id'])
    const fields: ScaffoldFieldPlan[] = []
    for (const declaredField of requirement.keyFields) {
      // 同上：id 由 apply 统一补系统字段，这里跳过
      if (normalize(declaredField) === 'id') continue
      const { type, reason } = guessFieldType(declaredField)
      const name = guessFieldKey(declaredField, takenFieldNames)
      takenFieldNames.add(name)
      fields.push({ label: `${declaredField.replace(/[:：]\s*$/, '')}:`, name, type, reason })
    }
    // 新建类型至少要有 id + 一个 name 字段（与内置类型一致，否则列表里没法显示）
    if (!takenFieldNames.has('name')) {
      fields.unshift({ label: '名称:', name: 'name', type: 'entry', reason: '列表展示需要名称字段' })
      takenFieldNames.add('name')
    }

    plan.createTypeCount += 1
    plan.addFieldCount += fields.length
    plan.tables.push({
      declaredName: requirement.tableName,
      action: 'create_type',
      targetTypeId: typeId,
      pluralKey,
      targetTypeName: stripTableSuffix(requirement.tableName) || requirement.tableName,
      fields,
      skippedFields: [],
      note: `没有可复用的类型，新建「${stripTableSuffix(requirement.tableName) || requirement.tableName}」表（不生成数据行）`
    })
  }

  return plan
}

function toFieldDef(field: ScaffoldFieldPlan): TypeFieldDef {
  return { name: field.name, label: field.label, type: field.type, editable: true }
}

/**
 * 执行计划：返回**新的**类型数组（不修改入参），交给 `TypeSchemaStore.saveTypes` 落盘。
 *
 * 新建类型的首个字段必须是不可编辑的 `id`（`validateTypeSchema` 会卡这条）。
 */
export function applyDataTableScaffold(types: readonly DataTypeDef[], plan: ScaffoldPlan): DataTypeDef[] {
  const next = types.map((def) => ({ ...def, formFields: [...def.formFields] }))
  const byId = new Map(next.map((def) => [def.id, def]))
  let colorCursor = next.length

  for (const table of plan.tables) {
    if (table.action === 'skip') continue

    if (table.action === 'add_fields') {
      const target = byId.get(table.targetTypeId)
      if (target === undefined) continue
      const taken = new Set(target.formFields.map((field) => field.name))
      for (const field of table.fields) {
        if (taken.has(field.name)) continue
        taken.add(field.name)
        target.formFields.push(toFieldDef(field))
      }
      continue
    }

    const color = TYPE_COLORS[colorCursor % TYPE_COLORS.length] ?? '#2196F3'
    colorCursor += 1
    const def: DataTypeDef = {
      id: table.targetTypeId,
      name: table.targetTypeName,
      pluralKey: table.pluralKey,
      color,
      formFields: [
        { name: 'id', label: 'ID:', type: 'entry', editable: false },
        ...table.fields.map(toFieldDef)
      ]
    }
    next.push(def)
    byId.set(def.id, def)
  }

  return next
}
