import { describe, expect, it } from 'vitest'

import { buildImportPreview, IMPORT_PREVIEW_LIMIT, ImportSessionStore } from '../../src/main/data/importSession'
import type { ImportRecord } from '../../src/main/data/service'
import type { ItemRecord } from '../../src/shared/types'

/**
 * 导入预览：算出「这次会新增多少、改哪些字段」。
 *
 * 这是导入前的最后一道闸——导入是不可撤销的批量写，算错了就等于骗用户点确认。
 */

function existing(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return {
    id: `rec-${id}`,
    type,
    data: { id, ...data },
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z'
  }
}

function incoming(type: string, data: Record<string, unknown>): ImportRecord {
  return { type, id: `uuid-${Math.random()}`, data }
}

const META = { kind: 'excel' as const, filePath: '/tmp/a.xlsx', skipped: 0, unknownTypes: {}, missingIdSources: [] }

describe('buildImportPreview：分类', () => {
  it('区分 新增 / 修改 / 未变', () => {
    const existingItems = [existing('0', 'equip', { name: '铁剑', value: 10 }), existing('1', 'equip', { name: '钢剑', value: 20 })]
    const rows = [
      incoming('equip', { id: '0', name: '铁剑', value: 35 }), // 改
      incoming('equip', { id: '1', name: '钢剑', value: 20 }), // 未变
      incoming('equip', { id: '2', name: '秘银剑', value: 60 }) // 新增
    ]

    const preview = buildImportPreview(rows, existingItems, META)
    expect(preview.createCount).toBe(1)
    expect(preview.updateCount).toBe(1)
    expect(preview.unchangedCount).toBe(1)
    expect(preview.byType['equip']).toEqual({ create: 1, update: 1, unchanged: 1 })
  })

  it('修改项带字段级 前→后，且不含 id 自身', () => {
    const existingItems = [existing('0', 'equip', { name: '铁剑', value: 10, desc: '旧' })]
    const rows = [incoming('equip', { id: '0', name: '铁剑', value: 35, desc: '旧' })]

    const preview = buildImportPreview(rows, existingItems, META)
    const record = preview.records.find((item) => item.kind === 'update')
    expect(record?.changes).toEqual([{ key: 'value', before: 10, after: 35 }])
  })

  it('对象/数组字段按 JSON 比对（不是引用比较）', () => {
    const existingItems = [existing('0', 'equip', { tags: ['火', '攻击'] })]
    const rows = [incoming('equip', { id: '0', tags: ['火', '攻击'] })]

    expect(buildImportPreview(rows, existingItems, META).unchangedCount).toBe(1)
  })

  it('文件里新增的字段也算变更（before 为 undefined）', () => {
    const existingItems = [existing('0', 'equip', { name: '铁剑' })]
    const rows = [incoming('equip', { id: '0', name: '铁剑', crit: 5 })]

    const change = buildImportPreview(rows, existingItems, META).records[0]?.changes[0]
    expect(change).toEqual({ key: 'crit', before: undefined, after: 5 })
  })

  it('没有业务 id 的行一律算新增（哪怕名字重复）', () => {
    const existingItems = [existing('0', 'equip', { name: '铁剑' })]
    const rows = [incoming('equip', { name: '铁剑' })]

    const preview = buildImportPreview(rows, existingItems, META)
    expect(preview.createCount).toBe(1)
    expect(preview.updateCount).toBe(0)
  })

  it('类型不同但业务 id 相同不算命中（upsert 键是 类型+id）', () => {
    const existingItems = [existing('0', 'equip', { name: '铁剑' })]
    const rows = [incoming('item', { id: '0', name: '铁剑' })]

    expect(buildImportPreview(rows, existingItems, META).createCount).toBe(1)
  })
})

describe('buildImportPreview：明细与截断', () => {
  it('明细超过上限时截断并标记', () => {
    const rows = Array.from({ length: IMPORT_PREVIEW_LIMIT + 20 }, (_, i) => incoming('equip', { id: `n${i}`, name: `剑${i}` }))
    const preview = buildImportPreview(rows, [], META)

    expect(preview.createCount).toBe(IMPORT_PREVIEW_LIMIT + 20)
    expect(preview.records).toHaveLength(IMPORT_PREVIEW_LIMIT)
    expect(preview.truncated).toBe(true)
  })

  it('透传文件级信息：总行数/跳过/未收录类型/缺 id 列', () => {
    const preview = buildImportPreview([incoming('equip', { id: '0' })], [], {
      ...META,
      skipped: 3,
      unknownTypes: { potions: 2 },
      missingIdSources: ['工作表「装备」']
    })
    expect(preview.totalRows).toBe(4)
    expect(preview.skipped).toBe(3)
    expect(preview.unknownTypes).toEqual({ potions: 2 })
    expect(preview.missingIdSources).toEqual(['工作表「装备」'])
  })
})

describe('ImportSessionStore', () => {
  const parsed = { records: [], skipped: 0, unknownTypes: {}, missingIdSources: [] }

  it('put 拿到的 id 能 take 回来，且只能消费一次', () => {
    const store = new ImportSessionStore()
    const id = store.put('excel', '/tmp/a.xlsx', parsed)

    expect(store.take(id)?.filePath).toBe('/tmp/a.xlsx')
    // 二次消费必须是 undefined：否则连点两次「确认导入」会写两遍
    expect(store.take(id)).toBeUndefined()
  })

  it('drop 之后取不到（用户取消）', () => {
    const store = new ImportSessionStore()
    const id = store.put('csv', '/tmp/a.csv', parsed)
    store.drop(id)
    expect(store.take(id)).toBeUndefined()
  })

  it('会话数超上限时挤掉最旧的', () => {
    const store = new ImportSessionStore()
    const ids = Array.from({ length: 6 }, (_, i) => store.put('excel', `/tmp/${i}.xlsx`, parsed))
    expect(store.take(ids[0]!)).toBeUndefined()
    expect(store.take(ids[5]!)).toBeDefined()
  })
})
