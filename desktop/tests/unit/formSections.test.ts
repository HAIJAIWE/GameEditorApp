import { describe, expect, it } from 'vitest'

import { buildFormLayout, isComplexFieldType } from '../../src/shared/schema/core/formSections'
import type { TypeFieldDef } from '../../src/shared/types'
import { BUILTIN_DATA_TYPES } from '../../src/shared/schema/core/typeSchema'

/**
 * `buildFormLayout` 的单元测试（2026-10-19 分区回归）。
 *
 * 重点锁三件容易回归的事：
 * 1. **分区定义与真实 schema 必须吻合** —— `FORM_GROUPS` 是照抄 旧版 的静态表，
 *    schema 改了它不会自动跟上； mismatch 的字段会被并入第一个分区（不丢，但顺序会变）。
 * 2. **未归组字段并入第一个分区**。
 * 3. **复杂控件单独成区**（attrpanel / attrtable / multiselect / droptable）。
 */

const field = (name: string, type: TypeFieldDef['type'] = 'entry'): TypeFieldDef => ({
  name,
  label: `${name}:`,
  type,
  editable: true
})

const builtin = (typeId: string): TypeFieldDef[] => {
  const def = BUILTIN_DATA_TYPES.find((item) => item.id === typeId)
  if (def === undefined) throw new Error(`内置类型不存在：${typeId}`)
  return def.formFields
}

const titles = (typeId: string): string[] => buildFormLayout(typeId, builtin(typeId)).sections.map((s) => s.title)

describe('FORM_GROUPS 与内置 schema 的吻合度', () => {
  /*
   * 这张表是**分类断言**而非逐字段比对：分区定义允许比 schema 少（少的部分并入第一个分区），
   * 但不允许有分区整段渲染不出内容 —— 那说明定义过期了。
   */
  it.each(['role', 'monster', 'job', 'skill', 'talent', 'equip', 'item'])(
    '%s：每个分区都至少渲染出一个字段（分区定义未过期）',
    (typeId) => {
      const layout = buildFormLayout(typeId, builtin(typeId))
      expect(layout.sections.length).toBeGreaterThan(0)
      for (const section of layout.sections) {
        expect(section.fields.length, `分区「${section.title}」为空`).toBeGreaterThan(0)
      }
    }
  )

  it.each(['role', 'monster', 'job', 'skill', 'talent', 'equip', 'item'])(
    '%s：分区字段并集 = schema 全字段（不丢不重）',
    (typeId) => {
      const fields = builtin(typeId)
      const layout = buildFormLayout(typeId, fields)
      const grouped = layout.sections.flatMap((section) => section.fields.map((f) => f.name))
      expect(grouped.slice().sort()).toEqual(fields.map((f) => f.name).slice().sort())
      expect(new Set(grouped).size, '同一字段被归入多个分区').toBe(grouped.length)
    }
  )

  it('role：分区标题与顺序（对齐目标截图的五分区）', () => {
    expect(titles('role')).toEqual([
      '基础信息',
      '属性面板 (RPG三层体系)',
      '技能 & 天赋',
      '特殊机制',
      '描述 & 图片'
    ])
  })

  it('role：attrpanel 字段归入「属性面板」分区而不是普通字段行', () => {
    const layout = buildFormLayout('role', builtin('role'))
    const panel = layout.sections.find((section) => section.title === '属性面板 (RPG三层体系)')
    expect(panel?.fields.map((f) => f.name)).toEqual(['attr_list'])
  })
})

describe('折叠默认值', () => {
  it('全部分区默认展开（数据编辑器里不给用户藏字段）', () => {
    const layout = buildFormLayout('role', builtin('role'))
    expect(layout.sections.map((section) => section.collapsed)).toEqual([false, false, false, false, false])
  })
})

describe('字段顺序', () => {
  it('分区内按分区定义顺序，而非 schema 顺序', () => {
    const layout = buildFormLayout('role', builtin('role'))
    const base = layout.sections[0]
    // role schema 里 category 排第 11 位，分区定义把它提到「基础信息」末尾
    expect(base.fields.map((f) => f.name)).toEqual(['id', 'name', 'job', 'race', 'faction', 'category'])
  })

  it('分区定义里 schema 不存在的字段名被跳过', () => {
    const sparse = [field('id'), field('name')]
    const layout = buildFormLayout('role', sparse)
    expect(layout.sections).toHaveLength(1)
    expect(layout.sections[0].fields.map((f) => f.name)).toEqual(['id', 'name'])
    expect(layout.sections[0].title).toBe('基础信息')
  })
})

describe('未归组字段', () => {
  it('并入第一个分区（而非渲染到分区外）', () => {
    const fields = [field('id'), field('name'), field('job'), field('extra_a'), field('extra_b')]
    const layout = buildFormLayout('role', fields)
    expect(layout.sections).toHaveLength(1)
    // 追加在分区既有字段之后，按 schema 顺序
    expect(layout.sections[0].fields.map((f) => f.name)).toEqual(['id', 'name', 'job', 'extra_a', 'extra_b'])
  })

  it('分区定义完全不匹配时补出一个基础信息分区，不丢字段', () => {
    const fields = [field('a'), field('b')]
    const layout = buildFormLayout('skill', fields)
    expect(layout.sections).toHaveLength(1)
    expect(layout.sections[0].title).toBe('基础信息')
    expect(layout.sections[0].fields.map((f) => f.name)).toEqual(['a', 'b'])
  })
})

