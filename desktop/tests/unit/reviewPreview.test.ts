import { describe, expect, it } from 'vitest'

import { previewFieldValue, readFieldValue } from '../../src/renderer/src/components/ceshu/reviewPreview'

describe('previewFieldValue：队列内联预览', () => {
  it('字符串压缩连续空白并 trim（换行也压成单空格）', () => {
    expect(previewFieldValue('  多行\n文本\t内容  ')).toBe('多行 文本 内容')
  })

  it('字符串超过 max 截断并补省略号', () => {
    expect(previewFieldValue('abcdefghij', 5)).toBe('abcde…')
    // 恰好等于 max 时不截断（省略号只在真的超出时出现）
    expect(previewFieldValue('abcde', 5)).toBe('abcde')
  })

  it('数组用 ` / ` 拼接，最多两项，超出补 ` …`', () => {
    expect(previewFieldValue(['甲', '乙'])).toBe('甲 / 乙')
    expect(previewFieldValue(['甲', '乙', '丙'])).toBe('甲 / 乙 …')
  })

  it('数组里的对象用紧凑 JSON 表示', () => {
    expect(previewFieldValue([{ a: 1 }, { b: 2 }])).toBe('{"a":1} / {"b":2}')
  })

  it('数字/布尔/对象走 JSON.stringify', () => {
    expect(previewFieldValue(42)).toBe('42')
    expect(previewFieldValue(false)).toBe('false')
    expect(previewFieldValue({ a: 1, b: true })).toBe('{"a":1,"b":true}')
  })

  it('对象 JSON 同样受 max 限制', () => {
    expect(previewFieldValue({ name: '一二三四五' }, 6)).toBe('{"name…')
  })

  it('空值统一显示「（空）」', () => {
    expect(previewFieldValue(undefined)).toBe('（空）')
    expect(previewFieldValue(null)).toBe('（空）')
    expect(previewFieldValue('')).toBe('（空）')
    expect(previewFieldValue('   ')).toBe('（空）')
    expect(previewFieldValue([])).toBe('（空）')
    expect(previewFieldValue({})).toBe('（空）')
  })
})

describe('readFieldValue：点路径读取', () => {
  const data = {
    user_personas: { primary: '主角', nested: { role: '剑士' } },
    name: '星海计划',
    num: 1,
    list: [{ id: 'a' }]
  }

  it('读取顶层与嵌套字段', () => {
    expect(readFieldValue(data, 'name')).toBe('星海计划')
    expect(readFieldValue(data, 'user_personas.primary')).toBe('主角')
    expect(readFieldValue(data, 'user_personas.nested.role')).toBe('剑士')
  })

  it('缺失的键返回 undefined', () => {
    expect(readFieldValue(data, 'missing')).toBeUndefined()
    expect(readFieldValue(data, 'user_personas.missing')).toBeUndefined()
  })

  it('中间节点不是普通对象时返回 undefined（数组 / 标量都算断链）', () => {
    expect(readFieldValue(data, 'list.0.id')).toBeUndefined()
    expect(readFieldValue(data, 'num.value')).toBeUndefined()
  })

  it('空路径返回原对象（无路径 = 不取值）', () => {
    expect(readFieldValue(data, '')).toBe(data)
  })
})
