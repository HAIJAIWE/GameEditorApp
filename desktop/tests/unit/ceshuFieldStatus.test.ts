import { describe, expect, it } from 'vitest'

import {
  FIELD_STATUS_KEY,
  fieldStatusOf,
  getFieldStatus,
  pendingFieldKeys,
  readFieldStatus,
  setFieldStatuses
} from '../../src/shared/ceshu/ceshuFieldStatus'

describe('ceshuFieldStatus：字段级审核状态', () => {
  it('空 meta → 空表', () => {
    expect(readFieldStatus({})).toEqual({})
    expect(fieldStatusOf({}, 'meta')).toEqual({})
    expect(getFieldStatus({}, 'meta', 'game_name')).toBeNull()
  })

  it('写入后能读回，且保留其它章节 / 字段', () => {
    let meta: Record<string, unknown> = {}
    meta = setFieldStatuses(meta, 'meta', { game_name: 'approved' }, '2024-01-01')
    meta = setFieldStatuses(meta, 'vision', { design_vision: 'ai_draft' }, '2024-01-02')
    meta = setFieldStatuses(meta, 'meta', { positioning: 'human_edited' }, '2024-01-03')
    expect(getFieldStatus(meta, 'meta', 'game_name')).toBe('approved')
    expect(getFieldStatus(meta, 'meta', 'positioning')).toBe('human_edited')
    expect(getFieldStatus(meta, 'vision', 'design_vision')).toBe('ai_draft')
  })

  it('空 updates 返回原对象（调用方可跳过写盘）', () => {
    const meta = { [FIELD_STATUS_KEY]: { meta: { a: { status: 'approved', at: 'x' } } } }
    expect(setFieldStatuses(meta, 'meta', {}, 'y')).toBe(meta)
  })

  it('pendingFieldKeys 只返回 ai_draft（按传入顺序）', () => {
    let meta: Record<string, unknown> = {}
    meta = setFieldStatuses(meta, 'meta', { a: 'ai_draft', b: 'approved', c: 'human_edited' }, 't')
    expect(pendingFieldKeys(meta, 'meta', ['a', 'b', 'c'])).toEqual(['a'])
  })

  it('脏数据当空表（不抛）', () => {
    expect(readFieldStatus({ [FIELD_STATUS_KEY]: 'oops' })).toEqual({})
    expect(readFieldStatus({ [FIELD_STATUS_KEY]: { meta: { a: { status: 'bad', at: 1 } } } })).toEqual({})
  })
})
