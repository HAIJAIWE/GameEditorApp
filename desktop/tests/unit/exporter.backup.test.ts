import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DataTypeDef } from '../../src/shared/types'
import { exportEngineData } from '../../src/main/engineExport/exporter'

/** `exportEngineData` 的「覆盖前备份」行为（真实 fs）。
 * 导出目标是游戏活文件、AI 生成可能出错，必须先留一份上一版供回滚。 */
describe('exportEngineData 覆盖前备份', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-export-bak-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // 一个最小可用类型（lua 渲染器要求 types 非空且含 pluralKey）；记录为空即可渲染。
  const types: DataTypeDef[] = [{ id: 'role', name: '角色', pluralKey: 'roles', color: '#fff', formFields: [] }]
  const records: never[] = []

  it('目标已存在时先备份上一版到 <filePath>.bak', async () => {
    const target = join(dir, 'GameData.lua')
    writeFileSync(target, 'OLD CONTENT', 'utf-8')

    const res = await exportEngineData(records, types, { engine: 'lua', targetPath: target })

    expect(res.backupPath).toBe(`${target}.bak`)
    expect(existsSync(res.backupPath!)).toBe(true)
    expect(readFileSync(res.backupPath!, 'utf-8')).toBe('OLD CONTENT')
    // 新文件已被覆盖为导出内容（不再是旧版）
    expect(readFileSync(target, 'utf-8')).not.toBe('OLD CONTENT')
  })

  it('首次导出（目标不存在）不备份', async () => {
    const target = join(dir, 'Fresh.lua')
    const res = await exportEngineData(records, types, { engine: 'lua', targetPath: target })

    expect(res.backupPath).toBeUndefined()
    expect(existsSync(`${target}.bak`)).toBe(false)
  })

  it('单级回滚：.bak 始终是最新一次导出前的版本', async () => {
    const target = join(dir, 'GameData.lua')
    writeFileSync(target, 'V1', 'utf-8')
    await exportEngineData(records, types, { engine: 'lua', targetPath: target }) // backup=V1, file=new
    writeFileSync(target, 'V2', 'utf-8')
    const res2 = await exportEngineData(records, types, { engine: 'lua', targetPath: target }) // backup=V2

    expect(readFileSync(res2.backupPath!, 'utf-8')).toBe('V2')
  })

  it('非 lua 引擎（cocos2d/json）同样备份', async () => {
    const target = join(dir, 'GameData.json')
    writeFileSync(target, 'OLD', 'utf-8')
    const res = await exportEngineData(records, types, { engine: 'cocos2d', targetPath: target })

    expect(res.backupPath).toBe(`${target}.bak`)
    expect(readFileSync(res.backupPath!, 'utf-8')).toBe('OLD')
  })
})