describe('无 FORM_GROUPS 条目的类型（用户自建）', () => {
  it('按语义分区：基础信息 / 描述 & 图片 / 复杂控件各一区', () => {
    const layout = buildFormLayout('battle', [
      field('id'),
      field('name'),
      field('desc', 'desc'),
      field('image', 'image'),
      field('attr_list', 'attrpanel')
    ])
    expect(layout.sections.map((s) => [s.title, s.fields.map((f) => f.name)])).toEqual([
      ['基础信息', ['id', 'name']],
      ['描述 & 图片', ['desc', 'image']],
      ['attr_list', ['attr_list']]
    ])
  })

  it('character（id/名称/描述/图片）分出两个区，而不是全塞一个', () => {
    const layout = buildFormLayout('character', [
      field('id'),
      field('name'),
      field('desc', 'desc'),
      field('image', 'image')
    ])
    expect(layout.sections.map((s) => [s.title, s.fields.map((f) => f.name)])).toEqual([
      ['基础信息', ['id', 'name']],
      ['描述 & 图片', ['desc', 'image']]
    ])
  })

  it('没有叙述类字段时不产出空的「描述 & 图片」分区', () => {
    const layout = buildFormLayout('character', [field('id'), field('name')])
    expect(layout.sections).toHaveLength(1)
    expect(layout.sections[0].title).toBe('基础信息')
  })

  it('复杂控件分区的标题取字段 label 去掉末尾冒号，且同样默认展开', () => {
    const layout = buildFormLayout('character', [field('id'), field('name'), field('skills', 'multiselect')])
    const last = layout.sections[layout.sections.length - 1]
    expect(last.title).toBe('skills')
    expect(last.collapsed).toBe(false)
  })
})

describe('isComplexFieldType', () => {
  it('四类复杂控件识别为 true', () => {
    for (const type of ['multiselect', 'droptable', 'attrtable', 'attrpanel'] as const) {
      expect(isComplexFieldType(type), type).toBe(true)
    }
  })

  it('普通字段为 false', () => {
    for (const type of ['entry', 'desc', 'image', 'combobox', 'spinbox', 'tags'] as const) {
      expect(isComplexFieldType(type), type).toBe(false)
    }
  })
})

describe('自定义分区（类型自带 sections，优先级最高）', () => {
  const fields = [field('id'), field('name'), field('hp', 'spinbox'), field('atk', 'spinbox'), field('desc', 'desc')]

  it('压过内置 FORM_GROUPS（role 也按自定义分区渲染）', () => {
    const layout = buildFormLayout('role', fields, [
      { title: '基础信息', icon: '📌', fields: ['id', 'name'] },
      { title: '战斗属性', icon: '⚔️', fields: ['hp', 'atk'] },
      { title: '描述', icon: '📝', fields: ['desc'] }
    ])
    expect(layout.sections.map((s) => [s.title, s.fields.map((f) => f.name)])).toEqual([
      ['基础信息', ['id', 'name']],
      ['战斗属性', ['hp', 'atk']],
      ['描述', ['desc']]
    ])
  })

  it('不存在的字段被跳过，渲染不出内容的分区被丢弃', () => {
    const layout = buildFormLayout('custom', fields, [
      { title: '基础信息', icon: '📌', fields: ['id', 'name', 'hp', 'atk', 'desc', 'nope'] },
      { title: '空分区', icon: '⚙️', fields: ['also_nope'] }
    ])
    // 全字段已覆盖 ⇒ 无 leftovers 干扰；`nope` 被跳过、`空分区` 被丢弃
    expect(layout.sections.map((s) => s.title)).toEqual(['基础信息'])
    expect(layout.sections[0].fields.map((f) => f.name)).toEqual(['id', 'name', 'hp', 'atk', 'desc'])
  })

  it('未归组字段并入第一个分区（不丢字段）', () => {
    const layout = buildFormLayout('custom', fields, [{ title: '基础信息', icon: '📌', fields: ['id', 'name'] }])
    expect(layout.sections).toHaveLength(1)
    expect(layout.sections[0].fields.map((f) => f.name)).toEqual(['id', 'name', 'hp', 'atk', 'desc'])
  })

  it('collapsed 透传，缺省不折叠', () => {
    const layout = buildFormLayout('custom', fields, [
      { title: '折叠区', icon: '📌', collapsed: true, fields: ['id', 'name'] }
    ])
    expect(layout.sections[0].collapsed).toBe(true)
  })

  it('空数组等价于未提供（回落内置/兜底）', () => {
    const layout = buildFormLayout('battle', [field('id'), field('name')], [])
    expect(layout.sections.map((s) => s.title)).toEqual(['基础信息'])
  })
})
