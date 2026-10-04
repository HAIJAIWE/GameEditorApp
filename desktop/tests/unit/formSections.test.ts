import { describe, expect, it } from 'vitest'

import {
  COMPLEX_FIELD_TYPES,
  FORM_GROUPS,
  STAT_LABELS,
  buildFormLayout,
  fieldLabelFor,
  isComplexFieldType
} from '../../src/shared/formSections'
import { BUILTIN_DATA_TYPES } from '../../src/shared/typeSchema'
import type { FieldType, TypeFieldDef } from '../../src/shared/types'

/** 构造字段（测试用最小定义） */
function f(name: string, label = name, type: FieldType = 'entry'): TypeFieldDef {
  return { name, label, type, editable: true }
}

function defsOf(typeId: string): TypeFieldDef[] {
  const def = BUILTIN_DATA_TYPES.find((t) => t.id === typeId)
  if (!def) throw new Error(`未找到类型 ${typeId}`)
  return def.formFields
}

describe('formSections：常量转写保真（照抄 Python FIELD_GROUPS / STAT_LABELS）', () => {
  it('覆盖 7 个内置类型，分区数与 Python 一致', () => {
    // 实测 Python：job 7 / role 5 / monster 6 / skill 4 / talent 3 / equip 4 / item 4
    expect(Object.keys(FORM_GROUPS)).toEqual(['job', 'role', 'monster', 'skill', 'talent', 'equip', 'item'])
    expect(FORM_GROUPS['job']).toHaveLength(7)
    expect(FORM_GROUPS['role']).toHaveLength(5)
    expect(FORM_GROUPS['monster']).toHaveLength(6)
    expect(FORM_GROUPS['skill']).toHaveLength(4)
    expect(FORM_GROUPS['talent']).toHaveLength(3)
    expect(FORM_GROUPS['equip']).toHaveLength(4)
    expect(FORM_GROUPS['item']).toHaveLength(4)
  })

  it('分区引用的字段名总数与 Python 一致（合计 124）', () => {
    const count = (typeId: string): number =>
      (FORM_GROUPS[typeId] ?? []).reduce((sum, def) => sum + (def.fields?.length ?? 0), 0)
    expect(count('job')).toBe(24)
    expect(count('role')).toBe(16)
    expect(count('monster')).toBe(21)
    expect(count('skill')).toBe(18)
    expect(count('talent')).toBe(16)
    expect(count('equip')).toBe(15)
    expect(count('item')).toBe(14)
    expect(['job', 'role', 'monster', 'skill', 'talent', 'equip', 'item'].reduce((s, t) => s + count(t), 0)).toBe(
      124
    )
  })

  it('「关联 Buff」分区只在 skill/equip/item（JSON 版本缺这三个，是漂移证据）', () => {
    const withBuff = Object.entries(FORM_GROUPS)
      .filter(([, defs]) => defs.some((def) => def.title === '关联 Buff'))
      .map(([typeId]) => typeId)
    expect(withBuff).toEqual(['skill', 'equip', 'item'])
  })

  it('grid 分区与 attribute_panel 分区的归属（照抄 Python）', () => {
    for (const typeId of ['job', 'skill', 'talent', 'equip', 'item']) {
      expect(
        (FORM_GROUPS[typeId] ?? []).some((def) => def.layout === 'grid'),
        `${typeId} 应有 grid 分区`
      ).toBe(true)
    }
    for (const typeId of ['role', 'monster']) {
      expect((FORM_GROUPS[typeId] ?? []).some((def) => def.type === 'attribute_panel')).toBe(true)
    }
    // 默认折叠的分区（照抄 Python collapsed: True）
    expect(FORM_GROUPS['role']?.find((d) => d.title === '描述 & 图片')?.collapsed).toBe(true)
    expect(FORM_GROUPS['role']?.find((d) => d.title === '特殊机制')?.collapsed).toBe(true)
    expect(FORM_GROUPS['role']?.find((d) => d.title === '基础信息')?.collapsed).toBeUndefined()
  })

  it('STAT_LABELS 照抄 8 条', () => {
    expect(Object.keys(STAT_LABELS)).toHaveLength(8)
    expect(STAT_LABELS['value']).toBe('📊 数值')
    expect(STAT_LABELS['cd']).toBe('⏱️ CD')
    expect(STAT_LABELS['hp']).toBe('❤️ HP')
  })

  it('有意不迁 STAT_HINTS（实证死代码）：模块不导出任何属性参考范围', () => {
    // Python 的 _create_stat_hint 只在 grid 分支被调用，而 grid 类型 ∩ STAT_HINTS 键 = ∅
    expect(Object.keys(STAT_LABELS)).not.toContain('hp_range')
    expect(COMPLEX_FIELD_TYPES.has('attrpanel')).toBe(true)
    expect(isComplexFieldType('multiselect')).toBe(true)
    expect(isComplexFieldType('droptable')).toBe(true)
    expect(isComplexFieldType('attrtable')).toBe(true)
    expect(isComplexFieldType('entry')).toBe(false)
    expect(isComplexFieldType('spinbox')).toBe(false)
  })
})

