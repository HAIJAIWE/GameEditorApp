import { describe, expect, it } from 'vitest'

import { buildFormLayout } from '@mobai/shared/schema/core'
import { validateTypeSchema } from '@mobai/shared/schema/adapters'
import { TYPE_TEMPLATE_NAMES, TYPE_TEMPLATE_SECTIONS, TYPE_TEMPLATES } from '@mobai/shared/schema/core'
import type { DataTypeDef } from '@mobai/shared/types'

/**
 * 「模板分区命名建议」的数据契约：
 * 每个内置模板都要有一份建议分区，且**每个字段恰好出现一次**（不重不漏）。
 * 这条约束保证建议是完整、无歧义的 —— 否则用户照着建议归类时会漏字段或撞车。
 */
describe('TYPE_TEMPLATE_SECTIONS：建议分区覆盖完整', () => {
  it('每个内置模板都有建议分区', () => {
    for (const name of TYPE_TEMPLATE_NAMES) {
      const sections = TYPE_TEMPLATE_SECTIONS[name]
      expect(sections, `模板「${name}」缺少建议分区`).toBeDefined()
      expect(sections.length, `模板「${name}」建议分区为空`).toBeGreaterThan(0)
    }
  })

  it('建议分区里的字段都真实存在于对应模板', () => {
    for (const name of TYPE_TEMPLATE_NAMES) {
      const fieldNames = new Set((TYPE_TEMPLATES[name] ?? []).map((field) => field.name))
      for (const section of TYPE_TEMPLATE_SECTIONS[name] ?? []) {
        for (const field of section.fields) {
          expect(fieldNames.has(field), `模板「${name}」的建议分区「${section.title}」含不存在的字段「${field}」`).toBe(
            true
          )
        }
      }
    }
  })

  it('每个字段恰好归入一个分区（不重不漏）', () => {
    for (const name of TYPE_TEMPLATE_NAMES) {
      const expected = new Set((TYPE_TEMPLATES[name] ?? []).map((field) => field.name))
      const seen = new Set<string>()
      for (const section of TYPE_TEMPLATE_SECTIONS[name] ?? []) {
        for (const field of section.fields) {
          expect(seen.has(field), `模板「${name}」的字段「${field}」被重复归入分区`).toBe(false)
          seen.add(field)
        }
      }
      const missing = [...expected].filter((field) => !seen.has(field))
      expect(missing, `模板「${name}」有字段未归入任何建议分区`).toEqual([])
    }
  })

  it('分区标题与图标非空', () => {
    for (const name of TYPE_TEMPLATE_NAMES) {
      for (const section of TYPE_TEMPLATE_SECTIONS[name] ?? []) {
        expect(section.title.trim(), `模板「${name}」有分区标题为空`).not.toBe('')
        expect(section.icon.trim(), `模板「${name}」的分区「${section.title}」图标为空`).not.toBe('')
      }
    }
  })
})

describe('TYPE_TEMPLATE_SECTIONS：可直接落盘并驱动表单', () => {
  /** 把某模板 + 建议分区组装成一个待校验的类型定义 */
  function buildDef(name: string): DataTypeDef {
    return {
      id: 't',
      name: 'T',
      pluralKey: 'ts',
      color: '#607D8B',
      formFields: TYPE_TEMPLATES[name] ?? [],
      sections: (TYPE_TEMPLATE_SECTIONS[name] ?? []).map((section) => ({
        title: section.title,
        icon: section.icon,
        fields: [...section.fields]
      }))
    }
  }

  it('每个模板的建议分区都通过 schema 校验（可直接保存）', () => {
    for (const name of TYPE_TEMPLATE_NAMES) {
      expect(validateTypeSchema([buildDef(name)]), `模板「${name}」的建议分区校验未通过`).toEqual([])
    }
  })

  it('套用建议分区后，条目表单分区标题与建议完全一致', () => {
    for (const name of TYPE_TEMPLATE_NAMES) {
      const def = buildDef(name)
      const layout = buildFormLayout(def.id, def.formFields, def.sections)
      expect(layout.sections.map((section) => section.title), `模板「${name}」渲染出的分区标题不符`).toEqual(
        def.sections?.map((section) => section.title) ?? []
      )
    }
  })
})
