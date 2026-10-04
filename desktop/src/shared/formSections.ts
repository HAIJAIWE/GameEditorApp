import { resolveFieldLabel } from './gameStyle'
import type { FieldType, TypeFieldDef } from './types'

/**
 * 条目编辑器表单分区（数据表条目编辑器的分区/折叠/双列布局）。
 *
 * ## 权威来源
 * 数据来源是 Python `ui/widgets/dynamic_form.py` 里的**硬编码常量** `FIELD_GROUPS` / `STAT_LABELS`，
 * 而不是 `data/editor_layouts.json`。这不是随意选择，而是实证结论：
 *
 * - `dynamic_form.py:262` 用的是 `FIELD_GROUPS.get(data_type)`；`FIELD_GROUPS = {` 是该名字**唯一**的赋值处，
 *   从不从 JSON 读取（`grep FIELD_GROUPS` 全命中即此）。
 * - `editor_layouts.json` 只被 `EditorLayout`（`core/editor_layout.py`）读写，而它的消费者只有
 *   布局编辑器 `type_editor_layout_widget.py` 与 Agent 技能 `editor_layout_skill.py`——
 *   **条目编辑器从不读它**。
 * - 两者**已经漂移**（实测）：`FIELD_GROUPS.skill/equip/item` 有「关联 Buff」分区，JSON 没有；
 *   `job` 的「属性列表」分区 JSON 也没有；`role`/`monster` 的「技能 & 天赋」字段数 3 vs 2。
 * → 也就是说 `editor_layout.py` + 那个 JSON + 布局编辑器 + Agent 技能是一整套**「能写、没人读、且已过期」**的配置。
 *   本刀按权威（用户真正看到的）`FIELD_GROUPS` 迁移，**不迁那套写而无用的配置**。
 *
 * ## 有意不迁（均经实证为死代码）
 * - `STAT_HINTS` 及 `_create_stat_hint`/`_update_stat_hints`：`_create_stat_hint()` 只在
 *   `layout == 'grid'` 分支被调用，而有 grid 分区的类型是 `{job, skill, talent, equip, item}`，
 *   `STAT_HINTS` 的键却是 `{role, monster}`——**交集为空**，提示标签永远不会被创建，
 *   `_update_stat_hints()` 因此必然早退。整套属性参考范围提示是死代码。
 * - `_styled_label`（`style_manager.resolve_field_label` 术语替换）：已迁（E21，见 `shared/gameStyle.ts`）。
 *   Python 靠 `style_manager` 的**全局单例**承载活跃风格；TS 无全局可变态，改为 `App` 持 state 并
 *   以 `styleId` 参数显式传入（`fieldLabelFor` / `ItemForm` 的 `gameStyle` prop）。
 *   **默认无活跃风格（`''`）下与 Python 等价**：`resolveLabel` 对空 styleId 原样返回。
 *
 * ## 字段标签的渲染口径（照抄 Python `dynamic_form.py`）
 * - `layout: 'grid'`：`STAT_LABELS[field.name] ?? resolveFieldLabel(field.label, styleId)`
 *   （Python `STAT_LABELS.get(fname, _styled_label(field['label']))` —— **命中 STAT_LABELS 时不参与术语替换**，
 *   故必须先取 STAT_LABELS、再退化为「已替换的字段标签」，顺序不能颠倒）
 * - 其他分支：`resolveFieldLabel(field.label, styleId)`
 *
 * ## 对 Python 的有意偏离（TS 修正）
 * - Python 的 `attribute_panel` 分区不把字段计入 `grouped_fields`，而 `role`/`monster` 的 schema 里又有
 *   `attr_list` 字段 → 它会再走兜底渲染一次，即**同一数据出现两个编辑控件**（保存互相覆盖）。
 *   本模块把 `attribute_panel` 分区**绑定到该类型的 `attrpanel` 字段**并计入已归组，只渲染一次。
 * - Python 的 `_COMPLEX_TYPES` 含 `genericdrop`/`attrconversion`，TS 的 `FieldType` 无这两种；
 *   反之 TS 新增了 `attrpanel` 复杂控件，故补入。
 */

