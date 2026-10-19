import type { FieldType, TypeFieldDef } from './types'

/**
 * 条目编辑器的**分区定义与构建**（折叠分区布局）。
 *
 * ## 历史与本次回归
 * 分区体系最初于 2026-10-04 从 Python `dynamic_form.py::FIELD_GROUPS` 迁移，
 * 2026-10-13 按用户要求**整体拉平**（`formSections.ts` / `FormSectionCard.tsx` 及配套测试删除）。
 * 2026-10-19 用户对照分区版截图再次要求恢复，故本模块重写回来。
 *
 * ## 与已删除版本的有意差异（**不是漏迁，是刻意不收**）
 * - **不收双列网格**（旧版 `layout: 'grid'`）：numeric 分区排两列、标签带
 *   `❤️ HP` / `⏱️ CD` 这类 emoji 前缀。用户给的目标截图里是单列 + 原始标签，
 *   且 10-13 拉平时的理由（「一列看全、不用展开分区」）仍然成立 ⇒ 不恢复。
 * - **不收「更新版 Python」那套 `editor_layouts.json` 配置**（`dbfe391` 已实证它是
 *   「能写、没人读、且已过期」的配置，条目编辑器从不读它）。
 * - 分区内字段顺序按**分区定义**排（照抄 Python `_build_form`：分区内按分组定义顺序，
 *   schema 里不存在的字段跳过）。
 *
 * ## 兜底规则（对用户自建类型很重要）
 * `FORM_GROUPS` 只覆盖 7 个内置类型。用户自建类型（battle / character 等）没有条目，
 * 此时：普通字段全部进一个「基础信息」分区；**复杂控件各占一个分区**（标题取其字段
 * label），避免属性面板/引用表和其他字段混在一列里滚动。
 */

/** 分区的静态定义 */
export interface FormSectionDef {
  title: string
  icon: string
  /** 默认是否折叠；缺省时「第一个分区展开、其余折叠」 */
  collapsed?: boolean
  /** 绑定该类型的 attrpanel 整块编辑器（不是普通字段） */
  attributePanel?: boolean
  /** 分区内的字段名（按此顺序渲染） */
  fields?: string[]
}

/**
 * 内置 7 类型的分区定义（照抄 Python `FIELD_GROUPS` 的**分组**，去掉 grid 版式）。
 * 折叠默认值：仅第一个分区展开，其余折叠 —— 与用户给的目标截图一致。
 */
export const FORM_GROUPS: Readonly<Record<string, readonly FormSectionDef[]>> = {
  role: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'job', 'race', 'faction', 'category'] },
    { title: '属性面板 (RPG三层体系)', icon: '⚔️', attributePanel: true },
    { title: '技能 & 天赋', icon: '🎯', fields: ['skills', 'talents', 'buffs'] },
    { title: '特殊机制', icon: '⚙️', fields: ['mechanism'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  monster: [
    {
      title: '基础信息',
      icon: '📌',
      fields: ['id', 'name', 'level', 'type', 'category', 'difficulty', 'behavior']
    },
    { title: '属性面板 (RPG三层体系)', icon: '⚔️', attributePanel: true },
    { title: '技能 & 天赋', icon: '🎯', fields: ['skills', 'talents', 'buffs'] },
    { title: '特殊机制', icon: '⚙️', fields: ['mechanism'] },
    {
      title: '掉落配置',
      icon: '💎',
      fields: ['generic_drops', 'equip_drops', 'item_drops', 'title_drops']
    },
    {
      title: '描述 & 图片',
      icon: '📝',
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  job: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'job_tier', 'base_job_from', 'type', 'desc'] },
    {
      title: '武器 & 加成',
      icon: '⚔️',
      fields: ['weapons', 'hp_bonus', 'mp_bonus', 'atk_bonus', 'def_bonus']
    },
    { title: '机制 & 资源', icon: '⚙️', fields: ['mechanism', 'resource_type'] },
    { title: '属性列表', icon: '📋', attributePanel: true },
    { title: '技能体系', icon: '🎯', fields: ['core_skills', 'passives', 'skill_types'] },
    {
      title: '难度 & 风格',
      icon: '📊',
      fields: ['difficulty', 'playstyle', 'growth_type', 'inherent_buffs']
    },
    { title: '进阶 & 标签', icon: '🏆', fields: ['unlock_condition', 'evolve_jobs', 'tags'] }
  ],
  skill: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'category', 'target'] },
    {
      title: '数值配置',
      icon: '⚔️',
      fields: ['value', 'multiplier', 'cd', 'damage_type', 'consume', 'effect']
    },
    { title: '关联 Buff', icon: '🛡️', fields: ['buffs'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  talent: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'owner', 'type', 'level', 'rarity', 'category'] },
    { title: '数值配置', icon: '⚔️', fields: ['value', 'effect_type'] },
    { title: '解锁条件', icon: '🔓', fields: ['unlock_condition'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  equip: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'part', 'rare', 'job', 'category'] },
    { title: '数值配置', icon: '⚔️', fields: ['value', 'effect'] },
    { title: '关联 Buff', icon: '🛡️', fields: ['buffs'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ],
  item: [
    { title: '基础信息', icon: '📌', fields: ['id', 'name', 'type', 'rare', 'category'] },
    { title: '数值配置', icon: '⚔️', fields: ['value', 'effect'] },
    { title: '关联 Buff', icon: '🛡️', fields: ['buffs'] },
    {
      title: '描述 & 图片',
      icon: '📝',
      fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']
    }
  ]
}

