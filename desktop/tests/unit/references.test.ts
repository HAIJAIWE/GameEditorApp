import { describe, expect, it } from 'vitest'

import { buildReferenceReport, parseReferenceTokens, referenceFieldsOf } from '../../src/shared/util/search'
import { BUILTIN_DATA_TYPES } from '../../src/shared/schema/core'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

function record(type: string, id: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data: { id, ...data }, createdAt: '', updatedAt: '' }
}

const items: ItemRecord[] = [
  record('skill', 'SKILL000', { name: '火球术' }),
  record('skill', 'SKILL001', { name: '冰霜箭' }),
  record('role', 'ROLE001', { name: '艾尔文', skills: ['SKILL000'], job: '战士', race: '人类' }),
  record('role', 'ROLE002', { name: '希尔瓦', skills: 'SKILL000、SKILL001', job: '战士', race: '精灵' }),
  record('monster', 'MON001', { name: '史莱姆', buffs: [{ id: 'SKILL001' }] }),
  record('dialog', 'DLG001', { name: '开场对话' }),
  record('story', 'STORY1', { name: '序章', dialog_ids: 'DLG001' })
]

describe('引用 token 解析', () => {
  it('字符串按 、，,; 分隔并清理空白', () => {
    expect(parseReferenceTokens('S1、S2, S3;S4，S5')).toEqual(['S1', 'S2', 'S3', 'S4', 'S5'])
    expect(parseReferenceTokens('   ')).toEqual([])
  })

  it('数组逐元素取（对象取 id）；对象取 id；其余类型返回空', () => {
    expect(parseReferenceTokens(['S1', { id: 'S2' }, null, 5])).toEqual(['S1', 'S2'])
    expect(parseReferenceTokens({ id: 'S3' })).toEqual(['S3'])
    expect(parseReferenceTokens(123)).toEqual([])
    expect(parseReferenceTokens(null)).toEqual([])
  })
})

describe('引用字段来源（schema refType + 文本引用补充表）', () => {
  it('角色收录 refType 字段；剧情/任务/对话收录文本引用字段；未知类型为空', () => {
    expect(referenceFieldsOf(BUILTIN_DATA_TYPES, 'role').map((field) => field.field)).toEqual([
      'skills',
      'talents',
      'buffs'
    ])
    expect(referenceFieldsOf(BUILTIN_DATA_TYPES, 'story').map((field) => field.field)).toEqual([
      'dialog_ids',
      'prev_story',
      'next_story'
    ])
    expect(referenceFieldsOf(BUILTIN_DATA_TYPES, 'task').map((field) => field.field)).toEqual(['dialog_id'])
    expect(referenceFieldsOf(BUILTIN_DATA_TYPES, 'unknown_type')).toEqual([])
  })

  it('引用字段带 refType 标记（仅供来源展示），补充表字段 refType 为空', () => {
    const role = referenceFieldsOf(BUILTIN_DATA_TYPES, 'role')
    expect(role[0]).toEqual({ field: 'skills', refType: 'skills' })
    const story = referenceFieldsOf(BUILTIN_DATA_TYPES, 'story')
    expect(story[0]).toEqual({ field: 'dialog_ids', refType: null })
  })
})

describe('引用报告（引用了谁 / 被谁引用 / 相似数据）', () => {
  it('引用了谁：数组/对象数组/分隔文本均解析；悬空 token 标记未解析', () => {
    expect(buildReferenceReport(BUILTIN_DATA_TYPES, items, { id: 'ROLE002', type: 'role' }).references).toEqual([
      {
        field: 'skills',
        raw: 'SKILL000',
        resolved: true,
        targetId: 'SKILL000',
        targetType: 'skill',
        targetName: '火球术'
      },
      {
        field: 'skills',
        raw: 'SKILL001',
        resolved: true,
        targetId: 'SKILL001',
        targetType: 'skill',
        targetName: '冰霜箭'
      }
    ])

    expect(
      buildReferenceReport(BUILTIN_DATA_TYPES, items, { id: 'MON001', type: 'monster' }).references[0]
    ).toMatchObject({ field: 'buffs', raw: 'SKILL001', targetName: '冰霜箭' })

    const withDangling = [...items, record('role', 'ROLE003', { name: '游侠', skills: ['NOPE'] })]
    expect(buildReferenceReport(BUILTIN_DATA_TYPES, withDangling, { id: 'ROLE003', type: 'role' }).references[0]).toMatchObject({
      raw: 'NOPE',
      resolved: false,
      targetType: null,
      targetName: null
    })
  })

  it('被谁引用：全库跨类型扫描（含文本引用字段）', () => {
    expect(buildReferenceReport(BUILTIN_DATA_TYPES, items, { id: 'SKILL000', type: 'skill' }).referencedBy).toEqual([
      { type: 'role', itemId: 'ROLE001', itemName: '艾尔文', field: 'skills', raw: 'SKILL000' },
      { type: 'role', itemId: 'ROLE002', itemName: '希尔瓦', field: 'skills', raw: 'SKILL000' }
    ])
    expect(buildReferenceReport(BUILTIN_DATA_TYPES, items, { id: 'DLG001', type: 'dialog' }).referencedBy).toEqual([
      { type: 'story', itemId: 'STORY1', itemName: '序章', field: 'dialog_ids', raw: 'DLG001' }
    ])
  })

  it('相似数据：仅同类型、共有非空字段 ≥2、按相似度降序', () => {
    const report = buildReferenceReport(BUILTIN_DATA_TYPES, items, { id: 'ROLE001', type: 'role' })
    expect(report.similar).toHaveLength(1)
    // 共有 name/skills/job/race 四个字段，并集同为 4 → 100%
    expect(report.similar[0]).toEqual({
      itemId: 'ROLE002',
      itemName: '希尔瓦',
      similarity: 100,
      commonFields: ['name', 'skills', 'job', 'race']
    })
  })

  it('目标不存在时返回空报告（不抛错）；共有字段不足 2 的不进入相似列表', () => {
    const missing = buildReferenceReport(BUILTIN_DATA_TYPES, items, { id: 'NOT_EXIST', type: 'role' })
    expect(missing).toEqual({ references: [], referencedBy: [], similar: [] })

    const weak: DataTypeDef[] = BUILTIN_DATA_TYPES
    const pair = [record('skill', 'A', { name: 'A', value: 1 }), record('skill', 'B', { name: 'B' })]
    expect(buildReferenceReport(weak, pair, { id: 'A', type: 'skill' }).similar).toEqual([])
  })
})