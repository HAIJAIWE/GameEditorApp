import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { exportDataSnapshot } from '../../src/main/data/snapshotExport'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'

/**
 * 数据快照导出（审查件）的行为约束：
 * - JSON 必须**确定性**：同数据两次导出字节一致，且与条目/键的存储顺序无关
 *   （否则 git diff 全是噪声，feature 的意义就没了）；
 * - CSV 是单表宽表：一行一条，列 = 元数据 + data 键并集（排序）；
 * - 原子写：不留 `.tmp`；
 * - 扩展名兜底。
 */

const types: DataTypeDef[] = [
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#fff', formFields: [] },
  { id: 'item', name: '物品', pluralKey: 'items', color: '#000', formFields: [] }
]

const records: ItemRecord[] = [
  {
    id: 'b',
    type: 'role',
    data: { name: 'B', hp: 20 },
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-03T00:00:00.000Z'
  },
  {
    id: 'a',
    type: 'role',
    data: { skills: ['x', 'y'], hp: 10, name: 'A' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    aiGeneratedAt: '2024-01-05T00:00:00.000Z'
  }
]

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mb-snapshot-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('exportDataSnapshot：JSON 确定性', () => {
  it('同数据两次导出字节一致（不含时间戳等易变信息）', () => {
    const first = exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 'a.json') })
    const second = exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 'b.json') })
    const a = readFileSync(first.filePath, 'utf-8')
    const b = readFileSync(second.filePath, 'utf-8')
    expect(a).toBe(b)
    expect(first.bytes).toBe(second.bytes)
  })

  it('与条目顺序无关（按 id 排序输出）', () => {
    const forward = exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 'f.json') })
    const backward = exportDataSnapshot(records.slice().reverse(), types, {
      format: 'json',
      targetPath: join(dir, 'r.json')
    })
    expect(readFileSync(forward.filePath, 'utf-8')).toBe(readFileSync(backward.filePath, 'utf-8'))
    const parsed = JSON.parse(readFileSync(forward.filePath, 'utf-8')) as {
      items: Array<{ id: string }>
      types: Array<{ id: string }>
      counts: { total: number; byType: Record<string, number> }
    }
    expect(parsed.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(parsed.types.map((t) => t.id)).toEqual(['item', 'role'])
    expect(parsed.counts).toEqual({ total: 2, byType: { role: 2 } })
  })

  it('对象键递归排序（键顺序不影响输出）', () => {
    const result = exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 'keys.json') })
    const content = readFileSync(result.filePath, 'utf-8')
    // item a 的 data 键 hp/name/skills 必须按字母序出现
    expect(content.indexOf('"hp": 10')).toBeLessThan(content.indexOf('"name": "A"'))
    expect(content.indexOf('"name": "A"')).toBeLessThan(content.indexOf('"skills": ['))
  })

  it('顶层带 $schema 标记，供下游识别快照格式', () => {
    const result = exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 's.json') })
    const parsed = JSON.parse(readFileSync(result.filePath, 'utf-8')) as { $schema: string }
    expect(parsed.$schema).toBe('mb-data-snapshot/v1')
  })
})

describe('exportDataSnapshot：CSV 单表宽表', () => {
  it('BOM + CRLF，表头为元数据 + 排序后的 data 键并集，一行一条', () => {
    const result = exportDataSnapshot(records, types, { format: 'csv', targetPath: join(dir, 't.csv') })
    expect(result.format).toBe('csv')
    const csv = readFileSync(result.filePath, 'utf-8')
    expect(csv.startsWith('\uFEFF')).toBe(true)

    const lines = csv.slice(1).split('\r\n').filter((line) => line.length > 0)
    expect(lines[0]).toBe('type,id,createdAt,updatedAt,aiGeneratedAt,data.hp,data.name,data.skills')
    expect(lines).toHaveLength(3) // 表头 + 两条
    // 按 id 排序：a 在前
    expect(lines[1].startsWith('role,a,2024-01-01T00:00:00.000Z,2024-01-02T00:00:00.000Z,2024-01-05T00:00:00.000Z,10,A,')).toBe(
      true
    )
    // 数组序列化为 JSON 并被引号包裹转义（RFC4180）
    expect(lines[1].includes('""x""')).toBe(true)
    expect(lines[2].startsWith('role,b,2024-01-02T00:00:00.000Z,2024-01-03T00:00:00.000Z,,20,B,')).toBe(true)
  })

  it('CSV 也返回类型计数（摘要用）', () => {
    const result = exportDataSnapshot(records, types, { format: 'csv', targetPath: join(dir, 'c.csv') })
    expect(result.itemCount).toBe(2)
    expect(result.typeCount).toBe(2)
  })

  it('数据字段与元数据同名（如 type=分类）时不被覆盖，走 data. 前缀列', () => {
    const withType: ItemRecord[] = [
      {
        id: 'x',
        type: 'role',
        data: { type: '法系', name: 'X' },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
    ]
    const result = exportDataSnapshot(withType, types, { format: 'csv', targetPath: join(dir, 'collide.csv') })
    const csv = readFileSync(result.filePath, 'utf-8')
    const lines = csv.slice(1).split('\r\n').filter((line) => line.length > 0)
    expect(lines[0]).toBe('type,id,createdAt,updatedAt,aiGeneratedAt,data.name,data.type')
    // 元数据 type 仍是类型 id；用户的分类「法系」保留在 data.type 列
    expect(lines[1]).toBe('role,x,2024-01-01T00:00:00.000Z,2024-01-01T00:00:00.000Z,,X,法系')
  })
})

describe('exportDataSnapshot：落盘与兜底', () => {
  it('原子写：目录里不残留 .tmp', () => {
    exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 'atomic.json') })
    const leftovers = readdirSync(dir).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('缺扩展名时按格式兜底补 .json / .csv', () => {
    const json = exportDataSnapshot(records, types, { format: 'json', targetPath: join(dir, 'noext') })
    expect(json.filePath.endsWith('.json')).toBe(true)
    expect(existsSync(json.filePath)).toBe(true)

    const csv = exportDataSnapshot(records, types, { format: 'csv', targetPath: join(dir, 'noext2') })
    expect(csv.filePath.endsWith('.csv')).toBe(true)
    expect(existsSync(csv.filePath)).toBe(true)
  })

  it('空库也能导出（JSON 为空数组结构）', () => {
    const result = exportDataSnapshot([], [], { format: 'json', targetPath: join(dir, 'empty.json') })
    const parsed = JSON.parse(readFileSync(result.filePath, 'utf-8')) as {
      items: unknown[]
      types: unknown[]
      counts: { total: number }
    }
    expect(parsed.items).toEqual([])
    expect(parsed.types).toEqual([])
    expect(parsed.counts.total).toBe(0)
    expect(result.itemCount).toBe(0)
  })
})