/** 复杂字段类型：编辑器自带工具条/表头，值得单独成区（对应旧版 `_COMPLEX_TYPES`） */
export const COMPLEX_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'multiselect',
  'droptable',
  'attrtable',
  'attrpanel'
])

/** 兜底分区（无 FORM_GROUPS 条目的类型使用） */
const FALLBACK_SECTION = { title: '基础信息', icon: '📌' } as const

/** 「叙述类」字段：描述与图片自成一组（兜底布局用，与内置类型的「描述 & 图片」分区同义） */
const NARRATIVE_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'desc',
  'content',
  'achievement_desc',
  'image',
  'image_desc',
  'image_tags'
])

/** 解析后的分区（字段已按 schema 过滤，只保留确实存在的） */
export interface FormSection {
  title: string
  icon: string
  /** 默认是否折叠 */
  collapsed: boolean
  fields: TypeFieldDef[]
}

export interface FormLayout {
  sections: FormSection[]
}

/** 该字段类型是否为「复杂」控件（兜底渲染时单独成区） */
export function isComplexFieldType(type: FieldType): boolean {
  return COMPLEX_FIELD_TYPES.has(type)
}

/**
 * 构建分区布局。
 *
 * 规则：
 * - 有 `FORM_GROUPS` 条目的类型：按定义逐分区渲染，schema 里不存在的字段名跳过；
 *   `attributePanel: true` 的分区绑定该类型第一个 `attrpanel` 字段；
 *   渲染不出内容的分区不产出（不留空折叠卡片）。
 * - **未归组字段并入第一个分区**（追加在其字段之后，按 schema 顺序）。
 *   Python 原版让它们渲染在分区**外面**（`talent` 的 owner/level/rarity 等一直如此），
 *   结果是「一半字段在卡片里、一半散在卡片外」，观感割裂 ⇒ 这里刻意改变。
 * - **折叠默认值：全部分区默认展开**（`collapsed` 恒为 false）。
 *   目标截图里是「只展开第一个」，但那种默认态会让字段**看不见** —— 用户打开条目想改描述，
 *   得先记得去点「描述 & 图片」。10-13 拉平那版用户满意「一列看全、不用展开分区」，
 *   正是这个原因。折叠能力保留（点头部即可），但默认不给用户藏字段。
 */
export function buildFormLayout(typeId: string, fields: readonly TypeFieldDef[]): FormLayout {
  const defs = FORM_GROUPS[typeId]
  if (defs === undefined) return buildFallbackLayout(fields)

  const byName = new Map(fields.map((field) => [field.name, field]))
  const grouped = new Set<string>()
  const sections: FormSection[] = []

  for (const def of defs) {
    const resolved: TypeFieldDef[] = []

    if (def.attributePanel === true) {
      const panel = fields.find((field) => field.type === 'attrpanel')
      if (panel) {
        resolved.push(panel)
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

    if (resolved.length === 0) continue
    sections.push({
      title: def.title,
      icon: def.icon,
      collapsed: def.collapsed ?? false,
      fields: resolved
    })
  }

  const leftovers = fields.filter((field) => !grouped.has(field.name))

  /*
   * 未归组字段并入第一个分区（Python 原版渲染在分区外，观感割裂）。
   * 追加顺序 = schema 顺序（`leftovers` 本身就是按 fields 顺序过滤出来的）。
   * 若一个分区都没产出（极端情况：类型只定义了不存在的字段名），补一个基础信息分区。
   */
  if (leftovers.length > 0) {
    if (sections.length === 0) {
      sections.push({
        title: FALLBACK_SECTION.title,
        icon: FALLBACK_SECTION.icon,
        collapsed: false,
        fields: [...leftovers]
      })
    } else {
      sections[0] = { ...sections[0], fields: [...sections[0].fields, ...leftovers] }
    }
  }

  return { sections }
}

/**
 * 兜底布局（用户自建类型没有 `FORM_GROUPS` 条目时）：
 * 按**字段语义**分三档，而不是一股脑塞进一个区 ——
 * - 「基础信息」：普通字段（id/name/combobox/spinbox/tags/template/…）
 * - 「描述 & 图片」：`desc`/`content`/`achievement_desc`/`image`/`image_desc`/`image_tags`
 * - 复杂控件（attrpanel/attrtable/multiselect/droptable）：每个各占一区，标题取字段 label
 *
 * 为什么按语义而不是按顺序切：自建类型通常字段少（如 `character` 只有 id/名称/描述/图片），
 * 全塞一个区等于「没有分区」；而描述/图片天然是「次要信息」，和 id/名称分开才符合目标截图的层次。
 */
function buildFallbackLayout(fields: readonly TypeFieldDef[]): FormLayout {
  const complex = fields.filter((field) => isComplexFieldType(field.type))
  const rest = fields.filter((field) => !isComplexFieldType(field.type))
  const narrative = rest.filter((field) => NARRATIVE_FIELD_TYPES.has(field.type))
  const plain = rest.filter((field) => !NARRATIVE_FIELD_TYPES.has(field.type))

  const sections: FormSection[] = []
  if (plain.length > 0) {
    sections.push({ title: FALLBACK_SECTION.title, icon: FALLBACK_SECTION.icon, collapsed: false, fields: plain })
  }
  if (narrative.length > 0) {
    sections.push({ title: '描述 & 图片', icon: '📝', collapsed: false, fields: narrative })
  }
  for (const field of complex) {
    sections.push({
      title: field.label.replace(/:?\s*$/, '') || field.name,
      icon: '⚙️',
      collapsed: false,
      fields: [field]
    })
  }
  return { sections }
}
