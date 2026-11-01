import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DataTypeDef } from '@mobai/shared/types'
import { exportEngineData } from '../../src/main/engineExport/exporter'

/** `exportEngineData` 的热更新清单（`<filePath>.hotreload.json`）：游戏侧 watcher 监听它即可运行时重载。 */
describe('exportEngineData 热更新清单', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mb-export-hot-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const types: DataTypeDef[] = [{ id: 'role', name: '角色', pluralKey: 'roles', color: '#fff', formFields: [] }]
  const records: never[] = []

  it('首导出版本为 v1，且哈希等于数据文件内容', async () => {
    const target = join(dir, 'GameData.lua')
    const res = await exportEngineData(records, types, { engine: 'lua', targetPath: target })

    expect(res.manifestPath).toBe(`${target}.hotreload.json`)
    expect(res.version).toBe(1)
    const manifest = JSON.parse(readFileSync(res.manifestPath!, 'utf-8')) as { version: number; hash: string; file: string }
    expect(manifest.version).toBe(1)
    expect(manifest.file).toBe('GameData.lua')

    const dataOnDisk = readFileSync(target, 'utf-8')
    const expectedHash = createHash('sha256').update(dataOnDisk, 'utf-8').digest('hex')
    expect(manifest.hash).toBe(expectedHash)
  })

  it('同目标再次导出版本单调 +1（v2）', async () => {
    const target = join(dir, 'GameData.lua')
    await exportEngineData(records, types, { engine: 'lua', targetPath: target })
    const res2 = await exportEngineData(records, types, { engine: 'lua', targetPath: target })
    expect(res2.version).toBe(2)

    const manifest = JSON.parse(readFileSync(res2.manifestPath!, 'utf-8')) as { version: number }
    expect(manifest.version).toBe(2)
  })

  it('清单原子写：不残留 .tmp', async () => {
    const target = join(dir, 'GameData.json')
    await exportEngineData(records, types, { engine: 'cocos2d', targetPath: target })
    expect(existsSync(`${target}.hotreload.json.tmp`)).toBe(false)
    expect(existsSync(`${target}.hotreload.json`)).toBe(true)
  })

  it('清单是独立文件，不污染数据文件本身', async () => {
    const target = join(dir, 'GameData.json')
    const res = await exportEngineData(records, types, { engine: 'cocos2d', targetPath: target })
    // 数据文件内容仍是合法 JSON，未被清单混入
    expect(() => JSON.parse(readFileSync(target, 'utf-8'))).not.toThrow()
    expect(res.filePath).toBe(target)
  })
})
