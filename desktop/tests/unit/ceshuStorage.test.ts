import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CeshuManager } from '../../src/main/ceshu/manager'
import { CeshuStorage } from '../../src/main/ceshu/storage'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-ceshu-'))
}

describe('策划书存储与 CeshuManager（W3 第一切片）', () => {
  it('create → 磁盘落盘（独立 JSON 文件 + Python 兼容键名），get 可读回', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))

    const created = await manager.create({ scope: 'lite', name: '测试策划书' })
    const filePath = join(dir, `${created.ceshu_id}.json`)
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>

    expect(raw['ceshu_id']).toBe(created.ceshu_id)
    expect(raw['version']).toBe('5.0')
    expect(raw['created_at']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect((raw['meta'] as Record<string, unknown>)['game_name']).toBe('测试策划书')
    expect((raw['meta'] as Record<string, unknown>)['gdd_scope']).toBe('lite')
    expect(Object.keys(raw).filter((key) => key === 'systems')).toHaveLength(1)

    const loaded = manager.get(created.ceshu_id)
    expect(loaded.meta.game_name).toBe('测试策划书')
    expect(Object.keys(loaded.systems)).toHaveLength(13)
  })

  it('saveChapter：读最新文件合并单章 → 原子写回（无残留 tmp 文件）', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'full' })

    // 与渲染层一致：在既有 meta 上合并表单字段（未编辑字段随克隆保留）
    const updated = await manager.saveChapter(created.ceshu_id, 'meta', {
      ...created.meta,
      game_name: '改后的名字',
      game_type: 'RPG',
      positioning: '定位',
      tags: ['标签A'],
      extra_unknown_field: '保留我'
    })

    expect(updated.meta.game_name).toBe('改后的名字')
    // 未提交的既有字段（如表单外的 date）与扩展字段保留
    expect(updated.meta.version).toBe('0.1.0')
    expect((updated.meta as Record<string, unknown>).extra_unknown_field).toBe('保留我')
    // meta 章保留既有档位
    expect(updated.meta.gdd_scope).toBe('full')

    const reloaded = manager.get(created.ceshu_id)
    expect(reloaded.meta.game_name).toBe('改后的名字')
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })

  it('读取 Python 旧版文件：章节字段差异容忍、缺失章补默认、未知顶层键保留', () => {
    const dir = makeDir()
    writeFileSync(
      join(dir, 'aabbccdd.json'),
      JSON.stringify({
        version: '5.0',
        ceshu_id: 'aabbccdd',
        created_at: '2026-09-09 03:33:39',
        updated_at: '2026-09-09 03:33:39',
        meta: { game_type: 'RPG角色扮演游戏', positioning: '基础 GDD 模板', gdd_scope: 'full' },
        characters: { protagonist: {}, npc_list: [] },
        enabled_editors: [{ key: 'battle', name: '战斗', data_type: 'battle' }],
        editor_configs: {}
      }),
      'utf-8'
    )
    const storage = new CeshuStorage(dir)
    const doc = storage.load('aabbccdd')

    expect(doc.ceshu_id).toBe('aabbccdd')
    expect((doc.story as Record<string, unknown>).npc_list).toEqual([])
    expect(doc.story.main_plot).toBe('')
    expect(doc.enabled_editors).toHaveLength(1)

    const manager = new CeshuManager(storage)
    const summaries = manager.list()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.id).toBe('aabbccdd')
    expect(summaries[0]?.gameName).toBe('')
    expect(summaries[0]?.scope).toBe('full')
    expect(summaries[0]?.progress).toBeTypeOf('number')
  })

  it('损坏文件：list 跳过不阻塞，load 抛中文错误；非法 id 拒绝访问', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'broken01.json'), '{not-json', 'utf-8')
    const manager = new CeshuManager(new CeshuStorage(dir))

    expect(manager.list()).toEqual([])
    expect(() => manager.get('broken01')).toThrow('损坏')
    expect(() => manager.get('../etc/passwd')).toThrow('非法')
  })

  it('list 摘要：包含进度与档位，且新保存的文档可再次列出', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'lite', name: 'Lite 策划书' })
    await manager.saveChapter(created.ceshu_id, 'meta', { ...created.meta, tags: ['a', 'b'] })

    const summaries = manager.list()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.versionLabel).toBe('v1.0')
    expect(summaries[0]?.progress).toBeGreaterThan(0)
  })
})