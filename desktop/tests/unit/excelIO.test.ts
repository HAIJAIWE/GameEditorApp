import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ExcelJS from 'exceljs'
import { afterEach, describe, expect, it } from 'vitest'

import { buildDataWorkbook, exportExcelFile, importExcelFile, renderDataExcel } from '../../src/main/data/excelIO'
import { DataService } from '../../src/main/data/service'
import { SqliteItemsRepository } from '../../src/main/data/sqliteRepo'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

/**
 * Excel 导入/导出验证：纯构建断言样式/表头/类型，真实文件往返用真 SQLite + 真文件系统。
 * 为什么不 mock 存储：往返正确性（导出→导入后数据与类型精确一致、JSON 字段还原为对象）
 * 只能靠真实写盘 + 真实读回来证明。
 */

const TYPES: DataTypeDef[] = [
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#2196F3', formFields: [] },
  { id: 'skill', name: '技能', pluralKey: 'skills', color: '#4CAF50', formFields: [] }
]

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function makeRecord(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  return {
    id,
    type,
    data: { id, ...data },
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z'
  }
}

/** 新建一个真实临时目录 + SQLite 数据服务（dir 即该目录，供导出落盘） */
function makeEnv(): { dir: string; service: DataService } {
  const dir = mkdtempSync(join(tmpdir(), 'mb-excelio-'))
  const service = new DataService(new SqliteItemsRepository(join(dir, 'db.sqlite')))
  cleanups.push(() => {
    service.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  return { dir, service }
}

/** 新建一个独立的空数据服务（用于验证导入落库） */
function makeEmptyService(): DataService {
  const dir = mkdtempSync(join(tmpdir(), 'mb-excelio-target-'))
  const service = new DataService(new SqliteItemsRepository(join(dir, 'db.sqlite')))
  cleanups.push(() => {
    service.dispose()
    rmSync(dir, { recursive: true, force: true })
  })
  return service
}

function headerCells(sheet: ExcelJS.Worksheet): string[] {
  const row = sheet.getRow(1)
  const out: string[] = []
  for (let col = 1; col <= row.cellCount; col += 1) out.push(String(row.getCell(col).value ?? ''))
  return out
}

describe('buildDataWorkbook：工作表与表头', () => {
  it('工作表名使用 def.name（中文）', () => {
    const workbook = buildDataWorkbook([makeRecord('r1', 'role', { name: '战士' })], TYPES)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['角色'])
  })

  it('只为有记录的类型建表，空类型不建', () => {
    const workbook = buildDataWorkbook([makeRecord('r1', 'role', { name: '战士' })], TYPES)
    expect(workbook.worksheets).toHaveLength(1)
    expect(workbook.getWorksheet('技能')).toBeUndefined()
  })

  it('非 schema 类型记录被跳过，不建表', () => {
    const workbook = buildDataWorkbook(
      [makeRecord('r1', 'role', { name: '战士' }), makeRecord('x1', 'ghost', { name: '幽灵' })],
      TYPES
    )
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['角色'])
  })

  it('表头是全部条目键的并集且按首次出现顺序', () => {
    const records = [
      makeRecord('r1', 'role', { name: '战士', level: 1 }),
      makeRecord('r2', 'role', { name: '法师', job: '法师', extra: 'x' })
    ]
    const sheet = buildDataWorkbook(records, TYPES).getWorksheet('角色')!
    expect(headerCells(sheet)).toEqual(['id', 'name', 'level', 'job', 'extra'])
  })
})

describe('buildDataWorkbook：样式与布局', () => {
  it('表头填充为 FF4472C4 且水平垂直居中', () => {
    const sheet = buildDataWorkbook([makeRecord('r1', 'role', { name: '战士' })], TYPES).getWorksheet('角色')!
    const cell = sheet.getRow(1).getCell(1)
    expect(cell.fill).toMatchObject({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } })
    expect(cell.alignment).toMatchObject({ horizontal: 'center', vertical: 'middle' })
  })

  it('表头字体为加粗白色雅黑', () => {
    const sheet = buildDataWorkbook([makeRecord('r1', 'role', { name: '战士' })], TYPES).getWorksheet('角色')!
    expect(sheet.getRow(1).getCell(1).font).toMatchObject({
      bold: true,
      name: 'Microsoft YaHei',
      color: { argb: 'FFFFFFFF' }
    })
  })

  it('首行冻结（views 冻结 ySplit=1）', () => {
    const sheet = buildDataWorkbook([makeRecord('r1', 'role', { name: '战士' })], TYPES).getWorksheet('角色')!
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
  })

  it('autoFilter 覆盖整个数据区域', () => {
    const records = [
      makeRecord('r1', 'role', { name: '战士', job: '战士' }),
      makeRecord('r2', 'role', { name: '法师', job: '法师' })
    ]
    const sheet = buildDataWorkbook(records, TYPES).getWorksheet('角色')!
    // 1 表头 + 2 数据行 = 3 行；id/name/job = 3 列
    expect(sheet.autoFilter).toMatchObject({
      from: { row: 1, column: 1 },
      to: { row: 3, column: 3 }
    })
  })

  it('正文单元格换行且垂直居中，并带细边框', () => {
    const sheet = buildDataWorkbook([makeRecord('r1', 'role', { name: '战士' })], TYPES).getWorksheet('角色')!
    const cell = sheet.getRow(2).getCell(2)
    expect(cell.alignment).toMatchObject({ wrapText: true, vertical: 'middle' })
    expect(cell.border?.top).toMatchObject({ style: 'thin' })
  })
})

