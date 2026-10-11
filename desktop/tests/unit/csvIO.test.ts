import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildCsvText,
  collectHeaders,
  decodeCsvCell,
  exportCsvFiles,
  importCsvFile,
  parseCsvText,
  rowsToImportRecords,
  serializeCsvCell
} from '../../src/main/data/csvIO'
import { DataService } from '../../src/main/data/service'
import { SqliteItemsRepository } from '../../src/main/data/sqliteRepo'
import type { DataTypeDef, ItemRecord, TypeFieldDef } from '../../src/shared/types'

/**
 * CSV 导入/导出验证：纯函数逐条覆盖 + 「真实 SQLite + 真文件系统」往返。
 * 为什么不 mock：往返是有损风险最高的路径——只有真实写文件、真解析回来、真 upsert 入库，
 * 才能证明「导出的 CSV 能被自己无损读回」。
 */

const TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#888888',
    // 数字类字段：用于验证 CSV 往返的类型还原（见文件尾「数字字段保型」用例）
    formFields: [{ name: 'hp', label: '生命', type: 'spinbox', editable: true }]
  },
  { id: 'skill', name: '技能', pluralKey: 'skills', color: '#888888', formFields: [] }
]

function rec(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }
}

const cleanups: Array<() => void> = []

function makeService(): { root: string; service: DataService } {
  const root = mkdtempSync(join(tmpdir(), 'mb-csvio-'))
  const service = new DataService(new SqliteItemsRepository(join(root, 'mb-editor.db')))
  cleanups.push(() => {
    service.dispose()
    rmSync(root, { recursive: true, force: true })
  })
  return { root, service }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('serializeCsvCell', () => {
  it('null / undefined → 空字符串', () => {
    expect(serializeCsvCell(null)).toBe('')
    expect(serializeCsvCell(undefined)).toBe('')
  })

  it('数字与布尔 → String 形式', () => {
    expect(serializeCsvCell(42)).toBe('42')
    expect(serializeCsvCell(0)).toBe('0')
    expect(serializeCsvCell(true)).toBe('true')
    expect(serializeCsvCell(false)).toBe('false')
  })

  it('字符串原样返回', () => {
    expect(serializeCsvCell('战士')).toBe('战士')
    expect(serializeCsvCell('a,b')).toBe('a,b')
  })

  it('数组 → 真 JSON 字符串（不是 Python 式单引号伪 JSON）', () => {
    expect(serializeCsvCell(['a', 'b'])).toBe('["a","b"]')
    expect(serializeCsvCell([])).toBe('[]')
  })

  it('普通对象 → JSON 字符串', () => {
    expect(serializeCsvCell({ atk: 10, def: 5 })).toBe('{"atk":10,"def":5}')
  })

  it('嵌套对象也能序列化为 JSON', () => {
    expect(serializeCsvCell({ a: { b: [1, 2] } })).toBe('{"a":{"b":[1,2]}}')
  })
})

describe('collectHeaders', () => {
  it('单条目按键顺序返回', () => {
    expect(collectHeaders([rec('1', 'role', { id: '1', name: '战士', hp: 100 })])).toEqual(['id', 'name', 'hp'])
  })

  it('异质条目取并集且保持首次出现顺序', () => {
    const headers = collectHeaders([
      rec('1', 'role', { id: '1', name: '战士' }),
      rec('2', 'role', { id: '2', job: '法师', name: '法师' })
    ])
    expect(headers).toEqual(['id', 'name', 'job'])
  })

  it('空列表 → 空数组', () => {
    expect(collectHeaders([])).toEqual([])
  })
})

describe('buildCsvText', () => {
  it('输出表头行 + 数据行，使用 CRLF 分隔并以 CRLF 收尾', () => {
    const text = buildCsvText([rec('1', 'role', { id: '1', name: '战士' })])
    expect(text).toBe('id,name\r\n1,战士\r\n')
  })

  it('缺失字段以空串占位（按并集表头）', () => {
    const text = buildCsvText([
      rec('1', 'role', { id: '1', name: '战士' }),
      rec('2', 'role', { id: '2', name: '法师', hp: 50 })
    ])
    expect(text).toBe('id,name,hp\r\n1,战士,\r\n2,法师,50\r\n')
  })

  it('含逗号 / 引号 / 换行的字段被引号包裹并转义', () => {
    const text = buildCsvText([
      rec('1', 'role', { id: '1', name: 'a,b', note: 'line1\nline2', quote: 'say "hi"' })
    ])
    expect(text).toBe('id,name,note,quote\r\n1,"a,b","line1\nline2","say ""hi"""\r\n')
  })

  it('数组字段序列化为 JSON 并按需转义', () => {
    const text = buildCsvText([rec('1', 'role', { id: '1', tags: ['a', 'b'] })])
    expect(text).toBe('id,tags\r\n1,"[""a"",""b""]"\r\n')
  })

  it('空 records → 空字符串（不产文件）', () => {
    expect(buildCsvText([])).toBe('')
  })
})

describe('parseCsvText', () => {
  it('基本多行解析', () => {
    expect(parseCsvText('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('引号内的逗号不分割字段', () => {
    expect(parseCsvText('a,b\r\n"x,y",2\r\n')).toEqual([
      ['a', 'b'],
      ['x,y', '2']
    ])
  })

  it('引号内的换行属于同一字段', () => {
    expect(parseCsvText('a,b\r\n"x\ny",2\r\n')).toEqual([
      ['a', 'b'],
      ['x\ny', '2']
    ])
  })

  it('"" 转义还原为单个双引号', () => {
    expect(parseCsvText('a\r\n"say ""hi"""\r\n')).toEqual([['a'], ['say "hi"']])
  })

  it('CRLF 与 LF 混用结果一致', () => {
    const lf = parseCsvText('a,b\n1,2\n')
    const crlf = parseCsvText('a,b\r\n1,2\r\n')
    expect(lf).toEqual(crlf)
  })

  it('忽略末尾空行', () => {
    expect(parseCsvText('a,b\r\n1,2\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('保留中间空行', () => {
    expect(parseCsvText('a\r\n\r\nb\r\n')).toEqual([['a'], [''], ['b']])
  })

  it('空文本 → []', () => {
    expect(parseCsvText('')).toEqual([])
  })
})

describe('decodeCsvCell', () => {
  it('以 [ 开头 → 解析 JSON 数组', () => {
    expect(decodeCsvCell('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('以 { 开头 → 解析 JSON 对象', () => {
    expect(decodeCsvCell('{"a":1}')).toEqual({ a: 1 })
  })

  it('非法 JSON 原样返回', () => {
    expect(decodeCsvCell('{bad json')).toBe('{bad json')
    expect(decodeCsvCell('[unclosed')).toBe('[unclosed')
  })

  it('普通字符串（含数字）原样返回字符串', () => {
    expect(decodeCsvCell('hello')).toBe('hello')
    expect(decodeCsvCell('123')).toBe('123')
  })
})

describe('rowsToImportRecords', () => {
  it('保留既有的非空 id', () => {
    const { records } = rowsToImportRecords(
      [
        ['id', 'name'],
        ['r1', '战士']
      ],
      'role'
    )
    expect(records).toEqual([{ type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } }])
  })

  it('缺 id 时生成 UUID 并写回 data.id', () => {
    const { records } = rowsToImportRecords([['name'], ['无名']], 'role')
    expect(records).toHaveLength(1)
    const record = records[0]
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(record.data['id']).toBe(record.id)
  })

  it('整行全空被跳过并计入 skipped', () => {
    const { records, skipped } = rowsToImportRecords(
      [
        ['id', 'name'],
        ['r1', '战士'],
        ['', '']
      ],
      'role'
    )
    expect(records).toHaveLength(1)
    expect(skipped).toBe(1)
  })

  it('空表头列与越界列被跳过', () => {
    const { records } = rowsToImportRecords(
      [
        ['id', '', 'name'],
        ['r1', 'x', '战士']
      ],
      'role'
    )
    expect(records[0].data).toEqual({ id: 'r1', name: '战士' })
  })

  it('复杂 JSON 列被还原为对象/数组', () => {
    const { records } = rowsToImportRecords(
      [
        ['id', 'tags', 'attrs'],
        ['r1', '["火","冰"]', '{"atk":9}']
      ],
      'role'
    )
    expect(records[0].data['tags']).toEqual(['火', '冰'])
    expect(records[0].data['attrs']).toEqual({ atk: 9 })
  })

  it('数字类字段（spinbox/double_spin）按 schema 还原为 number，其余字段保持字符串', () => {
    const fields: TypeFieldDef[] = [
      { name: 'hp', label: '生命', type: 'spinbox', editable: true },
      { name: 'rate', label: '系数', type: 'double_spin', editable: true }
    ]
    const { records } = rowsToImportRecords(
      [
        ['id', 'hp', 'rate', 'desc'],
        ['r1', '100', '1.5', '说明文字']
      ],
      'role',
      fields
    )
    expect(records[0].data['hp']).toBe(100)
    expect(records[0].data['rate']).toBe(1.5)
    expect(records[0].data['desc']).toBe('说明文字')
  })

  it('数字类字段值非法/为空时保持原字符串（不产 NaN、不丢数据）', () => {
    const fields: TypeFieldDef[] = [{ name: 'hp', label: '生命', type: 'spinbox', editable: true }]
    const bad = rowsToImportRecords([['id', 'hp'], ['r1', '很多']], 'role', fields)
    expect(bad.records[0].data['hp']).toBe('很多')
    const blank = rowsToImportRecords([['id', 'hp'], ['r2', '']], 'role', fields)
    expect(blank.records[0].data['hp']).toBe('')
  })

  it('未提供 schema 字段（未知类型文件）→ 一律保持字符串（无从判断类型）', () => {
    const { records } = rowsToImportRecords([['id', 'hp'], ['r1', '100']], 'role')
    expect(records[0].data['hp']).toBe('100')
  })

  it('空行列表 → 无记录', () => {
    const { records, skipped } = rowsToImportRecords([], 'role')
    expect(records).toEqual([])
    expect(skipped).toBe(0)
  })
})

describe('exportCsvFiles + importCsvFile 真实往返', () => {
  it('导出两类型：文件名用复数键、带 BOM、表头正确、汇总数字正确', async () => {
    const { root, service } = makeService()
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士', tags: ['a', 'b'] } },
      { type: 'skill', id: 's1', data: { id: 's1', name: '火球', cd: 3 } }
    ])

    const summary = await exportCsvFiles(root, service, TYPES)

    const csvFiles = readdirSync(root)
      .filter((name) => name.endsWith('.csv'))
      .sort()
    expect(csvFiles).toEqual(['roles.csv', 'skills.csv'])
    // 无残留 .tmp（原子写成功）
    expect(readdirSync(root).some((name) => name.endsWith('.tmp'))).toBe(false)

    const roles = readFileSync(join(root, 'roles.csv'), 'utf-8')
    expect(roles.startsWith('\uFEFF')).toBe(true)
    expect(roles.slice(1).split('\r\n')[0]).toBe('id,name,tags')

    expect(summary.dir).toBe(root)
    expect(summary.files).toHaveLength(2)
    expect(summary.totalItems).toBe(2)
    expect(summary.byType).toEqual({ role: 1, skill: 1 })
  })

  it('无数据的类型不产出文件', async () => {
    const { root, service } = makeService()
    await service.importRecords([{ type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } }])

    await exportCsvFiles(root, service, TYPES)
    const csvFiles = readdirSync(root).filter((name) => name.endsWith('.csv'))
    expect(csvFiles).toEqual(['roles.csv'])
  })

  it('改内容后导入 → 同 id 更新 + 新行插入，汇总数字正确', async () => {
    const { root, service } = makeService()
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } },
      { type: 'role', id: 'r2', data: { id: 'r2', name: '法师' } }
    ])
    await exportCsvFiles(root, service, TYPES)

    const filePath = join(root, 'roles.csv')
    writeFileSync(filePath, '\uFEFFid,name\r\nr1,战士改\r\nr3,弓手\r\n', 'utf-8')

    const summary = await importCsvFile(filePath, service, TYPES)
    expect(summary.filePath).toBe(filePath)
    expect(summary.totalItems).toBe(2)
    expect(summary.imported).toBe(1) // r3 新插入
    expect(summary.updated).toBe(1) // r1 已存在
    expect(summary.skipped).toBe(0)
    expect(summary.byType).toEqual({ role: 2 })
    expect(summary.unknownTypes).toEqual({})

    const items = service.listAllItems()
    expect(items.find((item) => item.id === 'r1')?.data['name']).toBe('战士改')
    expect(items.find((item) => item.id === 'r2')?.data['name']).toBe('法师')
    expect(items.some((item) => item.id === 'r3')).toBe(true)
  })

  it('复数键文件名 roles.csv 能解析到单数类型 role', async () => {
    const { root, service } = makeService()
    const filePath = join(root, 'roles.csv')
    writeFileSync(filePath, 'id,name\r\nr9,圣骑士\r\n', 'utf-8')

    const summary = await importCsvFile(filePath, service, TYPES)
    expect(summary.byType).toEqual({ role: 1 })
    expect(summary.unknownTypes).toEqual({})
    const stored = service.listAllItems()
    expect(stored[0].type).toBe('role')
    expect(stored[0].data['name']).toBe('圣骑士')
  })

  it('未知文件名落到 unknownTypes 且数据仍入库（type 用原键名）', async () => {
    const { root, service } = makeService()
    const filePath = join(root, 'potions.csv')
    writeFileSync(filePath, 'id,name\r\np1,红药\r\np2,蓝药\r\n', 'utf-8')

    const summary = await importCsvFile(filePath, service, TYPES)
    expect(summary.unknownTypes).toEqual({ potions: 2 })
    expect(summary.byType).toEqual({ potions: 2 })
    expect(summary.imported).toBe(2)

    const stored = service.listAllItems()
    expect(stored).toHaveLength(2)
    expect(stored.every((item) => item.type === 'potions')).toBe(true)
  })

  it('带 BOM 的 CSV 导入后首列表头不含 U+FEFF', async () => {
    const { root, service } = makeService()
    const filePath = join(root, 'roles.csv')
    writeFileSync(filePath, '\uFEFFid,name\r\nr1,战士\r\n', 'utf-8')

    await importCsvFile(filePath, service, TYPES)
    const record = service.listAllItems()[0]
    expect(Object.keys(record.data)).toContain('id')
    expect(record.data['id']).toBe('r1')
    // 首列表头键名不应带 BOM
    expect(Object.keys(record.data)).not.toContain('\uFEFFid')
  })

  it('往返保型：spinbox 字段导出再从 CSV 导入仍是 number（修复前退化为字符串）', async () => {
    const { root, service } = makeService()
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士', hp: 120 } }
    ])

    await exportCsvFiles(root, service, TYPES)
    // 导出侧确实是文本形式（CSV 的天性）
    expect(readFileSync(join(root, 'roles.csv'), 'utf-8')).toContain('120')
    await importCsvFile(join(root, 'roles.csv'), service, TYPES)

    const stored = service.listAllItems().find((item) => item.id === 'r1')
    expect(typeof stored?.data['hp']).toBe('number')
    expect(stored?.data['hp']).toBe(120)
  })
})
