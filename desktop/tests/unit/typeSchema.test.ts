import { describe, expect, it } from 'vitest'

import { DATA_TYPES, getTypeByLegacyKey, listTypeSummaries } from '../../src/shared/typeSchema'

/** 迁移锁定：各类型字段数与 Python 版 rpg_schema.py v2.4 一致 */
const EXPECTED_FIELD_COUNTS: Record<string, number> = {
  role: 16,
  job: 24,
  monster: 20,
  equip: 15,
  skill: 18,
  talent: 16,
  item: 14,
  achievement: 5,
  buff: 15,
  story: 17,
  task: 11,
  dialog: 11
}

describe('12 数据类型 schema', () => {
  it('恰好 12 种类型，id / 复数键唯一，字段总数与逐类型字段数锁定', () => {
    expect(DATA_TYPES).toHaveLength(12)
    expect(new Set(DATA_TYPES.map((t) => t.id)).size).toBe(12)
    expect(new Set(DATA_TYPES.map((t) => t.pluralKey)).size).toBe(12)

    const total = DATA_TYPES.reduce((sum, t) => sum + t.formFields.length, 0)
    expect(total).toBe(182)

    for (const t of DATA_TYPES) {
      expect(t.formFields.length).toBe(EXPECTED_FIELD_COUNTS[t.id])
    }
  })

  it('每种类型都有 id/name 字段，且字段定义完整（label/type 非空）', () => {
    for (const t of DATA_TYPES) {
      const names = t.formFields.map((f) => f.name)
      expect(names).toContain('id')
      expect(names).toContain('name')

      const idDef = t.formFields[0]
      expect(idDef.name).toBe('id')
      expect(idDef.editable).toBe(false)

      for (const f of t.formFields) {
        expect(f.label.length).toBeGreaterThan(0)
        expect(f.type.length).toBeGreaterThan(0)
      }
    }
  })

  it('旧数据键映射：复数键与单数键均可解析，未知键返回 undefined', () => {
    expect(getTypeByLegacyKey('roles')?.id).toBe('role')
    expect(getTypeByLegacyKey('buffs')?.id).toBe('buff')
    expect(getTypeByLegacyKey('skill')?.id).toBe('skill')
    expect(getTypeByLegacyKey('not_a_type')).toBeUndefined()

    const summaries = listTypeSummaries()
    expect(summaries).toHaveLength(12)
    expect(summaries[0]?.fieldCount).toBeGreaterThan(0)
  })
})