describe('buildDataWorkbook：值的落表规则', () => {
  it('数组/对象落表为 JSON 字符串', () => {
    const record = makeRecord('r1', 'role', { skills: ['a', 'b'], meta: { k: 1 } })
    const sheet = buildDataWorkbook([record], TYPES).getWorksheet('角色')!
    const headers = headerCells(sheet)
    const row = sheet.getRow(2)
    expect(row.getCell(headers.indexOf('skills') + 1).value).toBe(JSON.stringify(['a', 'b']))
    expect(row.getCell(headers.indexOf('meta') + 1).value).toBe(JSON.stringify({ k: 1 }))
  })

  it('数字与布尔保持原始类型', () => {
    const record = makeRecord('r1', 'role', { level: 5, active: true })
    const sheet = buildDataWorkbook([record], TYPES).getWorksheet('角色')!
    const headers = headerCells(sheet)
    const row = sheet.getRow(2)
    const levelCell = row.getCell(headers.indexOf('level') + 1)
    const activeCell = row.getCell(headers.indexOf('active') + 1)
    expect(levelCell.value).toBe(5)
    expect(typeof levelCell.value).toBe('number')
    expect(activeCell.value).toBe(true)
    expect(typeof activeCell.value).toBe('boolean')
  })

  it('null/undefined 落为空单元格', () => {
    const record = makeRecord('r1', 'role', { name: null, desc: undefined })
    const sheet = buildDataWorkbook([record], TYPES).getWorksheet('角色')!
    const headers = headerCells(sheet)
    const row = sheet.getRow(2)
    expect(row.getCell(headers.indexOf('name') + 1).value).toBeNull()
    expect(row.getCell(headers.indexOf('desc') + 1).value).toBeNull()
  })

  it('偶数数据行加底 FFF2F2F2，奇数数据行不加', () => {
    const records = [
      makeRecord('r1', 'role', { name: 'A' }),
      makeRecord('r2', 'role', { name: 'B' }),
      makeRecord('r3', 'role', { name: 'C' })
    ]
    const sheet = buildDataWorkbook(records, TYPES).getWorksheet('角色')!
    expect(sheet.getRow(2).getCell(1).fill).toBeUndefined() // 数据行 1（奇）
    expect(sheet.getRow(3).getCell(1).fill).toMatchObject({ fgColor: { argb: 'FFF2F2F2' } }) // 数据行 2（偶）
    expect(sheet.getRow(4).getCell(1).fill).toBeUndefined() // 数据行 3（奇）
  })

  it('列宽 = max(表头长, 单元格截断40) + 4，并 clamp 到 [8,60]', () => {
    const longHeader = 'k'.repeat(70)
    const record = makeRecord('r1', 'role', { id: 'r1', desc: 'x'.repeat(100), [longHeader]: 'v' })
    const sheet = buildDataWorkbook([record], TYPES).getWorksheet('角色')!
    const headers = headerCells(sheet)
    // id 列：max(2,2)+4=6 → clamp 到 8
    expect(sheet.getColumn(headers.indexOf('id') + 1).width).toBe(8)
    // desc 列：max(4, min(100,40))+4=44
    expect(sheet.getColumn(headers.indexOf('desc') + 1).width).toBe(44)
    // 超长表头列：min(70+4,60)=60
    expect(sheet.getColumn(headers.indexOf(longHeader) + 1).width).toBe(60)
  })
})

describe('renderDataExcel', () => {
  it('返回非空 Buffer（xlsx 以 PK 魔数开头）', async () => {
    const buffer = await renderDataExcel([makeRecord('r1', 'role', { name: '战士' })], TYPES)
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })
})

