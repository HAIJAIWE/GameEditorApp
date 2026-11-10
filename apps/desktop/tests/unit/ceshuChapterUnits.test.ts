import { describe, expect, it } from 'vitest'

// 深插 `prompts` 目录内的文件是被禁止的（能力文件夹只许走 index.ts）。本批模块的
// 入口导出由集成阶段统一加进 `ceshu/prompts/index.ts`（该目录同时有多个改动方在写，
// 逐人各改一次 index.ts 只会互相踩）；接线完成后改用 `@mobai/shared/ceshu/prompts` 桶。
/* eslint-disable local/no-deep-capability-import -- 桶导出由集成阶段统一接线，接线后改走 `@mobai/shared/ceshu/prompts` */
import {
  CHAPTER_UNIT_MAX_FIELDS,
  mergeUnitFields,
  planChapterUnits
} from '@mobai/shared/ceshu/prompts/ceshuChapterUnits'
/* eslint-enable local/no-deep-capability-import */

/**
 * 生成单元分组的逐项锁定。
 *
 * 这层是「一次只写一个单元」的地基，串了就会直接表现为线上问题：
 * 分组超过上限 ⇒ 又回到整章 33 字段的截断归零；派生字段被拆出去 ⇒ 模型把要点抄一遍。
 * 所以用例盯的是边界而不是正常路径：上限、派生字段、点路径、重复、非法上限。
 */

const THIRTEEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']

describe('planChapterUnits：上限与切分', () => {
  it('≤ 上限时返回 1 个单元，fields 与入参完全一致（含顺序）', () => {
    const fields = ['core_loop', 'core_loop_points', 'meta.positioning', 'x']
    const units = planChapterUnits('战斗', fields)
    expect(units).toHaveLength(1)
    expect(units[0].id).toBe('u1')
    expect(units[0].fields).toEqual(fields)
  })

  it('缺省上限是 6', () => {
    expect(CHAPTER_UNIT_MAX_FIELDS).toBe(6)
    expect(planChapterUnits('战斗', THIRTEEN)[0].fields).toHaveLength(6)
  })

  it('13 个字段切成 3 组：6 / 6 / 1，且顺序不丢', () => {
    const units = planChapterUnits('战斗', THIRTEEN)
    expect(units.map((unit) => unit.id)).toEqual(['u1', 'u2', 'u3'])
    expect(units.map((unit) => unit.fields.length)).toEqual([6, 6, 1])
    expect(mergeUnitFields(units)).toEqual(THIRTEEN)
  })

  it('空输入返回空数组', () => {
    expect(planChapterUnits('战斗', [])).toEqual([])
  })

  it('上限非法值（0 / 负数 / 非整数 / NaN）回落 6', () => {
    for (const bad of [0, -3, 2.5, Number.NaN]) {
      const units = planChapterUnits('战斗', THIRTEEN, { maxFieldsPerUnit: bad })
      expect(units.map((unit) => unit.fields.length)).toEqual([6, 6, 1])
    }
  })

  it('显式上限生效', () => {
    const units = planChapterUnits('战斗', THIRTEEN, { maxFieldsPerUnit: 4 })
    expect(units.map((unit) => unit.fields.length)).toEqual([4, 4, 4, 1])
  })
})

describe('planChapterUnits：派生字段与点路径不能单独成组', () => {
  it('_points / _notes 跟随本体', () => {
    const fields = ['core_loop', 'core_loop_points', 'core_loop_notes', 's1', 's2', 's3', 's4']
    const units = planChapterUnits('战斗', fields)
    const owner = units.find((unit) => unit.fields.includes('core_loop'))!
    expect(owner.fields).toContain('core_loop_points')
    expect(owner.fields).toContain('core_loop_notes')
  })

  it('本体被别的字段隔开时，派生字段仍回到本体所在单元', () => {
    const fields = ['core_loop', 's1', 's2', 's3', 's4', 's5', 'core_loop_points', 'core_loop_notes']
    const units = planChapterUnits('战斗', fields)
    const owner = units.find((unit) => unit.fields.includes('core_loop'))!
    expect(owner.fields).toContain('core_loop_points')
    expect(owner.fields).toContain('core_loop_notes')
  })

  it('点路径归父：a.b / a.c 与 a 同组，父不出现时也彼此同组', () => {
    const withParent = planChapterUnits('战斗', ['a', 's1', 's2', 's3', 's4', 's5', 'a.b', 'a.c'])
    const owner = withParent.find((unit) => unit.fields.includes('a'))!
    expect(owner.fields).toEqual(expect.arrayContaining(['a.b', 'a.c']))

    const withoutParent = planChapterUnits('战斗', ['x', 'y', 'z', 'w', 'v', 'a.b', 'a.c'])
    const pair = withoutParent.find((unit) => unit.fields.includes('a.b'))!
    expect(pair.fields).toContain('a.c')
  })

  it('同父字段多到一单元装不下时，硬上限优先（按入参顺序切块）', () => {
    const fields = Array.from({ length: 8 }, (_, index) => `root.k${index}`)
    const units = planChapterUnits('战斗', fields)
    expect(units.map((unit) => unit.fields.length)).toEqual([6, 2])
    expect(units[0].fields).toEqual(fields.slice(0, 6))
  })
})

describe('planChapterUnits：去重与 id / label', () => {
  it('重复字段只出现一次', () => {
    const units = planChapterUnits('战斗', ['a', 'b', 'a', 'b', 'c'])
    expect(units).toHaveLength(1)
    expect(units[0].fields).toEqual(['a', 'b', 'c'])
  })

  it('id 按组序稳定，label 取组内前 2 个中文名并用「、」连接', () => {
    const units = planChapterUnits('战斗', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], {
      labels: { a: '甲', b: '乙', c: '丙', g: '庚' }
    })
    expect(units[0].id).toBe('u1')
    expect(units[0].label).toBe('甲、乙…')
    expect(units[1].id).toBe('u2')
    expect(units[1].label).toBe('庚')
  })

  it('labels 未命中回落 key；整组无中文名时回落章名', () => {
    const units = planChapterUnits('战斗', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], { labels: { a: '甲' } })
    expect(units[0].label).toBe('甲、b…')
    expect(units[1].label).toBe('战斗')
  })

  it('两个字段时 label 不加省略号', () => {
    const units = planChapterUnits('战斗', ['a', 'b'], { labels: { a: '甲', b: '乙' } })
    expect(units[0].label).toBe('甲、乙')
  })
})

describe('mergeUnitFields', () => {
  it('按单元顺序拼接并去重，点路径合并成父字段', () => {
    const units = [
      { id: 'u1', label: '甲', fields: ['a', 'a.b', 'c'] },
      { id: 'u2', label: '乙', fields: ['c', 'd'] }
    ]
    expect(mergeUnitFields(units)).toEqual(['a', 'c', 'd'])
  })

  it('派生字段是独立字段，必须保留', () => {
    expect(mergeUnitFields([{ id: 'u1', label: '甲', fields: ['a', 'a_points', 'a_notes'] }])).toEqual([
      'a',
      'a_points',
      'a_notes'
    ])
  })

  it('空单元返回空数组', () => {
    expect(mergeUnitFields([])).toEqual([])
  })
})
