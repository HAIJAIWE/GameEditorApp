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

  it('章节为空 → global.json；按章节筛选与「全部」语义与 Python list_templates 一致', async () => {
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