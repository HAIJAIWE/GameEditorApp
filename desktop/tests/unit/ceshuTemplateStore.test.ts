import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CeshuTemplateStore } from '../../src/main/ceshu/templateStore'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-templates-'))
}

function readCategory(dir: string, name: string): { templates: Array<Record<string, unknown>> } {
  return JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf-8')) as {
    templates: Array<Record<string, unknown>>
  }
}

describe('自定义模板存储（W28）', () => {
  it('save → 落盘到 <category>.json（{"templates": [...]}、无 tmp 残留），list 可读回', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)

    const created = await store.save({
      name: '我的元信息模板',
      description: 'E2E 描述',
      tags: ['测试', '元信息'],
      chapterKey: 'meta',
      data: { game_name: '云海仙踪' },
      sourceGame: '云海仙踪'
    })

    expect(created.id).toMatch(/^[0-9a-f]{12}$/)
    const raw = readCategory(dir, 'meta')
    expect(raw.templates).toHaveLength(1)
    expect(raw.templates[0]).toMatchObject({
      id: created.id,
      name: '我的元信息模板',
      description: 'E2E 描述',
      tags: ['测试', '元信息'],
      chapter_key: 'meta',
      data: { game_name: '云海仙踪' },
      source_game: '云海仙踪'
    })
    expect(raw.templates[0]?.['created_at']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)

    expect(store.list()).toHaveLength(1)
    expect(store.list('meta')).toHaveLength(1)
    expect(store.list('vision')).toEqual([])
  })

  it('章节为空 → global.json；按章节筛选与「全部」语义与 旧版 list_templates 一致', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)

    await store.save({ name: '全局模板', chapterKey: '', data: { x: 1 } })
    await store.save({ name: '元信息模板', chapterKey: 'meta' })

    expect(readCategory(dir, 'global').templates).toHaveLength(1)
    expect(readCategory(dir, 'global').templates[0]?.['chapter_key']).toBe('')
    expect(store.list('meta').map((item) => item.name)).toEqual(['元信息模板'])
    expect(store.list()).toHaveLength(2)
    expect(store.list('').length).toBe(2)
  })

  it('名称为空 → 抛中文错误且不落盘；非法章节名走净化分类', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)

    await expect(store.save({ name: '   ' })).rejects.toThrow('模板名称不能为空')
    expect(readdirSync(dir)).toHaveLength(0)

    await store.save({ name: '穿越测试', chapterKey: '../evil' })
    expect(readCategory(dir, 'evil').templates[0]?.['name']).toBe('穿越测试')
    expect(readdirSync(dir)).toEqual(['evil.json'])
  })

  it('remove：跨分类查找并落盘；不存在返回 deleted=false 且不建文件', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)

    const meta = await store.save({ name: 'A', chapterKey: 'meta' })
    const global = await store.save({ name: 'B', chapterKey: '' })

    await expect(store.remove(global.id)).resolves.toEqual({ deleted: true })
    expect(readCategory(dir, 'global').templates).toEqual([])
    expect(store.list()).toHaveLength(1)

    await expect(store.remove('not-exist')).resolves.toEqual({ deleted: false })
    await expect(store.remove('')).resolves.toEqual({ deleted: false })
    expect(readCategory(dir, 'meta').templates[0]?.['id']).toBe(meta.id)
  })

  it('并发 save 5 条全部落盘（串行写队列），list 按创建时间升序且无 tmp 残留', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)

    await Promise.all([
      store.save({ name: 'T1', chapterKey: 'meta' }),
      store.save({ name: 'T2', chapterKey: 'meta' }),
      store.save({ name: 'T3', chapterKey: 'meta' }),
      store.save({ name: 'T4', chapterKey: 'vision' }),
      store.save({ name: 'T5', chapterKey: 'art' })
    ])

    expect(store.list('meta').map((item) => item.name)).toEqual(['T1', 'T2', 'T3'])
    expect(store.list('vision').map((item) => item.name)).toEqual(['T4'])
    expect(store.list('art').map((item) => item.name)).toEqual(['T5'])
    // 全部：同秒时间戳下按分类文件顺序（art/meta/vision，目录名排序）+ 稳定排序
    expect(store.list()).toHaveLength(5)
    expect(store.list().map((item) => item.name)).toEqual(['T5', 'T1', 'T2', 'T3', 'T4'])
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
    expect(readdirSync(dir).sort()).toEqual(['art.json', 'meta.json', 'vision.json'])
  })

  it('update：原地更新字段并刷新 updated_at；名称空 → updated=false 且不写盘', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)
    const created = await store.save({ name: '旧名', chapterKey: 'meta', tags: ['旧'], data: { a: 1 } })
    const before = readCategory(dir, 'meta').templates[0]?.['created_at']

    await expect(
      store.update(created.id, { name: '  新名  ', description: '新描述', tags: [' 新 ', ''], data: { b: 2 } })
    ).resolves.toEqual({ updated: true })
    const updated = readCategory(dir, 'meta').templates[0]
    expect(updated).toMatchObject({
      id: created.id,
      name: '新名',
      description: '新描述',
      tags: ['新'],
      chapter_key: 'meta',
      data: { b: 2 },
      created_at: before
    })
    // 时间戳精确到秒，同秒内 updated_at 可能与 created_at 相同，此处只校验格式合法
    expect(String(updated?.['updated_at'])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

    await expect(store.update(created.id, { name: '   ' })).resolves.toEqual({ updated: false })
    expect(readCategory(dir, 'meta').templates[0]?.['name']).toBe('新名')
    await expect(store.update('not-exist', { name: 'X' })).resolves.toEqual({ updated: false })
    await expect(store.update('', { name: 'X' })).resolves.toEqual({ updated: false })
  })

  it('update：章节变化 → 迁移分类文件（旧文件摘除 + 新文件追加）', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(dir)
    const created = await store.save({ name: '迁移我', chapterKey: 'meta' })

    await expect(store.update(created.id, { chapterKey: 'vision' })).resolves.toEqual({ updated: true })
    expect(readCategory(dir, 'meta').templates).toEqual([])
    expect(readCategory(dir, 'vision').templates[0]).toMatchObject({ id: created.id, chapter_key: 'vision' })

    // 迁到全局
    await expect(store.update(created.id, { chapterKey: '' })).resolves.toEqual({ updated: true })
    expect(readCategory(dir, 'vision').templates).toEqual([])
    expect(readCategory(dir, 'global').templates[0]).toMatchObject({ chapter_key: '' })
  })

  it('exportAll：非 .json 后缀自动补全；载荷含 _export_meta 与 _category', async () => {
    const dir = makeDir()
    // 导出/导入用的文件放在**模板目录之外**（目录内任何 *.json 都会被当作分类文件读取）
    const filesDir = makeDir()
    const store = new CeshuTemplateStore(dir)
    await store.save({ name: '元信息', chapterKey: 'meta' })
    await store.save({ name: '全局', chapterKey: '' })

    const withoutSuffix = join(filesDir, 'out', 'templates-export')
    await expect(store.exportAll(withoutSuffix)).resolves.toEqual({
      filePath: `${withoutSuffix}.json`,
      count: 2
    })
    const payload = JSON.parse(readFileSync(`${withoutSuffix}.json`, 'utf-8')) as {
      _export_meta: { export_time: string; template_count: number }
      templates: Array<Record<string, unknown>>
    }
    expect(payload._export_meta.template_count).toBe(2)
    expect(payload._export_meta.export_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(payload.templates.map((item) => item['_category'])).toEqual(['global', 'meta'])

    // 已有 .json 后缀不重复追加
    const withSuffix = join(filesDir, 'again.json')
    await expect(store.exportAll(withSuffix)).resolves.toMatchObject({ filePath: withSuffix, count: 2 })
  })

  it('importFrom：跳过同 id；overwrite=true 覆盖；按 chapter_key 落分类；异常文件抛中文错误', async () => {
    const dir = makeDir()
    const filesDir = makeDir()
    const store = new CeshuTemplateStore(dir)
    const created = await store.save({ name: '原模板', chapterKey: 'meta', data: { a: 1 } })

    const importPath = join(filesDir, 'incoming.json')
    writeFileSync(
      importPath,
      JSON.stringify({
        // 导入条目带稳定 id，便于验证「同 id 跳过 / 覆盖」语义（缺 id 每次导入都会生成新 id）
        templates: [
          { id: created.id, name: '导入覆盖版', chapter_key: 'meta', data: { a: 2 } },
          { id: 'vision000001', name: '新模板', chapter_key: 'vision' },
          { id: 'global000001', name: '全局新模板', chapter_key: '' }
        ]
      }),
      'utf-8'
    )

    // 默认跳过同 id
    await expect(store.importFrom(importPath)).resolves.toEqual({ imported: 2, skipped: 1 })
    expect(store.list('meta').map((item) => item.name)).toEqual(['原模板'])
    expect(store.list('vision').map((item) => item.name)).toEqual(['新模板'])
    expect(readCategory(dir, 'global').templates[0]?.['name']).toBe('全局新模板')

    // overwrite=true 覆盖同 id（原分类内替换，不产生重复）
    await expect(store.importFrom(importPath, true)).resolves.toEqual({ imported: 3, skipped: 0 })
    const meta = store.list('meta')
    expect(meta).toHaveLength(1)
    expect(meta[0]).toMatchObject({ id: created.id, name: '导入覆盖版', data: { a: 2 } })
    expect(store.list()).toHaveLength(3)

    // 裸数组也支持
    const arrayPath = join(filesDir, 'array.json')
    writeFileSync(arrayPath, JSON.stringify([{ name: '数组模板', chapter_key: 'art' }]), 'utf-8')
    await expect(store.importFrom(arrayPath)).resolves.toEqual({ imported: 1, skipped: 0 })
    expect(store.list('art').map((item) => item.name)).toEqual(['数组模板'])

    // 异常路径
    await expect(store.importFrom(join(filesDir, 'missing.json'))).rejects.toThrow('模板文件不存在')
    const brokenPath = join(filesDir, 'broken.json')
    writeFileSync(brokenPath, '{ 坏', 'utf-8')
    await expect(store.importFrom(brokenPath)).rejects.toThrow('模板文件内容损坏（JSON 解析失败）：broken.json')
  })

  it('缺失目录 → 空列表；损坏文件抛中文错误（含文件名，不静默当空）', async () => {
    const dir = makeDir()
    const store = new CeshuTemplateStore(join(dir, 'not-created'))
    expect(store.list()).toEqual([])

    const broken = makeDir()
    writeFileSync(join(broken, 'meta.json'), '{ 坏 JSON', 'utf-8')
    const brokenStore = new CeshuTemplateStore(broken)
    expect(() => brokenStore.list()).toThrow('模板文件内容损坏（JSON 解析失败）：meta.json')
    // 非对象条目被丢弃（不抛错）
    writeFileSync(join(broken, 'meta.json'), JSON.stringify({ templates: [1, 'x'] }), 'utf-8')
    expect(brokenStore.list()).toEqual([])
  })
})