describe('formSections：分区解析', () => {
  it('role：attribute_panel 分区绑定 attr_list，且 attr_list 不再重复出现在未归组', () => {
    const layout = buildFormLayout('role', defsOf('role'))
    expect(layout.sections.map((s) => s.title)).toEqual([
      '基础信息',
      '属性面板 (RPG三层体系)',
      '技能 & 天赋',
      '特殊机制',
      '描述 & 图片'
    ])
    const panel = layout.sections[1]
    expect(panel.panelField).toBe('attr_list')
    expect(panel.fields).toEqual([])
    // 修正 Python 缺陷：attr_list 被计入已归组，不再走兜底重复渲染
    expect(layout.ungrouped.map((x) => x.name)).toEqual([])
    expect(layout.sections[0].fields.map((x) => x.name)).toEqual([
      'id',
      'name',
      'job',
      'race',
      'faction',
      'category'
    ])
  })

  it('job：attr_list 是普通分区字段（该类型 attr_list 为 attrtable）', () => {
    const layout = buildFormLayout('job', defsOf('job'))
    expect(layout.sections).toHaveLength(7)
    const attrSection = layout.sections.find((s) => s.title === '属性列表')
    expect(attrSection?.panelField).toBeNull()
    expect(attrSection?.fields.map((x) => x.name)).toEqual(['attr_list'])
    expect(layout.ungrouped).toEqual([])
  })

  it('monster：schema 里不存在的 generic_drops 被跳过，其余照常', () => {
    const layout = buildFormLayout('monster', defsOf('monster'))
    const drops = layout.sections.find((s) => s.title === '掉落配置')
    // Python 列了 4 个（generic_drops/equip_drops/item_drops/title_drops），TS schema 无 generic_drops
    expect(drops?.fields.map((x) => x.name)).toEqual(['equip_drops', 'item_drops', 'title_drops'])
    expect(layout.sections.find((s) => s.title === '属性面板 (RPG三层体系)')?.panelField).toBe('attr_list')
    expect(layout.ungrouped).toEqual([])
  })

  it('talent：Python 引用的 5 个字段在 TS schema 中不存在 → 分区只剩 value，其余字段走未归组', () => {
    const layout = buildFormLayout('talent', defsOf('talent'))
    const numeric = layout.sections.find((s) => s.title === '数值配置')
    // Python 列了 value/multiplier/cd/damage_type/consume/effect；TS talent schema 只有 value
    expect(numeric?.fields.map((x) => x.name)).toEqual(['value'])
    expect(numeric?.layout).toBe('grid')
    // 未被任何分区覆盖的字段必须全部保留（P0-2 兜底），一个都不能丢
    expect(layout.ungrouped.map((x) => x.name)).toEqual([
      'owner',
      'level',
      'rarity',
      'effect_type',
      'unlock_condition'
    ])
  })

  it('字段顺序按分区定义，而不是 schema 顺序', () => {
    // 传入顺序 desc,name,id；role 的 desc 属「描述 & 图片」而非「基础信息」
    const layout = buildFormLayout('role', [f('desc'), f('name'), f('id')])
    expect(layout.sections[0].fields.map((x) => x.name)).toEqual(['id', 'name'])
    expect(layout.sections.at(-1)?.title).toBe('描述 & 图片')
    expect(layout.sections.at(-1)?.fields.map((x) => x.name)).toEqual(['desc'])
    expect(layout.ungrouped).toEqual([])
  })

  it('未定义分区配置的类型：不产出分区，全部走未归组（一个字段都不丢）', () => {
    const fields = [f('id'), f('name'), f('content')]
    const layout = buildFormLayout('achievement', fields)
    expect(layout.sections).toEqual([])
    expect(layout.ungrouped.map((x) => x.name)).toEqual(['id', 'name', 'content'])
  })

  it('分区字段全部不存在时不产出空分区（Python 会留下空折叠卡片，此处修正）', () => {
    const layout = buildFormLayout('role', [f('id')])
    expect(layout.sections.map((s) => s.title)).toEqual(['基础信息'])
    expect(layout.sections[0].fields.map((x) => x.name)).toEqual(['id'])
    expect(layout.ungrouped).toEqual([])
  })

  it('attribute_panel 分区：该类型没有 attrpanel 字段时不产出', () => {
    // equip 无 attrpanel 字段，且其分区定义不含 attribute_panel；用 skill 造一个含该分区的场景
    const layout = buildFormLayout('role', [f('id'), f('name', '角色名称:'), f('skills', '技能:', 'multiselect')])
    const titles = layout.sections.map((s) => s.title)
    expect(titles).not.toContain('属性面板 (RPG三层体系)')
    expect(titles).toContain('技能 & 天赋')
    expect(layout.ungrouped).toEqual([])
  })

  it('fieldLabelFor：grid 分区用 STAT_LABELS 覆盖，表单分区用字段自身 label', () => {
    const value = f('value', '数值:')
    const cd = f('cd', '冷却:')
    const other = f('damage_type', '伤害类型:')
    expect(fieldLabelFor(value, 'grid')).toBe('📊 数值')
    expect(fieldLabelFor(cd, 'grid')).toBe('⏱️ CD')
    expect(fieldLabelFor(other, 'grid')).toBe('伤害类型:')
    expect(fieldLabelFor(value, 'form')).toBe('数值:')
  })
})

