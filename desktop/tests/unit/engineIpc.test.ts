import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { registerEngineIpc } from '../../src/main/ipc/engineIpc'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'
// 类型仅用于构造假 deps；不触发 ipc.ts 的 electron 运行时代码（值导入）。
import type { IpcHandlerDeps, IpcRegistrar } from '../../src/main/ipc'

/**
 * engine:exportData 的「图片缺失即阻断」行为测试。
 *
 * 直接调用 registrar 捕获的 handler（不走真实 IPC / 不跑 zod 校验——schema 的
 * `.default(false)` 由 ipc.ts 的外层 handle 负责，这里只验证 handler 本身的逻辑）。
 * deps 只用到 dataService / typeSchemaStore / libraryManager 三个，其余置空。
 */

const MINIMAL_TYPES: DataTypeDef[] = [
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#fff', formFields: [] }
]

const record = (id: string, data: Record<string, unknown>): ItemRecord => ({
  id,
  type: 'role',
  data,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

let tempRoot: string | null = null

afterEach(() => {
  if (tempRoot !== null) {
    rmSync(tempRoot, { recursive: true, force: true })
    tempRoot = null
  }
})

/** 用给定 deps 注册 engineIpc，返回捕获到的 engine:exportData handler */
function captureHandler(
  libDir: string,
  records: ItemRecord[]
): (req: Record<string, unknown>) => Promise<Record<string, unknown>> {
  const deps = {
    dataService: { listAllItems: () => records },
    typeSchemaStore: { getTypes: () => MINIMAL_TYPES },
    libraryManager: { activeDir: () => libDir }
  } as unknown as IpcHandlerDeps

  const captured: Record<string, (req: Record<string, unknown>) => Promise<Record<string, unknown>>> = {}
  const handle: IpcRegistrar = ((channel: string, _schema: unknown, handler: unknown) => {
    captured[channel] = handler as (req: Record<string, unknown>) => Promise<Record<string, unknown>>
  }) as IpcRegistrar
  registerEngineIpc(deps, handle)
  return captured['engine:exportData']
}

describe('engine:exportData — 图片缺失即阻断', () => {
  it('开启阻断且有缺失图片：抛出且数据文件不落盘', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'mb-eng-block-'))
    const libDir = join(tempRoot, 'lib')
    mkdirSync(join(libDir, 'images'), { recursive: true })
    const out = join(tempRoot, 'out', 'GameData.lua')

    const handler = captureHandler(libDir, [record('r1', { image: 'images/ghost.png' })])

    await expect(
      handler({ engine: 'lua', path: out, blockOnMissingImages: true })
    ).rejects.toThrow(/导出已阻断/)

    // 阻断发生在落盘之前：数据文件不应存在
    expect(existsSync(out)).toBe(false)
  })

  it('关闭阻断且有缺失图片：照常导出（不抛，记 missing）', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'mb-eng-noblock-'))
    const libDir = join(tempRoot, 'lib')
    mkdirSync(join(libDir, 'images'), { recursive: true })
    const out = join(tempRoot, 'out', 'GameData.lua')

    const handler = captureHandler(libDir, [record('r1', { image: 'images/ghost.png' })])

    const res = await handler({ engine: 'lua', path: out, blockOnMissingImages: false })
    expect(res.filePath).toBe(out)
    expect((res.missingImages as string[])).toEqual(['images/ghost.png'])
    // 数据文件照常落盘
    expect(existsSync(out)).toBe(true)
  })

  it('开启阻断且图片齐全：正常导出并把图拷到旁边', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'mb-eng-ok-'))
    const libDir = join(tempRoot, 'lib')
    const imagesDir = join(libDir, 'images')
    mkdirSync(imagesDir, { recursive: true })
    writeFileSync(join(imagesDir, 'hero.png'), 'PIC')
    const out = join(tempRoot, 'out', 'GameData.lua')

    const handler = captureHandler(libDir, [record('r1', { image: 'images/hero.png' })])

    const res = await handler({ engine: 'lua', path: out, blockOnMissingImages: true })
    expect(res.filePath).toBe(out)
    expect((res.missingImages as string[])).toEqual([])
    // 图被拷到导出文件旁边（同时也验证双段路径 bug 已修：传的是库根而非 images 目录）
    expect(existsSync(join(tempRoot, 'out', 'images', 'hero.png'))).toBe(true)
  })
})
