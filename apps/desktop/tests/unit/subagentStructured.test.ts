import { describe, expect, it } from 'vitest'

import {
  checkStructuredReply,
  coerceOutputSchema,
  parseStructuredReply,
  renderStructured,
  structuredInstruction,
  structuredRepairPrompt
} from '@mobai/shared/agent/brain'

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    count: { type: 'integer' }
  },
  required: ['title']
} as const

describe('parseStructuredReply（容忍围栏与前后说明）', () => {
  it('纯 JSON', () => {
    const parsed = parseStructuredReply('{"title":"第一章"}')
    expect(parsed).toEqual({ ok: true, value: { title: '第一章' } })
  })

  it('```json 围栏', () => {
    const parsed = parseStructuredReply('```json\n{"title":"第一章"}\n```')
    expect(parsed.ok).toBe(true)
  })

  it('无语言标记的围栏', () => {
    const parsed = parseStructuredReply('```\n{"title":"x"}\n```')
    expect(parsed.ok).toBe(true)
  })

  it('前后夹说明文字：取第一个 { 到最后一个 }', () => {
    const parsed = parseStructuredReply('好的，结果如下：\n{"title":"x","count":3}\n希望有帮助。')
    expect(parsed).toEqual({ ok: true, value: { title: 'x', count: 3 } })
  })

  it('空答复与纯散文都判失败，并给出原文开头', () => {
    expect(parseStructuredReply('   ').ok).toBe(false)
    const prose = parseStructuredReply('我完成了这个任务，结果很好。')
    expect(prose.ok).toBe(false)
    if (!prose.ok) expect(prose.reason).toContain('我完成了这个任务')
  })
})

describe('coerceOutputSchema（派发前把坏 schema 挡住）', () => {
  it('接受 object 与缺省 type', () => {
    expect(coerceOutputSchema({ type: 'object', properties: {} })).not.toBeNull()
    expect(coerceOutputSchema({ properties: { a: { type: 'string' } } })).not.toBeNull()
  })

  it('拒绝非对象 / 数组 / 非 object 的 type / properties 不是对象', () => {
    expect(coerceOutputSchema(null)).toBeNull()
    expect(coerceOutputSchema('object')).toBeNull()
    expect(coerceOutputSchema([])).toBeNull()
    expect(coerceOutputSchema({ type: 'string' })).toBeNull()
    expect(coerceOutputSchema({ type: 'object', properties: 'x' })).toBeNull()
    expect(coerceOutputSchema({ type: 'object', required: 'title' })).toBeNull()
  })
})

describe('checkStructuredReply（解析 + schema 校验）', () => {
  it('合规通过并带回值', () => {
    const checked = checkStructuredReply('{"title":"x"}', schema)
    expect(checked.ok).toBe(true)
    if (checked.ok) expect(checked.value).toEqual({ title: 'x' })
  })

  it('缺必填 / 类型错都给带路径的违规点', () => {
    const missing = checkStructuredReply('{"count":1}', schema)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.violation.path).toBe('$.title')

    const wrongType = checkStructuredReply('{"title":"x","count":"三"}', schema)
    expect(wrongType.ok).toBe(false)
    if (!wrongType.ok) expect(wrongType.violation.path).toBe('$.count')
  })

  it('非 JSON 的违规点在根，且说明是没解析出来', () => {
    const checked = checkStructuredReply('没有 JSON', schema)
    expect(checked.ok).toBe(false)
    if (!checked.ok) {
      expect(checked.violation.path).toBe('$')
      expect(checked.violation.message).toContain('没有解析出 JSON')
    }
  })
})

describe('提示词拼装', () => {
  it('约束指令带上 schema 原文', () => {
    const text = structuredInstruction(schema)
    expect(text).toContain('结构化输出要求')
    expect(text).toContain('"title"')
    expect(text).toContain('JSON 对象')
  })

  it('修复提示带上次输出（截断到 800）与违规点', () => {
    const text = structuredRepairPrompt('写第一章', 'A'.repeat(900), '$.title is required', schema)
    expect(text).toContain('写第一章')
    expect(text).toContain('上一次尝试不合格')
    expect(text).toContain('$.title is required')
    expect(text).toContain('…')
    expect(text).not.toContain('A'.repeat(801))
  })

  it('renderStructured 输出可读的 json 代码块', () => {
    expect(renderStructured({ title: 'x' })).toContain('```json')
    expect(renderStructured({ title: 'x' })).toContain('"title": "x"')
  })
})
