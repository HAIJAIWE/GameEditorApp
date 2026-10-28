import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CeshuManager } from '../../src/main/ceshu/manager'
import { CeshuStorage } from '../../src/main/ceshu/storage'
import { buildProjectFolder } from '../../src/shared/ceshuProjectFolder'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-ceshu-'))
}

describe('策划书存储与 CeshuManager（W3 第一切片）', () => {
  it('create → 磁盘落成项目文件夹（config.json + design/），get 可读回', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))

    const created = await manager.create({ scope: 'lite', name: '测试策划书' })
    // 新文档默认是「一个游戏一个文件夹」，不再写单份 JSON
    const projectDir = join(dir, created.ceshu_id)
    const config = JSON.parse(readFileSync(join(projectDir, 'config.json'), 'utf-8')) as Record<string, unknown>

    expect(config['ceshu_id']).toBe(created.ceshu_id)
    expect(config['game_name']).toBe('测试策划书')
    expect(config['gdd_scope']).toBe('lite')
    expect(config['created_at']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(existsSync(join(projectDir, 'design', 'meta.md'))).toBe(true)
    expect(existsSync(join(dir, `${created.ceshu_id}.json`))).toBe(false)

    const loaded = manager.get(created.ceshu_id)
    expect(loaded.meta.game_name).toBe('测试策划书')
    expect(Object.keys(loaded.systems)).toHaveLength(13)
  })

  it('老文档（已存在的 <id>.json）保存时保持 JSON 形态，不强行迁移', async () => {
    const dir = makeDir()
    const legacyPath = join(dir, 'legacy01.json')
    writeFileSync(
      legacyPath,
      JSON.stringify({
        version: '5.0',
        ceshu_id: 'legacy01',
        created_at: '2026-09-09 03:33:39',
        updated_at: '2026-09-09 03:33:39',
        meta: { game_name: '老项目', gdd_scope: 'full' },
        // schema 之外的扩展字段：JSON 形态能原样保留，文件夹形态没有它的位置
        extra_unknown_field: '保留我'
      }),
      'utf-8'
    )
    const manager = new CeshuManager(new CeshuStorage(dir))
    const doc = manager.get('legacy01')
    await manager.saveChapter('legacy01', 'meta', { ...doc.meta, game_name: '老项目改名' })

    expect(existsSync(join(dir, 'legacy01'))).toBe(false)
    const raw = JSON.parse(readFileSync(legacyPath, 'utf-8')) as Record<string, unknown>
    expect(raw['version']).toBe('5.0')
    expect(raw['extra_unknown_field']).toBe('保留我')
    expect((raw['meta'] as Record<string, unknown>)['game_name']).toBe('老项目改名')
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

  it('读取 旧版 旧版文件：章节字段差异容忍、缺失章补默认、未知顶层键保留', () => {
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

/**
 * 文件夹 = 工作单元（2026-10-26）：同一份文档可以是 `<id>.json`（老形态），
 * 也可以是 `<id>/`（config.json + design/ + data/ + tasks/）。两者在 list/load/save 里一视同仁。
 */
describe('策划书存储：项目文件夹形态', () => {
  it('saveProject 落成目录结构；listIds 认得文件夹；load 还原已填内容', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'full', name: '星海计划' })
    await manager.saveChapter(created.ceshu_id, 'gameplay', {
      ...created.gameplay,
      core_loop: '探索→战斗→养成',
      core_loop_points: ['探索', '战斗', '养成']
    })

    new CeshuStorage(dir).saveProject(manager.get(created.ceshu_id))
    const projectDir = join(dir, created.ceshu_id)
    expect(existsSync(join(projectDir, 'config.json'))).toBe(true)
    expect(existsSync(join(projectDir, 'design', 'gameplay.md'))).toBe(true)
    expect(existsSync(join(projectDir, 'data', 'gameplay.json'))).toBe(true)
    expect(existsSync(join(projectDir, 'tasks', 'programmer.md'))).toBe(true)
    // 文字进 design、结构化进 data
    expect(readFileSync(join(projectDir, 'design', 'gameplay.md'), 'utf-8')).toContain('探索→战斗→养成')
    expect(readFileSync(join(projectDir, 'data', 'gameplay.json'), 'utf-8')).toContain('战斗')

    const storage = new CeshuStorage(dir)
    expect(storage.listIds()).toEqual([created.ceshu_id])
    const loaded = storage.load(created.ceshu_id)
    expect(loaded.meta.game_name).toBe('星海计划')
    expect(loaded.gameplay.core_loop).toBe('探索→战斗→养成')
    expect(loaded.gameplay.core_loop_points).toEqual(['探索', '战斗', '养成'])
    expect(loaded.ceshu_id).toBe(created.ceshu_id)
  })

  it('两种形态同时存在时文件夹权威：save 写文件夹并清掉老 JSON', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'lite', name: 'L' })

    // 制造冲突：同一 id 既有文件夹（create 产出）又有老 JSON（手工遗留/历史残留）
    const legacyPath = join(dir, `${created.ceshu_id}.json`)
    writeFileSync(legacyPath, JSON.stringify({ ceshu_id: created.ceshu_id, meta: { game_name: '旧 JSON 里的名字' } }), 'utf-8')
    expect(manager.get(created.ceshu_id).meta.game_name).toBe('L')

    await manager.saveChapter(created.ceshu_id, 'meta', { ...created.meta, game_name: '改名后' })

    expect(existsSync(legacyPath)).toBe(false)
    expect(manager.get(created.ceshu_id).meta.game_name).toBe('改名后')
    // 落盘的是文件夹里的 config.json
    const config = JSON.parse(readFileSync(join(dir, created.ceshu_id, 'config.json'), 'utf-8')) as {
      game_name: string
    }
    expect(config.game_name).toBe('改名后')
  })

  it('importProjectFolder：从外部目录导入 → 在本库落地为同 id 文件夹；缺 config.json 报错', async () => {
    const libDir = makeDir()
    const sourceDir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(libDir))
    const created = await manager.create({ scope: 'full', name: '外部项目' })
    // 先导出到「外部目录」：模拟用户从别处拷来一个项目文件夹
    const exported = buildProjectFolder(manager.get(created.ceshu_id)).files
    for (const [relative, content] of Object.entries(exported)) {
      const full = join(sourceDir, relative)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content, 'utf-8')
    }

    const storage = new CeshuStorage(libDir)
    const imported = await new CeshuManager(storage).openProjectFolder(sourceDir)

    // id 从 config.json 带回来 ⇒ 重复导入不会变成两份
    expect(imported.ceshu_id).toBe(created.ceshu_id)
    expect(storage.listIds()).toEqual([created.ceshu_id])
    expect(existsSync(join(libDir, created.ceshu_id, 'config.json'))).toBe(true)
    expect(storage.load(created.ceshu_id).meta.game_name).toBe('外部项目')

    // 不是项目文件夹的目录要明确报错，不能静默导入一份空文档
    const notProject = makeDir()
    expect(() => storage.importProjectFolder(notProject)).toThrow('config.json')
  })

  it('saveDemo：原型落盘到 prototype/demo.html，空串清掉', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'full', name: '带原型' })

    const saved = await manager.saveDemo(created.ceshu_id, '<html><body>demo</body></html>')
    expect(saved.demo_html).toContain('demo')
    const demoPath = join(dir, created.ceshu_id, 'prototype', 'demo.html')
    expect(existsSync(demoPath)).toBe(true)
    expect(readFileSync(demoPath, 'utf-8')).toContain('<body>demo</body>')

    // 重新打开（load）能读回来——否则关掉窗口就没了
    expect(manager.get(created.ceshu_id).demo_html).toContain('demo')

    await manager.saveDemo(created.ceshu_id, '   ')
    expect(manager.get(created.ceshu_id).demo_html).toBeUndefined()
    expect(existsSync(demoPath)).toBe(false)
  })

  it('saveProject 清掉不再需要的旧产物，但不动用户自己的文件', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'lite', name: '清理' })
    const projectDir = join(dir, created.ceshu_id)

    // 制造三种「不该再存在」的旧产物 + 两种「绝不该碰」的用户文件
    mkdirSync(join(projectDir, 'prototype'), { recursive: true })
    writeFileSync(join(projectDir, 'prototype', 'old.html'), '<html></html>', 'utf-8')
    writeFileSync(join(projectDir, 'design', 'ghost.md'), '# 不存在的章', 'utf-8')
    writeFileSync(join(projectDir, 'data', 'stale.json'), '{}', 'utf-8')
    writeFileSync(join(projectDir, 'design', 'note.txt'), '我自己的笔记', 'utf-8')
    mkdirSync(join(projectDir, 'images'), { recursive: true })
    writeFileSync(join(projectDir, 'images', 'a.png'), 'png', 'utf-8')

    await manager.saveChapter(created.ceshu_id, 'meta', { ...created.meta, game_name: '清理后' })

    expect(existsSync(join(projectDir, 'prototype', 'old.html'))).toBe(false)
    expect(existsSync(join(projectDir, 'design', 'ghost.md'))).toBe(false)
    expect(existsSync(join(projectDir, 'data', 'stale.json'))).toBe(false)
    // 用户自己的东西一概不碰
    expect(existsSync(join(projectDir, 'design', 'note.txt'))).toBe(true)
    expect(existsSync(join(projectDir, 'images', 'a.png'))).toBe(true)
    // 该在的还在
    expect(existsSync(join(projectDir, 'design', 'meta.md'))).toBe(true)
  })

  it('增量写：内容没变的文件不重写（mtime 不动），变了的才写', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'full', name: '增量' })
    const projectDir = join(dir, created.ceshu_id)
    const metaPath = join(projectDir, 'design', 'meta.md')
    const gameplayPath = join(projectDir, 'design', 'gameplay.md')

    // 把 meta.md 的 mtime 拨到很久以前：若被重写，mtime 会跳到今天
    const old = new Date('2020-01-01T00:00:00Z')
    utimesSync(metaPath, old, old)
    utimesSync(gameplayPath, old, old)

    await manager.saveChapter(created.ceshu_id, 'gameplay', {
      ...created.gameplay,
      core_loop: '探索→战斗'
    })

    // 没动过的章：mtime 原样（说明没写盘）
    expect(statSync(metaPath).mtimeMs).toBeCloseTo(old.getTime(), -2)
    // 动过的章：被写了（mtime 新于 2020）
    expect(statSync(gameplayPath).mtimeMs).toBeGreaterThan(old.getTime() + 1000)
  })

  it('remove 同时清掉 JSON 与文件夹两种形态', async () => {
    const dir = makeDir()
    const manager = new CeshuManager(new CeshuStorage(dir))
    const created = await manager.create({ scope: 'lite' })
    new CeshuStorage(dir).saveProject(manager.get(created.ceshu_id))

    expect(await manager.remove(created.ceshu_id)).toBe(true)
    expect(existsSync(join(dir, created.ceshu_id))).toBe(false)
    expect(manager.list()).toEqual([])
  })
})