/** 分区的静态定义（照抄 Python `FIELD_GROUPS`，含标题/图标/默认折叠/双列/特殊控件） */
export interface FormSectionDef {
  title: string
  icon: string
  /** 默认是否折叠（缺省 false） */
  collapsed?: boolean
  /** `'grid'` 为双列网格；缺省为单列表单 */
  layout?: 'grid'
  /** `'attribute_panel'` 为特殊控件分区（绑定到该类型的 attrpanel 字段） */
  type?: 'attribute_panel'
  /** 分区内的字段名（按此顺序渲染） */
  fields?: string[]
}

/** 条目编辑器的分区定义（照抄 Python `dynamic_form.py::FIELD_GROUPS`，7 个内置类型） */
export const FORM_GROUPS: Readonly<Record<string, readonly FormSectionDef[]>> = {
  job: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'job_tier', 'base_job_from', 'type', 'desc'] },
    {
      title: '武器 & 加成',
      icon: '⚔️',
      fields: ['weapons', 'hp_bonus', 'mp_bonus', 'atk_bonus', 'def_bonus'],
      layout: 'grid'
    },
    { title: '机制 & 资源', icon: '⚙️', fields: ['mechanism', 'resource_type'] },
    { title: '属性列表', icon: '📋', fields: ['attr_list'] },
    { title: '技能体系', icon: '🎯', collapsed: true, fields: ['core_skills', 'passives', 'skill_types'] },
    {
      title: '难度 & 风格',
      icon: '📊',
      collapsed: true,
      fields: ['difficulty', 'playstyle', 'growth_type', 'inherent_buffs']
    },
    {
      title: '进阶 & 标签',
      icon: '🏆',
      collapsed: true,
      fields: ['unlock_condition', 'evolve_jobs', 'tags']
    }
  ],
  role: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'job', 'race', 'faction', 'category'] },
    { title: '属性面板 (RPG三层体系)', icon: '⚔️', type: 'attribute_panel' },
    { title: '技能 & 天赋', icon: '🎯', fields: ['skills', 'talents', 'buffs'] },
    { title: '特殊机制', icon: '⚙️', collapsed: true, fields: ['mechanism'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      collapsed: true,
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  monster: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'level', 'type', 'category', 'difficulty', 'behavior'] },
    { title: '属性面板 (RPG三层体系)', icon: '⚔️', type: 'attribute_panel' },
    { title: '技能 & 天赋', icon: '🎯', fields: ['skills', 'talents', 'buffs'] },
    { title: '特殊机制', icon: '⚙️', collapsed: true, fields: ['mechanism'] },
    {
      title: '掉落配置',
      icon: '💎',
      fields: ['generic_drops', 'equip_drops', 'item_drops', 'title_drops']
    },
    {
      title: '描述 & 图片',
      icon: '📝',
      collapsed: true,
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  skill: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'category', 'target'] },
    {
      title: '数值配置',
      icon: '⚔️',
      fields: ['value', 'multiplier', 'cd', 'damage_type', 'consume', 'effect'],
      layout: 'grid'
    },
    { title: '关联 Buff', icon: '🛡️', fields: ['buffs'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      collapsed: true,
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  talent: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'category'] },
    {
      title: '数值配置',
      icon: '⚔️',
      fields: ['value', 'multiplier', 'cd', 'damage_type', 'consume', 'effect'],
      layout: 'grid'
    },
    {
      title: '描述 & 图片',
      icon: '📝',
      collapsed: true,
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  equip: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'part', 'rare', 'job', 'category'] },
    { title: '数值配置', icon: '⚔️', fields: ['value', 'effect'], layout: 'grid' },
    { title: '关联 Buff', icon: '🛡️', fields: ['buffs'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      collapsed: true,
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  item: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'rare', 'category'] },
    { title: '数值配置', icon: '⚔️', fields: ['value', 'effect'], layout: 'grid' },
    { title: '关联 Buff', icon: '🛡️', fields: ['buffs'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      collapsed: true,
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ]
}

/**
 * 双列网格分区里覆盖字段标签（照抄 Python `STAT_LABELS`，仅用于 `layout: 'grid'`；
 * 未命中时退化为经过术语替换的字段 label）。
 */