describe('exportExcelFile / importExcelFile：真实文件往返', () => {
  async function seed(service: DataService): Promise<void> {
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士', level: 3 } },
      { type: 'role', id: 'r2', data: { id: 'r2', name: '法师', level: 5 } },
      { type: 'skill', id: 's1', data: { id: 's1', name: '火球', tags: ['火', '攻击'] } }
    ])
  }

  it('导出写出非空文件，且不残留 .tmp（原子写）', async () => {
    const { dir, service } = makeEnv()
    await seed(service)
    const summary = await exportExcelFile(dir, service, TYPES)
    expect(existsSync(summary.filePath)).toBe(true)
    expect(statSync(summary.filePath).size).toBeGreaterThan(0)
    expect(existsSync(`${summary.filePath}.tmp`)).toBe(false)
  })

  it('导出汇总：totalItems 与按类型计数正确', async () => {
    const { dir, service } = makeEnv()
    await seed(service)
    const summary = await exportExcelFile(dir, service, TYPES)
    expect(summary.totalItems).toBe(3)
    expect(summary.byType).toEqual({ role: 2, skill: 1 })
  })

  it('导入到新的空库：数据与类型精确一致', async () => {
    const { dir, service } = makeEnv()
    await seed(service)
    const summary = await exportExcelFile(dir, service, TYPES)

    const target = makeEmptyService()
    await importExcelFile(summary.filePath, target, TYPES)

    const all = target.listAllItems()
    expect(all).toHaveLength(3)
    const roles = all.filter((record) => record.type === 'role')
    expect(roles.map((record) => record.data['name']).sort()).toEqual(['战士', '法师'])
    expect(all.filter((record) => record.type === 'skill')).toHaveLength(1)
    // id 精确保留
    expect(all.map((record) => record.id).sort()).toEqual(['r1', 'r2', 's1'])
  })

  it('导入汇总数字正确（全部为新增）', async () => {
    const { dir, service } = makeEnv()
    await seed(service)
    const exported = await exportExcelFile(dir, service, TYPES)

    const target = makeEmptyService()
    const summary = await importExcelFile(exported.filePath, target, TYPES)
    expect(summary.totalItems).toBe(3)
    expect(summary.imported).toBe(3)
    expect(summary.updated).toBe(0)
    expect(summary.skipped).toBe(0)
    expect(summary.byType).toEqual({ role: 2, skill: 1 })
    expect(summary.unknownTypes).toEqual({})
  })

  it('重复导入同一文件时计入 updated', async () => {
    const { dir, service } = makeEnv()
    await seed(service)
    const exported = await exportExcelFile(dir, service, TYPES)

    const target = makeEmptyService()
    await importExcelFile(exported.filePath, target, TYPES)
    const second = await importExcelFile(exported.filePath, target, TYPES)
    expect(second.imported).toBe(0)
    expect(second.updated).toBe(3)
  })

  it('数组/对象字段导入后还原为对象（非字符串）', async () => {
    const { dir, service } = makeEnv()
    await service.importRecords([
      {
        type: 'role',
        id: 'r1',
        data: { id: 'r1', name: '战士', skills: ['a', 'b'], meta: { k: 1, nested: { deep: true } } }
      }
    ])
    const exported = await exportExcelFile(dir, service, TYPES)

    const target = makeEmptyService()
    await importExcelFile(exported.filePath, target, TYPES)
    const restored = target.listAllItems().find((record) => record.id === 'r1')!
    expect(Array.isArray(restored.data['skills'])).toBe(true)
    expect(restored.data['skills']).toEqual(['a', 'b'])
    expect(restored.data['meta']).toEqual({ k: 1, nested: { deep: true } })
  })

  it('数字与布尔字段往返后类型不变', async () => {
    const { dir, service } = makeEnv()
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', level: 7, active: true } }
    ])
    const exported = await exportExcelFile(dir, service, TYPES)

    const target = makeEmptyService()
    await importExcelFile(exported.filePath, target, TYPES)
    const restored = target.listAllItems()[0]!
    expect(restored.data['level']).toBe(7)
    expect(restored.data['active']).toBe(true)
  })

  it('空库导出：写出文件但不抛异常，汇总为 0', async () => {
    const { dir, service } = makeEnv()
    const summary = await exportExcelFile(dir, service, TYPES)
    expect(summary.totalItems).toBe(0)
    expect(summary.byType).toEqual({})
    expect(existsSync(summary.filePath)).toBe(true)
  })

  it('导出汇总不包含非 schema 类型', async () => {
    const { dir, service } = makeEnv()
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } },
      { type: 'ghost', id: 'g1', data: { id: 'g1', name: '幽灵' } }
    ])
    const summary = await exportExcelFile(dir, service, TYPES)
    expect(summary.totalItems).toBe(1)
    expect(summary.byType).toEqual({ role: 1 })
  })
})

