import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface NoteRecord {
  id: string
  chapter_key: string
  content: string
  author: string
  created_at: string
  updated_at: string
}

interface NotesProbe {
  ceshuId: string
  emptyCount: number
  afterAddCount: number
  order: string[]
  metaCount: number
  updatedContent: string
  updatedAuthor: string
  missingError: string
  unknownChapterError: string
  firstDelete: boolean
  secondDelete: boolean
  remainingCount: number
}

test('章节笔记：IPC 增删改查 + 磁盘落盘 + UI 面板全链路', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-notes-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 侧：增 / 查 / 改 / 删 + 错误路径 + 磁盘结构
    const probe = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              notes: {
                list: (req: { id: string; chapterKey?: string }) => Promise<NoteRecord[]>
                add: (req: { id: string; chapterKey: string; content: string; author?: string }) => Promise<NoteRecord>
                update: (req: { id: string; noteId: string; content: string; author?: string }) => Promise<NoteRecord>
                remove: (req: { id: string; noteId: string }) => Promise<{ deleted: boolean }>
              }
            }
          }
        }
      ).mbApi

      const created = await api.ceshu.create({ name: '笔记E2E', scope: 'full' })
      const id = created.ceshu_id
      const emptyCount = (await api.ceshu.notes.list({ id })).length

      const first = await api.ceshu.notes.add({ id, chapterKey: 'meta', content: '第一条', author: '策划A' })
      await api.ceshu.notes.add({ id, chapterKey: 'vision', content: '第二条' })
      const third = await api.ceshu.notes.add({ id, chapterKey: 'meta', content: '' })

      const all = await api.ceshu.notes.list({ id })
      const metaNotes = await api.ceshu.notes.list({ id, chapterKey: 'meta' })
      const updated = await api.ceshu.notes.update({ id, noteId: first.id, content: '已更新正文' })

      let missingError = ''
      try {
        await api.ceshu.notes.update({ id, noteId: 'missing', content: 'x' })
      } catch (error) {
        missingError = error instanceof Error ? error.message : String(error)
      }
      let unknownChapterError = ''
      try {
        await api.ceshu.notes.add({ id, chapterKey: 'nope', content: 'x' })
      } catch (error) {
        unknownChapterError = error instanceof Error ? error.message : String(error)
      }
      const firstDelete = (await api.ceshu.notes.remove({ id, noteId: third.id })).deleted
      const secondDelete = (await api.ceshu.notes.remove({ id, noteId: third.id })).deleted

      return {
        ceshuId: id,
        emptyCount,
        afterAddCount: all.length,
        order: all.map((note) => note.content),
        metaCount: metaNotes.length,
        updatedContent: updated.content,
        updatedAuthor: updated.author,
        missingError,
        unknownChapterError,
        firstDelete,
        secondDelete,
        remainingCount: (await api.ceshu.notes.list({ id })).length
      } satisfies NotesProbe
    })) as NotesProbe

    expect(probe.emptyCount).toBe(0)
    expect(probe.afterAddCount).toBe(3)
    expect(probe.order).toEqual(['第一条', '第二条', ''])
    expect(probe.metaCount).toBe(2)
    expect(probe.updatedContent).toBe('已更新正文')
    // 未传作者 → 保留原作者
    expect(probe.updatedAuthor).toBe('策划A')
    expect(probe.missingError).toContain('笔记不存在')
    expect(probe.unknownChapterError).toContain('未知章节')
    expect(probe.firstDelete).toBe(true)
    expect(probe.secondDelete).toBe(false)
    expect(probe.remainingCount).toBe(2)

    // 磁盘：每份策划书一个 {"notes": [...]} 文件（Python 兼容结构）
    const raw = JSON.parse(readFileSync(join(userDataDir, 'ceshu_notes', `${probe.ceshuId}.json`), 'utf-8')) as {
      notes: NoteRecord[]
    }
    expect(raw.notes).toHaveLength(2)
    expect(raw.notes[0]).toMatchObject({ chapter_key: 'meta', content: '已更新正文', author: '策划A' })

    // UI 侧：文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片 → 打开面板 → 筛选 → 新建 → 保存 → 删除
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '笔记E2E' }).getByTestId('home-card-open').click()
    // 「ceshu-notes」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-notes').click()
    await expect(window.getByTestId('notes-panel')).toBeVisible()
    await expect(window.getByTestId('notes-panel')).toContainText('共 2 条')
    await expect(window.getByTestId('notes-item')).toHaveCount(2)

    await window.getByTestId('notes-filter').selectOption('meta')
    await expect(window.getByTestId('notes-item')).toHaveCount(1)
    await expect(window.getByTestId('notes-item').first()).toContainText('(×1)')
    await expect(window.getByTestId('notes-chapter')).toContainText('文档信息')

    await window.getByTestId('notes-add').click()
    await expect(window.getByTestId('notes-notice')).toContainText('文档信息')
    await expect(window.getByTestId('notes-panel')).toContainText('共 3 条')
    await expect(window.getByTestId('notes-item')).toHaveCount(2)

    await window.getByTestId('notes-content').fill('UI 写入的笔记')
    await window.getByTestId('notes-author').fill('UI作者')
    await window.getByTestId('notes-save').click()
    await expect(window.getByTestId('notes-notice')).toContainText('笔记已保存')
    await expect(window.getByTestId('notes-item')).toHaveCount(2)

    // 保存结果已落盘（磁盘为唯一事实来源）
    const saved = (await window.evaluate(async (id: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { notes: { list: (req: { id: string }) => Promise<NoteRecord[]> } } }
        }
      ).mbApi
      const notes = await api.ceshu.notes.list({ id })
      const target = notes.find((note) => note.content === 'UI 写入的笔记')
      return { count: notes.length, author: target?.author ?? '', chapter: target?.chapter_key ?? '' }
    }, probe.ceshuId)) as { count: number; author: string; chapter: string }
    expect(saved).toEqual({ count: 3, author: 'UI作者', chapter: 'meta' })

    // 删除（二次确认）
    await window.getByTestId('notes-delete').click()
    await expect(window.getByTestId('notes-delete-confirm')).toBeVisible()
    await window.getByTestId('notes-delete-confirm').click()
    await expect(window.getByTestId('notes-notice')).toContainText('笔记已删除')
    await expect(window.getByTestId('notes-panel')).toContainText('共 2 条')
    await expect(window.getByTestId('notes-item')).toHaveCount(1)

    await window.getByTestId('notes-close').click()
    await expect(window.getByTestId('notes-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})