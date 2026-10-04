import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DataService } from '../../src/main/data/service'
import { SqliteItemsRepository } from '../../src/main/data/sqliteRepo'
import { exportEngineData } from '../../src/main/engineExport/exporter'
import { renderLuaGameData } from '../../src/main/engineExport/lua'
import { TypeSchemaStore } from '../../src/main/schema/store'

/**
 * 引擎代码导出「真实链路」集成测试（纯函数单测覆盖不到的部分）。
 *
 * 用真实 SQLite（`SqliteItemsRepository` + `mb-editor.db`）、真实 `TypeSchemaStore`
 * （默认内置 12 类型 schema）与真实文件系统，验证：取数 → 渲染 → 原子落盘 → 返回值的一致性。
 * 注意：显式 id 经 `DataService.importRecords` 写入（`createItem` 生成随机 UUID，无法断言稳定键）。
 */

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'mb-engine-export-'))
}

describe('引擎代码导出集成（真实 SQLite + TypeSchemaStore + 落盘）', () => {
  it('全量数据导出为 gd.lua：文件真实存在、内容含 roles/["role_1"]、bytes=实际字节数、无 tmp 残留', async () => {
    const root = makeRoot()
    const service = new DataService(new SqliteItemsRepository(join(root, 'mb-editor.db')))
    const schemaStore = new TypeSchemaStore(join(root, 'type_schema.json'))
    try {
      // 2 条 role + 1 条 skill，经真实 DataService 写队列落真实 SQLite
      await service.importRecords([
        { id: 'role_1', type: 'role', data: { id: 'role_1', name: '主角艾拉', hp: 320 } },
        { id: 'role_2', type: 'role', data: { id: 'role_2', name: '波比', hp: 500 } },
        { id: 'skill_1', type: 'skill', data: { id: 'skill_1', name: '火球术', value: 150 } }
      ])

      const records = service.listAllItems()
      const types = schemaStore.getTypes()
      expect(records).toHaveLength(3)

      const result = await exportEngineData(records, types, { engine: 'lua', targetPath: join(root, 'gd') })

      const expectedPath = join(root, 'gd.lua')
      expect(result.filePath).toBe(expectedPath)
      expect(result.engine).toBe('lua')
      expect(existsSync(expectedPath)).toBe(true)

      const content = readFileSync(expectedPath, 'utf-8')
      expect(content).toContain('GameData.roles = {')
      expect(content).toContain('["role_1"]')
      expect(content).toContain('["role_2"]')
      expect(content).toContain('GameData.skills = {')
      expect(content).toContain('["skill_1"]')
      expect(content).toBe(renderLuaGameData(records, types))
      // 返回 bytes 应等于文件真实字节数
      expect(result.bytes).toBe(Buffer.byteLength(content, 'utf-8'))
      expect(statSync(expectedPath).size).toBe(result.bytes)
      // 原子写：无 *.tmp 残留
      expect(readdirSync(root).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
    } finally {
      service.dispose()
    }
  })

  it('types 为空（真实 schema 文件 data_types=[]）+ records 非空 → 抛中文错误且不产出文件', async () => {
    const root = makeRoot()
    writeFileSync(join(root, 'type_schema.json'), JSON.stringify({ version: '2.4', data_types: [] }), 'utf-8')
    const service = new DataService(new SqliteItemsRepository(join(root, 'mb-editor.db')))
    const schemaStore = new TypeSchemaStore(join(root, 'type_schema.json'))
    try {
      await service.importRecords([{ id: 'role_1', type: 'role', data: { id: 'role_1' } }])
      expect(schemaStore.getTypes()).toHaveLength(0)

      await expect(
        exportEngineData(service.listAllItems(), schemaStore.getTypes(), {
          engine: 'lua',
          targetPath: join(root, 'gd')
        })
      ).rejects.toThrow('数据类型定义')
      expect(existsSync(join(root, 'gd.lua'))).toBe(false)
    } finally {
      service.dispose()
    }
  })
})