export const STAT_LABELS: Readonly<Record<string, string>> = {
  hp: '❤️ HP',
  mp: '💧 MP',
  atk: '⚔️ ATK',
  def: '🛡️ DEF',
  exp: '⭐ EXP',
  value: '📊 数值',
  multiplier: '✖️ 倍率',
  cd: '⏱️ CD'
}

/**
 * 「复杂」字段类型：兜底渲染时单独包一个分区（照抄 Python `_COMPLEX_TYPES`）。
 * TS 差异：无 `genericdrop`/`attrconversion`，新增 `attrpanel`（TS 中 attrpanel 是整块编辑器）。
 */
export const COMPLEX_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'multiselect',
  'droptable',
  'attrtable',
  'attrpanel'
])

/** 解析后的分区（字段已按 schema 过滤，只保留确实存在的字段） */
export interface FormSection {
  title: string
  icon: string
  collapsed: boolean
  layout: 'form' | 'grid'
  /** `type: 'attribute_panel'` 分区绑定的字段名；非此类分区为 null */
  panelField: string | null
  fields: TypeFieldDef[]
}

export interface FormLayout {
  sections: FormSection[]
  /** 未被任何分区覆盖的字段（按 schema 顺序）；渲染时复杂类型单独包分区 */
  ungrouped: TypeFieldDef[]
}

/** 该字段类型是否为「复杂」控件（兜底渲染时应单独成区） */
export function isComplexFieldType(type: FieldType): boolean {
  return COMPLEX_FIELD_TYPES.has(type)
}

/**
 * 分区内字段的显示标签：grid 分区优先 `STAT_LABELS`（命中即不替换）；
 * 否则用字段自身 label 经 `resolveFieldLabel` 做术语替换（`styleId` 为空则原样）。
 */
export function fieldLabelFor(field: TypeFieldDef, layout: 'form' | 'grid', styleId = ''): string {
  if (layout === 'grid') return STAT_LABELS[field.name] ?? resolveFieldLabel(field.label, styleId)
  return resolveFieldLabel(field.label, styleId)
}

/**
 * 构建条目编辑器的分区布局（对应 Python `DynamicFormWidget._build_form`）。
 *
 * 规则（照抄并按上述偏离修正）：
 * - 分区内字段按**分区定义顺序**渲染；schema 中不存在的字段名**跳过**（Python 同样 `continue`）
 * - `type: 'attribute_panel'` 分区绑定该类型第一个 `attrpanel` 字段，并计入已归组（**修正 Python 的重复渲染**）
 * - 渲染不出任何内容的分区**不产出**（Python 会留一个空折叠卡片，纯噪音；此偏离不丢字段，
 *   因为该分区的字段本就不存在，未被归组的字段一律走 `ungrouped`）
 * - 未归组字段按 schema 顺序进 `ungrouped`
 */
export function buildFormLayout(typeId: string, fields: readonly TypeFieldDef[]): FormLayout {
  const defs = FORM_GROUPS[typeId] ?? []
  const byName = new Map(fields.map((field) => [field.name, field]))
  const grouped = new Set<string>()
  const sections: FormSection[] = []

  for (const def of defs) {
    const layout: 'form' | 'grid' = def.layout === 'grid' ? 'grid' : 'form'
    let panelField: string | null = null
    const resolved: TypeFieldDef[] = []

    if (def.type === 'attribute_panel') {
      const panel = fields.find((field) => field.type === 'attrpanel')
      if (panel) {
        panelField = panel.name
        grouped.add(panel.name)
      }
    } else {
      for (const name of def.fields ?? []) {
        const field = byName.get(name)
        if (!field) continue
        grouped.add(name)
        resolved.push(field)
      }
    }

    if (panelField === null && resolved.length === 0) continue

    sections.push({
      title: def.title,
      icon: def.icon,
      collapsed: def.collapsed ?? false,
      layout,
      panelField,
      fields: resolved
    })
  }

  return {
    sections,
    ungrouped: fields.filter((field) => !grouped.has(field.name))
  }
}