describe('importExcelFile：工作表名映射与容错', () => {
  it('未命中 schema 的工作表名记入 unknownTypes 且数据仍入库', async () => {
    const { dir } = makeEnv()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('未知道具')
    sheet.addRow(['id', 'name'])
    sheet.addRow(['u1', '神秘石'])
    const filePath = join(dir, 'unknown.xlsx')
    await workbook.xlsx.writeFile(filePath)

    const target = makeEmptyService()
    const summary = await importExcelFile(filePath, target, TYPES)
    expect(summary.unknownTypes).toEqual({ 未知道具: 1 })
    expect(summary.byType).toEqual({ 未知道具: 1 })
    expect(summary.imported).toBe(1)
    expect(target.listAllItems()[0]?.type).toBe('未知道具')
  })

  it('英文复数键与单数键工作表名均解析为类型 id', async () => {
    const { dir } = makeEnv()
    const workbook = new ExcelJS.Workbook()
    const plural = workbook.addWorksheet('roles')
    plural.addRow(['id', 'name'])
    plural.addRow(['r1', '战士'])
    const single = workbook.addWorksheet('skill')
    single.addRow(['id', 'name'])
    single.addRow(['s1', '火球'])
    const filePath = join(dir, 'legacy.xlsx')
    await workbook.xlsx.writeFile(filePath)

    const target = makeEmptyService()
    const summary = await importExcelFile(filePath, target, TYPES)
    expect(summary.byType).toEqual({ role: 1, skill: 1 })
    expect(summary.unknownTypes).toEqual({})
    expect(target.listAllItems().map((record) => record.type).sort()).toEqual(['role', 'skill'])
  })

  it('缺少 id 列的行：记录 id 生成 UUID（内部键），data.id 分配短序号（外显）', async () => {
    const { dir } = makeEnv()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('角色')
    sheet.addRow(['name', 'level'])
    sheet.addRow(['无名英雄', 9])
    const filePath = join(dir, 'no-id.xlsx')
    await workbook.xlsx.writeFile(filePath)

    const target = makeEmptyService()
    const summary = await importExcelFile(filePath, target, TYPES)
    expect(summary.byType).toEqual({ role: 1 })
    const stored = target.listAllItems()[0]!
    expect(typeof stored.id).toBe('string')
    expect(stored.id.length).toBeGreaterThan(0)
    expect(stored.data['id']).toBe('0')
    expect(stored.data['name']).toBe('无名英雄')
  })

  it('读取不存在的文件抛出中文错误', async () => {
    const { dir } = makeEnv()
    const target = makeEmptyService()
    await expect(importExcelFile(join(dir, 'missing.xlsx'), target, TYPES)).rejects.toThrow(/读取 Excel 文件失败/)
  })
})

/**
 * `id` 列位置与「没有 id 列」的告警。
 *
 * 真实链路里 `data.id` 是最后写进 data 的（createItem 先展开用户输入，再补短 id），
 * 所以按 data 键序导出会把 id 甩到最右列；而它正是往返主键，删了导入就整表翻倍。
 */
describe('Excel：id 列位置与缺失告警', () => {
  it('导出时 id 固定在首列（即使 data 里 id 是最后加进去的）', () => {
    // 模拟 createItem 的键序：用户字段在前，id 最后补
    const record: ItemRecord = {
      id: 'rec-1',
      type: 'role',
      data: { name: '铁剑', value: 10, desc: '基础', id: '0' },
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z'
    }
    const workbook = buildDataWorkbook([record], TYPES)
    const sheet = workbook.getWorksheet('角色')!
    const headers: string[] = []
    sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value ?? '')))
    expect(headers[0]).toBe('id')
  })

  it('工作表没有 id 列时，汇总里报出该工作表（不阻断，但必须可见）', async () => {
    const { dir } = makeEnv()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('角色')
    sheet.addRow(['name', 'level'])
    sheet.addRow(['无名英雄', 9])
    const filePath = join(dir, 'no-id.xlsx')
    await workbook.xlsx.writeFile(filePath)

    const target = makeEmptyService()
    const summary = await importExcelFile(filePath, target, TYPES)
    expect(summary.missingIdSources).toEqual(['工作表「角色」'])
  })

  it('正常导出再导入：不报缺失 id，且原地更新不翻倍', async () => {
    const { dir, service } = makeEnv()
    await service.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士', level: 3 } },
      { type: 'role', id: 'r2', data: { id: 'r2', name: '法师', level: 5 } },
      { type: 'skill', id: 's1', data: { id: 's1', name: '火球' } }
    ])
    const exported = await exportExcelFile(dir, service, TYPES)
    const target = makeEmptyService()
    await importExcelFile(exported.filePath, target, TYPES)
    const again = await importExcelFile(exported.filePath, target, TYPES)

    expect(again.missingIdSources).toEqual([])
    expect(again.imported).toBe(0)
    expect(again.updated).toBe(3)
    expect(target.listAllItems()).toHaveLength(3)
  })
})