describe('formSections × 真实内置 schema：不变式', () => {
  it('12 个内置类型：分区字段 + 未归组字段恰好覆盖每个字段一次（无遗漏、无重复）', () => {
    for (const type of BUILTIN_DATA_TYPES) {
      const layout = buildFormLayout(type.id, type.formFields)
      const seen: string[] = []
      for (const section of layout.sections) {
        if (section.panelField) seen.push(section.panelField)
        for (const field of section.fields) seen.push(field.name)
      }
      for (const field of layout.ungrouped) seen.push(field.name)

      expect(seen, `${type.id}: 覆盖数应等于字段数`).toHaveLength(type.formFields.length)
      expect(new Set(seen).size, `${type.id}: 不应有字段被渲染两次`).toBe(seen.length)
      expect([...seen].sort()).toEqual([...type.formFields.map((f2) => f2.name)].sort())
    }
  })

  it('7 个有分区配置的类型里，6 个能被完整覆盖（talent 因 schema 差异余 5 个走兜底）', () => {
    const summary = Object.keys(FORM_GROUPS).map((typeId) => {
      const layout = buildFormLayout(typeId, defsOf(typeId))
      return { typeId, grouped: layout.sections.length, ungrouped: layout.ungrouped.length }
    })
    expect(summary).toEqual([
      { typeId: 'job', grouped: 7, ungrouped: 0 },
      { typeId: 'role', grouped: 5, ungrouped: 0 },
      { typeId: 'monster', grouped: 6, ungrouped: 0 },
      { typeId: 'skill', grouped: 4, ungrouped: 0 },
      { typeId: 'talent', grouped: 3, ungrouped: 5 },
      { typeId: 'equip', grouped: 4, ungrouped: 0 },
      { typeId: 'item', grouped: 4, ungrouped: 0 }
    ])
  })

  it('每个产出的分区都必须有可渲染内容（不会出现空卡片）', () => {
    for (const type of BUILTIN_DATA_TYPES) {
      for (const section of buildFormLayout(type.id, type.formFields).sections) {
        const renderable = section.fields.length + (section.panelField ? 1 : 0)
        expect(renderable, `${type.id}/${section.title} 不应为空分区`).toBeGreaterThan(0)
      }
    }
  })
})
