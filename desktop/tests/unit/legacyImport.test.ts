import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { importLegacyDataFile, parseLegacyData } from '../../src/main/data/legacyImport'
import type { ItemsRepository } from '../../src/main/data/repository'
import { DataService } from '../../src/main/data/service'
import { BUILTIN_DATA_TYPES } from '../../src/shared/schema/adapters'
import type { ItemRecord } from '../../src/shared/types'

/** 与 DataService 单测同构的内存仓储（此处独立声明，避免测试间共享状态） */
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
  const dir = mkdtempSync(join(tmpdir(), 'mb-import-'))
  const filePath = join(dir, name)
  writeFileSync(filePath, JSON.stringify(content), 'utf-8')
  return filePath
}

describe('旧版 JSON 导入', () => {
  it('解析：复数键映射、_base_type 剥离、缺 id 补全、未知键上报、非数组值忽略', () => {
    const parsed = parseLegacyData(
      {
        roles: [{ id: 'ROLE001', name: '艾尔文', _base_type: 'role' }, { name: '无 ID 角色' }],
        skills: [{ id: 'SKILL000', name: '技能A' }],
        unknown_type: [{ id: 'X1' }],
        not_an_array: 42
      },
      BUILTIN_DATA_TYPES
    )

    expect(parsed.records).toHaveLength(4)
    expect(parsed.skipped).toBe(0)
    expect(parsed.unknownTypes).toEqual({ unknown_type: 1 })

    const role = parsed.records[0]
    expect(role?.type).toBe('role')
    expect(role?.data['_base_type']).toBeUndefined()

    const noId = parsed.records[1]
    expect(typeof noId?.id).toBe('string')
    expect(noId?.id.length).toBeGreaterThan(8)
    expect(noId?.id).toBe(noId?.data['id'])
  })

  it('解析：非对象条目计入 skipped，顶层非对象抛错', () => {
    const parsed = parseLegacyData({ roles: [1, 'x', null, { id: 'R1' }] }, BUILTIN_DATA_TYPES)
    expect(parsed.skipped).toBe(3)
    expect(parsed.records).toHaveLength(1)

    expect(() => parseLegacyData([], BUILTIN_DATA_TYPES)).toThrow()
    expect(() => parseLegacyData('nope', BUILTIN_DATA_TYPES)).toThrow()
    expect(() => parseLegacyData(null, BUILTIN_DATA_TYPES)).toThrow()
  })

  it('解析：数值型 id转字符串保留，不补 UUID', () => {
    const parsed = parseLegacyData(
      { roles: [{ id: 0, name: '零号' }, { id: 12, name: '十二号' }] },
      BUILTIN_DATA_TYPES
    )
    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0]?.id).toBe('0')
    expect(parsed.records[0]?.data['id']).toBe('0')
    expect(parsed.records[1]?.id).toBe('12')
  })

  it('导入文件：汇总统计正确，重复导入幂等（全为更新）', async () => {
    const filePath = writeFixture('default.json', {
      skills: [
        { id: 'SKILL000', name: '技能名称@#$%^&*()', desc: '描述包含中文、English和特殊符号!@#$' },
        { id: 'SKILL001', name: '烈焰风暴' }
      ],
      roles: [{ id: 'ROLE001', name: '艾尔文·剑圣' }]
    })
    const service = new DataService(new InMemoryItemsRepository())

    const first = await importLegacyDataFile(filePath, service, BUILTIN_DATA_TYPES)
    expect(first.totalItems).toBe(3)
    expect(first.imported).toBe(3)
    expect(first.updated).toBe(0)
    expect(first.skipped).toBe(0)
    expect(first.byType).toEqual({ skill: 2, role: 1 })

    const second = await importLegacyDataFile(filePath, service, BUILTIN_DATA_TYPES)
    expect(second.imported).toBe(0)
    expect(second.updated).toBe(3)

    expect(service.listItems('skill')).toHaveLength(2)
    expect(service.listItems('role')).toHaveLength(1)
    expect(service.listItems('skill')[0]?.data['name']).toBeTruthy()
  })

  it('文件不可读时报错信息可读', async () => {
    const service = new DataService(new InMemoryItemsRepository())
    await expect(importLegacyDataFile('Z:\\not-exists\\nope.json', service, BUILTIN_DATA_TYPES)).rejects.toThrow(
      '读取旧数据文件失败'
    )
  })

  // 真实存量文件存在时（仓库内开发环境）额外验证一次解析结果；data/ 被 gitignore，CI 上自动跳过
  const realFile = resolve(process.cwd(), '../data/libraries/初始库/default.json')
  it.skipIf(!existsSync(realFile))('真实存量文件解析（存在时）：非空条目全量映射', () => {
    const parsed = parseLegacyData(JSON.parse(readFileSync(realFile, 'utf-8')), BUILTIN_DATA_TYPES)
    expect(parsed.skipped).toBe(0)
    expect(parsed.records.length).toBeGreaterThan(0)
    // 初始库当前仅含 1 条技能数据
    const skills = parsed.records.filter((r) => r.type === 'skill')
    expect(skills).toHaveLength(1)
    expect(skills[0]?.id).toBe('SKILL000')
    expect(typeof skills[0]?.data['desc']).toBe('string')
  })
})