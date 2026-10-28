import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CeshuManager } from '../../src/main/ceshu/manager'
import { CeshuStorage } from '../../src/main/ceshu/storage'

/** 首页卡片的重命名 / 删除 / 复制 */

function makeManager(): { manager: CeshuManager; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'mb-ceshu-crud-'))
  return { manager: new CeshuManager(new CeshuStorage(dir)), dir }
}

describe('CeshuManager.rename', () => {
  it('改 meta.game_name 并落盘，档位与既有字段保留', async () => {
    const { manager } = makeManager()
    const created = await manager.create({ scope: 'lite', name: '旧名字' })

    const renamed = await manager.rename(created.ceshu_id, '新名字')
    expect(renamed.meta.game_name).toBe('新名字')
    // meta 章保留既有档位
    expect(renamed.meta.gdd_scope).toBe('lite')
    // 非 meta 章未被破坏
    expect(Object.keys(renamed.systems)).toHaveLength(13)

    const reloaded = manager.get(created.ceshu_id)
    expect(reloaded.meta.game_name).toBe('新名字')
    // 摘要同步反映新名称
    expect(manager.list()[0]?.gameName).toBe('新名字')
  })

  it('重命名刷新 updated_at（本地时间字符串格式）', async () => {
    const { manager } = makeManager()
    const created = await manager.create({ scope: 'full', name: 'A' })
    const renamed = await manager.rename(created.ceshu_id, 'B')
    expect(renamed.updated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(renamed.updated_at >= created.updated_at).toBe(true)
  })
})

describe('CeshuManager.remove', () => {
  it('删除文件并返回 true；再次删除返回 false', async () => {
    const { manager, dir } = makeManager()
    const created = await manager.create({ scope: 'full', name: '待删除' })
    const projectDir = join(dir, created.ceshu_id)
    expect(existsSync(projectDir)).toBe(true)

    expect(await manager.remove(created.ceshu_id)).toBe(true)
    expect(existsSync(projectDir)).toBe(false)
    expect(manager.list()).toEqual([])
    // 不存在时返回 false
    expect(await manager.remove(created.ceshu_id)).toBe(false)
  })

  it('删除后不留临时文件', async () => {
    const { manager, dir } = makeManager()
    const created = await manager.create({ scope: 'full' })
    await manager.remove(created.ceshu_id)
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })
})

describe('CeshuManager.duplicate', () => {
  it('新 id + 名称加「 (副本)」+ 刷新时间戳 + parent_id 置空（独立副本）', async () => {
    const { manager } = makeManager()
    const source = await manager.create({ scope: 'full', name: '原策划书' })
    await manager.saveChapter(source.ceshu_id, 'meta', { ...source.meta, game_type: 'rpg' })

    const copy = await manager.duplicate(source.ceshu_id)
    expect(copy.ceshu_id).not.toBe(source.ceshu_id)
    expect(copy.meta.game_name).toBe('原策划书 (副本)')
    expect(copy.parent_id).toBe('')
    expect(copy.meta.game_type).toBe('rpg')
    expect(copy.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(copy.updated_at).toBe(copy.created_at)
    // 章节内容完整复制
    expect(Object.keys(copy.systems)).toHaveLength(13)
    expect(manager.list()).toHaveLength(2)
  })

  it('副本独立：改副本不影响原文档', async () => {
    const { manager } = makeManager()
    const source = await manager.create({ scope: 'full', name: '原' })
    const copy = await manager.duplicate(source.ceshu_id)

    await manager.rename(copy.ceshu_id, '副本改过了')
    expect(manager.get(source.ceshu_id).meta.game_name).toBe('原')
    expect(manager.get(copy.ceshu_id).meta.game_name).toBe('副本改过了')
  })

  it('复制空名文档：回退「未命名 (副本)」', async () => {
    const { manager } = makeManager()
    const source = await manager.create({ scope: 'full' }) // 无名称
    const copy = await manager.duplicate(source.ceshu_id)
    expect(copy.meta.game_name).toBe('未命名 (副本)')
  })
})

describe('CeshuManager.list：摘要带待审字段数', () => {
  it('pendingCount 反映 meta.field_status 里的 ai_draft 数量', async () => {
    const { manager } = makeManager()
    const created = await manager.create({ scope: 'full', name: '待审测试' })
    // 摘要的待审数只能从文档现算 ⇒ 必须先落盘再 list（manager 每次读最新文件）
    await manager.saveChapter(created.ceshu_id, 'meta', {
      ...created.meta,
      field_status: {
        meta: {
          positioning: { status: 'ai_draft', at: '2026-01-01 00:00:00' },
          tags: { status: 'approved', at: '2026-01-01 00:00:00' }
        },
        vision: { design_vision: { status: 'ai_draft', at: '2026-01-01 00:00:00' } }
      }
    })

    const summary = manager.list()[0]
    expect(summary?.pendingCount).toBe(2)
  })

  it('没有 field_status 的文档 pendingCount 为 0', async () => {
    const { manager } = makeManager()
    await manager.create({ scope: 'lite' })
    expect(manager.list()[0]?.pendingCount).toBe(0)
  })
})
