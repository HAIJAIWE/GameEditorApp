import type { DataTypeDef, FieldType, TypeFieldDef } from '../../types'

/**
 * 字段结构编辑器内置模板。
 * 模板粒度 = 单个类型的字段列表（含 id 字段），应用时整体替换当前类型字段。
 */

function field(name: string, label: string, type: FieldType, editable: boolean, extra: Partial<TypeFieldDef> = {}): TypeFieldDef {
  return { name, label, type, editable, ...extra }
}

const idField = (): TypeFieldDef => field('id', 'ID:', 'entry', false)
const nameField = (): TypeFieldDef => field('name', '名称:', 'entry', true)

export const TYPE_TEMPLATES: Record<string, TypeFieldDef[]> = {
  '通用数据（默认）': [
    idField(),
    nameField(),
    field('type', '分类:', 'combobox', true, { values: ['请修改为你的分类选项'] }),
    field('rarity', '稀有度:', 'combobox', true, { values: ['普通', '稀有', '史诗', '传说'] }),
    field('tags', '标签:', 'tags', true),
    field('value', '数值:', 'spinbox', true, { from: 0, to: 9999 }),
    field('desc', '描述:', 'desc', true),
    field('image', '图片:', 'image', true)
  ],
  RPG角色: [
    idField(),
    nameField(),
    field('job', '职业:', 'combobox', true, { values: ['战士', '法师', '牧师', '刺客'] }),
    field('race', '种族:', 'combobox', true, { values: ['人类', '精灵', '兽人', '亡灵'] }),
    field('hp', '生命:', 'spinbox', true, { from: 50, to: 20000 }),
    field('mp', '法力:', 'spinbox', true, { from: 0, to: 5000 }),
    field('atk', '攻击:', 'spinbox', true, { from: 5, to: 1000 }),
    field('def_', '防御:', 'spinbox', true, { from: 0, to: 800 }),
    field('category', '定位:', 'combobox', true, { values: ['坦克', '输出', '辅助', '治疗'] }),
    field('tags', '标签:', 'tags', true),
    field('desc', '描述:', 'desc', true)
  ],
  RPG技能: [
    idField(),
    nameField(),
    field('type', '技能类型:', 'combobox', true, { values: ['攻击', '治疗', '防御', '控制', '增益'] }),
    field('value', '数值:', 'spinbox', true, { from: 0, to: 9999 }),
    field('cd', '冷却:', 'spinbox', true, { from: 0, to: 120 }),
    field('target', '目标:', 'combobox', true, { values: ['单体敌人', '群体敌人', '自身', '全体友方'] }),
    field('consume', '消耗:', 'combobox', true, { values: ['无消耗', '法力', '体力', '怒气'] }),
    field('effect', '效果:', 'combobox', true, { values: ['直接伤害', '持续伤害', '护盾', '眩晕', '治疗'] }),
    field('tags', '标签:', 'tags', true),
    field('desc', '描述:', 'desc', true)
  ],
  卡牌TCG: [
    idField(),
    nameField(),
    field('cost', '费用:', 'spinbox', true, { from: 0, to: 10 }),
    field('atk', '攻击:', 'spinbox', true, { from: 0, to: 12 }),
    field('hp', '生命:', 'spinbox', true, { from: 1, to: 12 }),
    field('card_type', '卡牌类型:', 'combobox', true, { values: ['随从', '法术', '武器'] }),
    field('rarity', '稀有度:', 'combobox', true, { values: ['普通', '稀有', '史诗', '传说'] }),
    field('class_', '职业限制:', 'combobox', true, { values: ['中立', '战士', '法师', '盗贼', '德鲁伊'] }),
    field('keywords', '关键词:', 'tags', true),
    field('desc', '描述:', 'desc', true)
  ],
  策略SLG单位: [
    idField(),
    nameField(),
    field('tier', '等级:', 'spinbox', true, { from: 1, to: 3 }),
    field('unit_type', '单位类型:', 'combobox', true, { values: ['步兵', '骑兵', '弓兵', '攻城', '飞行'] }),
    field('hp', '生命:', 'spinbox', true, { from: 10, to: 5000 }),
    field('atk', '攻击:', 'spinbox', true, { from: 1, to: 500 }),
    field('move_speed', '移速:', 'spinbox', true, { from: 1, to: 10 }),
    field('range', '射程:', 'combobox', true, { values: ['近战', '短程', '中程', '远程', '攻城'] }),
    field('cost', '造价:', 'spinbox', true, { from: 20, to: 1000 }),
    field('counters', '克制:', 'tags', true),
    field('desc', '描述:', 'desc', true)
  ],
  FPS武器: [
    idField(),
    nameField(),
    field('weapon_type', '武器类型:', 'combobox', true, {
      values: ['手枪', '步枪', '冲锋枪', '狙击枪', '霰弹枪', '机枪']
    }),
    field('damage', '单发伤害:', 'double_spin', true, { from: 10, to: 150 }),
    field('fire_rate', '射速(RPM):', 'spinbox', true, { from: 100, to: 1200 }),
    field('mag_size', '弹匣容量:', 'spinbox', true, { from: 5, to: 100 }),
    field('reload_time', '换弹时间(s):', 'double_spin', true, { from: 0.5, to: 6.0 }),
    field('accuracy', '精度:', 'double_spin', true, { from: 50, to: 100 }),
    field('range_', '有效距离:', 'combobox', true, { values: ['近距离', '中距离', '远距离', '超远距离'] }),
    field('desc', '描述:', 'desc', true)
  ],
  MOBA英雄: [
    idField(),
    nameField(),
    field('role', '定位:', 'combobox', true, { values: ['坦克', '战士', '刺客', '法师', '射手', '辅助'] }),
    field('base_hp', '基础生命:', 'spinbox', true, { from: 450, to: 700 }),
    field('base_ad', '基础物攻:', 'spinbox', true, { from: 40, to: 80 }),
    field('base_armor', '基础护甲:', 'spinbox', true, { from: 20, to: 45 }),
    field('base_mr', '基础魔抗:', 'spinbox', true, { from: 25, to: 45 }),
    field('move_speed', '移动速度:', 'double_spin', true, { from: 300, to: 350 }),
    field('attack_range', '攻击范围:', 'combobox', true, { values: ['近战', '远程'] }),
    field('difficulty', '难度:', 'combobox', true, { values: ['简单', '中等', '困难'] }),
    field('tags', '标签:', 'tags', true),
    field('desc', '描述:', 'desc', true)
  ],
  '空白（手动创建）': [idField(), nameField()]
}

