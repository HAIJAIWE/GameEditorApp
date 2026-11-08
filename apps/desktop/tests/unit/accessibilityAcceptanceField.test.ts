import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { CESHU_CHAPTER_FIELDS } from '@mobai/shared/ceshu/fields'

/**
 * 第 ⑯ 章新增「可访问性验收清单」字段（2026-11-08）。
 *
 * 起因：该章原有 10 个字段全是描述性（textarea / stringList），没有任何一处能承接
 * 「谁用什么工具量、量到多少算过」的验收动作，导致这一章天然不可验收。
 * 参照 docs/samples/ch16-accessibility-sample.md 的实跑产物（33 条验收项）补一个
 * 结构化字段。按「补字段一律 optional」的规矩加，不得抬高老文档必填门槛。
 */
describe('accessibility.acceptance_checks：验收清单字段', () => {
  const field = () =>
    (CESHU_CHAPTER_FIELDS.accessibility as readonly { key: string; required?: boolean; kind?: string; columns?: readonly { key: string }[] }[]).find(
      (item) => item.key === 'acceptance_checks'
    )

  it('字段确实进了 schema（否则登记了编辑器也不渲染）', () => {
    expect(field(), 'acceptance_checks 未注册').toBeDefined()
  })

  it('不是必填：模板补字段不得抬高老文档完成度门槛', () => {
    expect(field()?.required).not.toBe(true)
  })

  it('是 pipeList 且列为 检查项/依据/判定方法/责任角色/阻断', () => {
    const target = field()
    expect(target?.kind).toBe('pipeList')
    expect(target?.columns?.map((column) => column.key)).toEqual(['check', 'basis', 'method', 'owner', 'blocking'])
  })

  it('新建文档默认空数组：老文档不会凭空多出未填项', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' }) as unknown as Record<string, Record<string, unknown>>
    expect(doc.accessibility.acceptance_checks).toEqual([])
  })
})
