import { describe, expect, it } from 'vitest'

import {
  DATA_TYPE_LABELS,
  TEMPLATE_DEFS,
  filterQuickCreateTypes,
  listQuickCreateTemplates,
  listQuickCreateTypes,
  quickCreateTypeLabel
} from '../../src/shared/util/quickCreate'

describe('quickCreate：模板数据完整性', () => {
  it('12 个数据类型', () => {
    expect(listQuickCreateTypes()).toHaveLength(12)
    expect(listQuickCreateTypes()).toEqual([
      'role', 'job', 'monster', 'skill', 'equip', 'item',
      'buff', 'talent', 'achievement', 'story', 'task', 'dialog'
    ])
  })

  it('每个类型都有显示名（下拉框不出现空白项）', () => {
    for (const type of listQuickCreateTypes()) {
      expect(DATA_TYPE_LABELS[type], `类型 ${type} 缺显示名`).toBeTruthy()
    }
  })

  it('模板总数 61，且每个类型至少 1 个模板', () => {
    const total = listQuickCreateTypes().reduce(
      (sum, type) => sum + listQuickCreateTemplates(type).length,
      0
    )
    expect(total).toBe(61)
    for (const type of listQuickCreateTypes()) {
      expect(listQuickCreateTemplates(type).length, `类型 ${type} 无模板`).toBeGreaterThan(0)
    }
  })

  it('每个模板都有 name / desc / 非空 defaults', () => {
    for (const type of listQuickCreateTypes()) {
      for (const tpl of listQuickCreateTemplates(type)) {
        expect(tpl.name, `${type} 有模板缺 name`).not.toBe('')
        expect(tpl.desc, `${type}/${tpl.name} 缺 desc`).not.toBe('')
        expect(Object.keys(tpl.defaults).length, `${type}/${tpl.name} defaults 为空`).toBeGreaterThan(0)
      }
    }
  })

  it('同类型内模板名不重复（否则卡片无法区分）', () => {
    for (const type of listQuickCreateTypes()) {
      const names = listQuickCreateTemplates(type).map((tpl) => tpl.name)
      expect(new Set(names).size, `类型 ${type} 有重名模板`).toBe(names.length)
    }
  })

  it('defaults 的值都是字符串（落库直接进 data，不夹带别的类型）', () => {
    for (const type of listQuickCreateTypes()) {
      for (const tpl of listQuickCreateTemplates(type)) {
        for (const [key, value] of Object.entries(tpl.defaults)) {
          expect(typeof value, `${type}/${tpl.name}.${key} 非字符串`).toBe('string')
        }
      }
    }
  })

  it('类型键是单数（与 items.type 口径一致，不是 pluralKey）', () => {
    for (const type of listQuickCreateTypes()) {
      expect(type.endsWith('s'), `类型键 ${type} 看着像复数`).toBe(false)
    }
  })
})

describe('quickCreate：查询函数', () => {
  it('listQuickCreateTemplates 未知类型返回空数组（不抛）', () => {
    expect(listQuickCreateTemplates('not_exist')).toEqual([])
  })

  it('quickCreateTypeLabel 未收录时退回键本身', () => {
    expect(quickCreateTypeLabel('role')).toBe('角色')
    expect(quickCreateTypeLabel('unknown_key')).toBe('unknown_key')
  })

  it('filterQuickCreateTypes：只保留 schema 里真实存在的类型（防孤儿条目）', () => {
    expect(filterQuickCreateTypes(['role', 'skill'])).toEqual(['role', 'skill'])
    expect(filterQuickCreateTypes(['role', 'not_in_templates'])).toEqual(['role'])
    expect(filterQuickCreateTypes([])).toEqual([])
  })

  it('filterQuickCreateTypes 保持声明序，且不改变模板表本身', () => {
    expect(filterQuickCreateTypes(['dialog', 'role', 'task'])).toEqual(['role', 'task', 'dialog'])
    expect(listQuickCreateTypes()).toHaveLength(12)
  })

  it('模板数据只读引用：修改返回值不污染源数据', () => {
    const before = listQuickCreateTemplates('role').length
    const copy = [...listQuickCreateTemplates('role')]
    copy.pop()
    expect(listQuickCreateTemplates('role')).toHaveLength(before)
    expect(Object.isFrozen(TEMPLATE_DEFS)).toBe(false) // 仅编译期只读；运行期靠约定
  })
})
