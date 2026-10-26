import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { CeshuNotesStore } from '../../src/main/ceshu/notesStore'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-notes-'))
}

describe('章节笔记存储（W21）', () => {
  it('add → 磁盘落盘（{"notes": [...]} 旧版 兼容结构 + 无 tmp 残留），list 可读回', async () => {
    const dir = makeDir()
    const store = new CeshuNotesStore(dir)

    const created = await store.add('ceshu01', 'meta', '第一条笔记', undefined)
    const raw = JSON.parse(readFileSync(join(dir, 'ceshu01.json'), 'utf-8')) as {
      notes: Array<Record<string, unknown>>
    }
    expect(raw.notes).toHaveLength(1)
    expect(raw.notes[0]).toMatchObject({
      id: created.id,
      chapter_key: 'meta',
      content: '第一条笔记',
      author: 'anonymous'
    })
    expect(raw.notes[0]?.['created_at']).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)

    expect(store.list('ceshu01')).toHaveLength(1)
    // 未创建过的策划书：空列表（不报错）
    expect(store.list('ceshu99')).toEqual([])
  })

  it('并发 add 5 条全部落盘（串行写队列），list 按创建时间升序、可按章节筛选', async () => {
    const dir = makeDir()
    const store = new CeshuNotesStore(dir)

    await Promise.all([
      store.add('c1', 'meta', 'N1', '作者A'),
      store.add('c1', 'meta', 'N2', undefined),
      store.add('c1', 'vision', 'N3', undefined),
      store.add('c1', 'art', 'N4', undefined),
      store.add('c1', 'meta', 'N5', undefined)
    ])

    const all = store.list('c1')
    expect(all).toHaveLength(5)
    // 时间戳同秒时排序稳定 → 保持插入顺序
    expect(all.map((note) => note.content)).toEqual(['N1', 'N2', 'N3', 'N4', 'N5'])
    expect(store.list('c1', 'meta').map((note) => note.content)).toEqual(['N1', 'N2', 'N5'])
    expect(store.list('c1', 'meta')[0]?.author).toBe('作者A')
  })

  it('update：更新正文与时间戳，作者仅在提供时替换；笔记不存在抛中文错误', async () => {
    const dir = makeDir()
    const store = new CeshuNotesStore(dir)
    const created = await store.add('c2', 'combat', '旧正文', '原作者')

    const updated = await store.update('c2', created.id, '新正文', undefined)
    expect(updated).toMatchObject({ id: created.id, content: '新正文', author: '原作者' })
    expect(updated.created_at).toBe(created.created_at)

    const renamed = await store.update('c2', created.id, '新正文', '新作者')
    expect(renamed.author).toBe('新作者')

    await expect(store.update('c2', 'missing', 'x', undefined)).rejects.toThrow('笔记不存在')
    // 失败后文件仍完好
    expect(store.list('c2')).toHaveLength(1)
  })

  it('remove：命中删除并落盘，未命中返回 deleted=false', async () => {
    const dir = makeDir()
    const store = new CeshuNotesStore(dir)
    const a = await store.add('c3', 'meta', 'A', undefined)
    const b = await store.add('c3', 'meta', 'B', undefined)

    expect(await store.remove('c3', a.id)).toEqual({ deleted: true })
    expect(store.list('c3').map((note) => note.id)).toEqual([b.id])
    expect(await store.remove('c3', 'missing')).toEqual({ deleted: false })

    const raw = JSON.parse(readFileSync(join(dir, 'c3.json'), 'utf-8')) as { notes: unknown[] }
    expect(raw.notes).toHaveLength(1)
  })

  it('损坏文件抛中文错误（不静默清空），非法策划书 id 拒绝访问', async () => {
    const dir = makeDir()
    const store = new CeshuNotesStore(dir)
    writeFileSync(join(dir, 'broken.json'), '{not-json', 'utf-8')

    expect(() => store.list('broken')).toThrow('损坏')
    await expect(store.add('broken', 'meta', 'x', undefined)).rejects.toThrow('损坏')
    expect(() => store.list('../etc/passwd')).toThrow('非法')
  })
})