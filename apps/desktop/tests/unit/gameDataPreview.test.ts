import { describe, expect, it } from 'vitest'

import { buildGameDataPreview } from '@mobai/shared/domain/ceshu/gameDataPreview'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'

/**
 * 游戏数据预览。
 * 关键口径：按 `pluralKey` 分桶、**空桶不出现**、键序按字典序稳定、2 空格缩进不转义非 ASCII。
 */

const TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#2196F3',
    formFields: [{ name: 'name', label: '角色名称:', type: 'entry', editable: true }]
  },
  {
    id: 'skill',
    name: '技能',
    pluralKey: 'skills',
    color: '#4CAF50',
    formFields: [{ name: 'name', label: '技能名称:', type: 'entry', editable: true }]
  }
]

function record(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data, createdAt: '', updatedAt: '' }
}

describe('游戏数据预览：分桶与文本', () => {
  it('按 pluralKey 分桶；无数据的类型不出现', () => {
    const preview = buildGameDataPreview([record('r1', 'role', { name: '亚瑟' })], TYPES)
    const parsed = JSON.parse(preview.text) as Record<string, unknown>
    expect(Object.keys(parsed)).toEqual(['roles'])
    expect(parsed.roles).toEqual([{ name: '亚瑟' }])
    expect(preview.bucketCount).toBe(1)
    expect(preview.itemCount).toBe(1)
  })

  it('键序按字典序稳定（与输入顺序无关）', () => {
    const a = buildGameDataPreview(
      [record('r1', 'role', { n: 1 }), record('s1', 'skill', { n: 2 })],
      TYPES
    )
    const b = buildGameDataPreview(
      [record('s1', 'skill', { n: 2 }), record('r1', 'role', { n: 1 })],
      TYPES
    )
    expect(Object.keys(JSON.parse(a.text) as object)).toEqual(['roles', 'skills'])
    expect(a.text).toBe(b.text) // 幂等：同数据不同输入顺序 → 同文本
  })

  it('未收录类型回退 type 原文，不丢数据', () => {
    const preview = buildGameDataPreview([record('x1', 'unknown_type', { a: 1 })], TYPES)
    expect(Object.keys(JSON.parse(preview.text) as object)).toEqual(['unknown_type'])
  })

  it('2 空格缩进 + 不转义非 ASCII（对齐 json.dumps(ensure_ascii=False, indent=2)）', () => {
    const preview = buildGameDataPreview([record('r1', 'role', { name: '亚瑟·光刃' })], TYPES)
    expect(preview.text).toContain('"name": "亚瑟·光刃"')
    expect(preview.text).not.toContain('\\u')
    expect(preview.text.split('\n')[1]).toBe('  "roles": [')
  })

  it('空库 → 空对象文本，规模为 0（UI 负责显示空态文案）', () => {
    const preview = buildGameDataPreview([], TYPES)
    expect(JSON.parse(preview.text)).toEqual({})
    expect(preview.bucketCount).toBe(0)
    expect(preview.itemCount).toBe(0)
  })

  it('**不做 50000 字符截断**', () => {
    const big = 'x'.repeat(60_000)
    const preview = buildGameDataPreview([record('r1', 'role', { name: big })], TYPES)
    expect(preview.text).toContain(big) // 全文在，没被砍
    expect(preview.totalChars).toBe(preview.text.length)
  })

  it('totalChars 与实际文本长度一致（UI 显示的规模数字不会骗人）', () => {
    const preview = buildGameDataPreview(
      [record('r1', 'role', { name: '亚瑟' }), record('s1', 'skill', { name: '火球' })],
      TYPES
    )
    expect(preview.totalChars).toBe(preview.text.length)
    expect(preview.bucketCount).toBe(2)
    expect(preview.itemCount).toBe(2)
  })
})