export const TYPE_TEMPLATE_NAMES = Object.keys(TYPE_TEMPLATES)

/**
 * 模板的「建议分区」——一键套用后给用户的**命名参考**。
 *
 * 定位：套用内置模板时，这些建议分区会**一并写进类型的 `sections`**，保存后条目表单即按它渲染
 * （`shared/schema/formSections.ts::buildFormLayout` 里自定义分区的优先级高于内置 `FORM_GROUPS`）。
 * 本表是「模板 → 建议分组」的唯一数据源，保证一键套用后字段天然分成有名字的几组，
 * 避免 hp/atk/def 这类战斗数值被并进「基础信息」。
 *
 * 约定（由单测锁住）：每个模板的每个字段必须**恰好出现在一个分区**里，不重不漏。
 */
export interface TemplateSectionSuggestion {
  title: string
  icon: string
  /** 归入该分区的字段名（必须存在于对应模板的字段列表） */
  fields: string[]
}

export const TYPE_TEMPLATE_SECTIONS: Readonly<Record<string, readonly TemplateSectionSuggestion[]>> = {
  '通用数据（默认）': [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'rarity', 'tags'] },
    { title: '数值配置', icon: '⚔️', fields: ['value'] },
    { title: '描述 & 图片', icon: '📝', fields: ['desc', 'image'] }
  ],
  RPG角色: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'job', 'race', 'category'] },
    { title: '战斗属性', icon: '⚔️', fields: ['hp', 'mp', 'atk', 'def_'] },
    { title: '描述 & 图片', icon: '📝', fields: ['tags', 'desc'] }
  ],
  RPG技能: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'target'] },
    { title: '数值配置', icon: '⚔️', fields: ['value', 'cd', 'consume', 'effect'] },
    { title: '描述 & 图片', icon: '📝', fields: ['tags', 'desc'] }
  ],
  卡牌TCG: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'card_type', 'rarity', 'class_'] },
    { title: '数值配置', icon: '⚔️', fields: ['cost', 'atk', 'hp'] },
    { title: '关键词 & 描述', icon: '📝', fields: ['keywords', 'desc'] }
  ],
  策略SLG单位: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'tier', 'unit_type'] },
    { title: '战斗属性', icon: '⚔️', fields: ['hp', 'atk', 'move_speed', 'range'] },
    { title: '造价 & 克制', icon: '💰', fields: ['cost', 'counters'] },
    { title: '描述 & 图片', icon: '📝', fields: ['desc'] }
  ],
  FPS武器: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'weapon_type'] },
    { title: '武器数值', icon: '⚔️', fields: ['damage', 'fire_rate', 'mag_size', 'reload_time', 'accuracy', 'range_'] },
    { title: '描述 & 图片', icon: '📝', fields: ['desc'] }
  ],
  MOBA英雄: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'role', 'difficulty'] },
    {
      title: '基础属性',
      icon: '⚔️',
      fields: ['base_hp', 'base_ad', 'base_armor', 'base_mr', 'move_speed', 'attack_range']
    },
    { title: '标签 & 描述', icon: '📝', fields: ['tags', 'desc'] }
  ],
  '空白（手动创建）': [{ title: '基础信息', icon: '📌', fields: ['id', 'name'] }]
}

/** 新建类型草稿：id 自动去重（new_type / new_type_2 ...），初始字段用空白模板 */
export function buildNewTypeDraft(existingIds: string[]): DataTypeDef {
  const used = new Set(existingIds)
  let id = 'new_type'
  let index = 2
  while (used.has(id)) {
    id = `new_type_${index}`
    index++
  }
  return {
    id,
    name: '新类型',
    pluralKey: `${id}s`,
    color: '#607D8B',
    formFields: structuredClone(TYPE_TEMPLATES['空白（手动创建）'] ?? [])
  }
}