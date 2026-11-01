import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, CHAPTER_REQUIRED_FIELDS } from '@mobai/shared/ceshu/reference'
import { FIELD_SPLITS } from '@mobai/shared/ceshuSchema'
import { CESHU_CHAPTER_FIELDS } from '@mobai/shared/ceshu/fields'

/*
 * P1 结构拆分的守卫测试（2026-10-23）。
 *
 * 拆分配置是**纯数据**：键写错不会报错、只会静默不生效——这类失败在集成时
 * 极难发现（界面就是不出现新字段），所以用测试把规则全部钉死。
 */

describe('字段结构拆分守卫（P1）', () => {
  it('每个拆分清单的键都真实存在于该章字段表', () => {
    const unknown: string[] = []
    for (const chapter of Object.keys(FIELD_SPLITS) as Array<keyof typeof FIELD_SPLITS>) {
      const keys = new Set((CESHU_CHAPTER_FIELDS[chapter] ?? []).map((field) => field.key))
      for (const key of FIELD_SPLITS[chapter] ?? []) {
        if (!keys.has(key)) unknown.push(`${chapter}.${key}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('不拆必填字段、非 textarea、点路径与 _notes 字段', () => {
    const bad: string[] = []
    for (const chapter of Object.keys(FIELD_SPLITS) as Array<keyof typeof FIELD_SPLITS>) {
      const required = new Set(CHAPTER_REQUIRED_FIELDS[chapter])
      const byKey = new Map((CESHU_CHAPTER_FIELDS[chapter] ?? []).map((field) => [field.key, field]))
      for (const key of FIELD_SPLITS[chapter] ?? []) {
        const field = byKey.get(key)
        if (field === undefined) continue
        if (required.has(key)) bad.push(`${chapter}.${key} 是必填字段`)
        if (field.kind !== 'textarea') bad.push(`${chapter}.${key} 不是 textarea（${field.kind}）`)
        if (key.includes('.')) bad.push(`${chapter}.${key} 是点路径字段`)
        if (key.endsWith('_notes')) bad.push(`${chapter}.${key} 已是拆分产物`)
      }
    }
    expect(bad).toEqual([])
  })

  it('不拆人定字段（aiDraftable=false 的字段 AI 不起草，拆了没人填）', () => {
    const humanOnly: string[] = []
    for (const chapter of Object.keys(FIELD_SPLITS) as Array<keyof typeof FIELD_SPLITS>) {
      const byKey = new Map((CESHU_CHAPTER_FIELDS[chapter] ?? []).map((field) => [field.key, field]))
      for (const key of FIELD_SPLITS[chapter] ?? []) {
        const field = byKey.get(key)
        if (field !== undefined && field.aiDraftable === false) humanOnly.push(`${chapter}.${key}`)
      }
    }
    expect(humanOnly).toEqual([])
  })

  it('每个被拆字段都有配套的「要点 / 补充」，且带契约', () => {
    const broken: string[] = []
    for (const chapter of Object.keys(FIELD_SPLITS) as Array<keyof typeof FIELD_SPLITS>) {
      const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
      const byKey = new Map(fields.map((field) => [field.key, field]))
      for (const key of FIELD_SPLITS[chapter] ?? []) {
        const base = byKey.get(key)
        const points = byKey.get(`${key}_points`)
        const notes = byKey.get(`${key}_notes`)
        if (base === undefined || points === undefined || notes === undefined) {
          broken.push(`${chapter}.${key} 缺少配套字段`)
          continue
        }
        if (points.kind !== 'stringList' || notes.kind !== 'textarea') broken.push(`${chapter}.${key} 配套字段类型不对`)
        if (points.label !== `${base.label}·要点` || notes.label !== `${base.label}·补充`) {
          broken.push(`${chapter}.${key} 配套字段标签不对`)
        }
        if ((points.aiHint ?? '') === '' || (notes.aiHint ?? '') === '') broken.push(`${chapter}.${key} 配套字段缺 aiHint`)
      }
    }
    expect(broken).toEqual([])
  })

  it('全表字段 key 无重复（拆分插入不会撞键）', () => {
    const duplicated: string[] = []
    for (const chapter of CHAPTER_KEYS) {
      const seen = new Set<string>()
      for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
        if (seen.has(field.key)) duplicated.push(`${chapter}.${field.key}`)
        seen.add(field.key)
      }
    }
    expect(duplicated).toEqual([])
  })
})
