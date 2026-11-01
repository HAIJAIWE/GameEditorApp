import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildLegacyPayload, exportLegacyDataFile } from '../../src/main/data/legacyExport'
import { importLegacyDataFile } from '../../src/main/data/legacyImport'
import { BUILTIN_DATA_TYPES } from '@mobai/shared/schema/adapters'
import type { ItemsRepository } from '../../src/main/data/repository'
import { DataService } from '../../src/main/data/service'
import type { ItemRecord } from '@mobai/shared/types'

class InMemoryItemsRepository implements ItemsRepository {
  private readonly rows = new Map<string, ItemRecord>()

  listItems(type: string): ItemRecord[] {
    return [...this.rows.values()].filter((row) => row.type === type)
  }

  findItem(id: string): ItemRecord | undefined {
    return this.rows.get(id)
  }

  listAllItems(): ItemRecord[] {
    return [...this.rows.values()]
  }

  insertItem(record: ItemRecord): void {
    this.rows.set(record.id, record)
  }

  upsertItem(record: ItemRecord): void {
    const previous = this.rows.get(record.id)
    this.rows.set(record.id, previous ? { ...record, createdAt: previous.createdAt } : record)
  }

  exists(id: string): boolean {
    return this.rows.has(id)
  }

  deleteItem(id: string): boolean {
    return this.rows.delete(id)
  }

  close(): void {
    this.rows.clear()
  }
}

function writeFixture(name: string, content: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'mb-export-'))
  const filePath = join(dir, name)
  writeFileSync(filePath, JSON.stringify(content), 'utf-8')
  return filePath
}

describe('旧版 JSON 导出（W2）', () => {
  it('buildLegacyPayload：12 类型按 schema 顺序输出（空数组保留），未收录键排序追加', () => {
    const records: ItemRecord[] = [
      { id: 'S1', type: 'skill', data: { id: 'S1', name: '火球术' }, createdAt: '', updatedAt: '' },
      { id: 'X1', type: 'players', data: { id: 'X1' }, createdAt: '', updatedAt: '' }
    ]
    const payload = buildLegacyPayload(records, BUILTIN_DATA_TYPES)

    expect(Object.keys(payload).slice(0, 12)).toEqual([
      'roles',
      'jobs',
      'monsters',
      'equips',
      'skills',
      'talents',
      'items',
      'achievements',
      'buffs',
      'stories',
      'tasks',
      'dialogs'
    ])
    expect(payload['skills']).toHaveLength(1)
    expect(payload['roles']).toEqual([])
    expect(payload['players']).toHaveLength(1)
    expect(Object.keys(payload).at(-1)).toBe('players')
  })

  it('往返一致性：导入 → 导出 → 再导入，数据与条数一致', async () => {
    const source = writeFixture('source.json', {
      skills: [{ id: 'SKILL000', name: '技能名称' }],
      roles: [{ id: 'ROLE001', name: '艾尔文', skills: ['SKILL001'] }]
    })
    const serviceA = new DataService(new InMemoryItemsRepository())
    await importLegacyDataFile(source, serviceA, BUILTIN_DATA_TYPES)

    const exportPath = join(mkdtempSync(join(tmpdir(), 'mb-export-out-')), 'exported.json')
    const summary = await exportLegacyDataFile(exportPath, serviceA, BUILTIN_DATA_TYPES)
    expect(summary.totalItems).toBe(2)
    expect(summary.byType).toEqual({ skill: 1, role: 1 })

    const exportedRaw = JSON.parse(readFileSync(exportPath, 'utf-8')) as Record<string, unknown[]>
    expect(exportedRaw['skills']).toHaveLength(1)
    expect(exportedRaw['skills']?.[0]).toEqual({ id: 'SKILL000', name: '技能名称' })
    expect((exportedRaw['roles']?.[0] as { skills: string[] }).skills).toEqual(['SKILL001'])

    const serviceB = new DataService(new InMemoryItemsRepository())
    const roundTrip = await importLegacyDataFile(exportPath, serviceB, BUILTIN_DATA_TYPES)
    expect(roundTrip.imported).toBe(2)
    expect(serviceB.listItems('skill')[0]?.data).toEqual({ id: 'SKILL000', name: '技能名称' })
  })
})