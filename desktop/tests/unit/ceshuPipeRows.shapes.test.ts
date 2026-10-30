import { describe, expect, it } from 'vitest'

import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshu/fields/ceshuFields'
import { CHAPTER_KEYS } from '../../src/shared/ceshu/reference/ceshuConstants'
import { splitRow, toRowStrings, toRows } from '../../src/shared/ceshu/workflow/ceshuPipeRows'

/**
 * pipeList **两种存储形态**的读取守卫（2026-10-26 修静默失效 bug 后立的）。
 *
 * ## 背景：一个「零风险展示增强」引发的静默失效
 * pipeList 有两种半形态：
 * - 无 `columns` → 字符串行 `['a|b|c']`；
 * - 有 `columns` → 对象行 `[{colKey: 值}]`（表单保存按此规则）。
 *
 * 下游的**校验 / 复算管道**（数值断言复算、账本对账、用例枚举、原型验收映射、
 * 设计主张核对、Demo 提示词）原先一律用 `toRows`——只认字符串。于是给
 * `numeric_assertions` 补 `columns`（纯展示增强、零迁移）之后，表单写出的对象行
 * **在复算里全部被静默跳过**：不报错、不告警，面板看起来「通过」，实则一条没算。
 *
 * 修法：收口出 `toRowStrings(value, columns)`，两种形态都能读；所有管道消费方走它。
 * 本文件守住两件事：①对象行确实被读到；②`toRows` 的旧语义没被顺手改掉。
 */

describe('toRowStrings：两种存储形态都能读', () => {
  it('字符串行原样返回', () => {
    expect(toRowStrings(['a|b|c', 'd|e|f'])).toEqual(['a|b|c', 'd|e|f'])
  })

  it('对象行按列定义顺序还原（列顺序即语义，不能靠对象键序）', () => {
    const columns = [
      { key: 'claim', label: '断言' },
      { key: 'expr', label: '表达式' }
    ]
    // 故意把键序打乱：claim 在 expr 之后
    expect(toRowStrings([{ expr: '1+1', claim: '一加一' }], columns)).toEqual(['一加一 | 1+1'])
  })

  it('无列定义的对象行按值顺序拼（与渲染层 joinPipeList 同口径）', () => {
    expect(toRowStrings([{ type: '角色', count: 50 }])).toEqual(['角色 | 50'])
  })

  it('混排（字符串 + 对象）与空行/非字符串非对象都稳定', () => {
    expect(toRowStrings(['a|b', { x: 1 }, '', 42, null])).toEqual(['a|b', '1'])
  })

  it('对象里缺列 / null 值 → 空格占位，不产生 undefined 字面量', () => {
    const columns = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' }
    ]
    expect(toRowStrings([{ a: '1', c: null }], columns)).toEqual(['1 |  | '])
  })

  it('非数组入参返回空数组（不抛异常）', () => {
    expect(toRowStrings(undefined)).toEqual([])
    expect(toRowStrings('a|b')).toEqual([])
    expect(toRowStrings({ a: 1 })).toEqual([])
  })
})

describe('toRows：旧语义保持不变（仍只认字符串行）', () => {
  it('对象行被过滤掉——所以需要 toRowStrings 的地方不能再用它', () => {
    expect(toRows([{ a: 1 }])).toEqual([])
    expect(toRows(['a|b'])).toEqual(['a|b'])
    expect(toRows(['  '])).toEqual([])
  })
})

describe('字段形态普查：每种形态都有消费方走的路', () => {
  it('全表 pipeList 字段：有列 / 无列都不为空（形态分布不漂移到一边）', () => {
    const withColumns: string[] = []
    const withoutColumns: string[] = []
    for (const chapter of CHAPTER_KEYS) {
      for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
        if (field.kind !== 'pipeList') continue
        if ((field.columns ?? []).length > 0) withColumns.push(`${chapter}.${field.key}`)
        else withoutColumns.push(`${chapter}.${field.key}`)
      }
    }
    // 两种形态都存在：任何一侧归零，都说明「形态假设」已经在代码里写死了
    expect(withColumns.length).toBeGreaterThan(0)
    expect(withoutColumns.length).toBeGreaterThan(0)
  })

  it('splitRow 能把 toRowStrings 的产物拆回各列（两种形态往返一致）', () => {
    const columns = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' }
    ]
    const objects = [{ a: '1', b: '2' }]
    const strings = ['1|2', '3 | 4']
    expect(splitRow(toRowStrings(objects, columns)[0]!)).toEqual(['1', '2'])
    expect(splitRow(toRowStrings(strings)[0]!)).toEqual(['1', '2'])
    expect(splitRow(toRowStrings(strings)[1]!)).toEqual(['3', '4'])
  })
})
