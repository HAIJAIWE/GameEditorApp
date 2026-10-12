import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { formatLocalTimestamp } from '../../shared/ceshu/ceshuModel'
import {
  createNote,
  deleteNoteIn,
  filterNotes,
  parseNotesFile,
  serializeNotesFile,
  updateNoteIn,
  type CeshuNote
} from '../../shared/ceshu/ceshuNotes'

/**
 * 章节笔记存储：每份策划书一个 JSON 文件（<dir>/<ceshuId>.json，结构 {"notes": [...]}），
 * 与 Python 版 data/libraries/<库>/ceshu_notes/<id>.json 同构。
 * 写操作经串行队列 + 「临时文件 + rename」原子替换（唯一写者）。
 * 相对 Python 的改进：损坏文件抛中文错误，而非静默返回空列表（避免后续写入覆盖丢笔记）。
 */
export class CeshuNotesStore {
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly dir: string) {}

  /** 列出笔记（可选按章节筛选，按创建时间升序） */
  list(ceshuId: string, chapterKey?: string): CeshuNote[] {
    return filterNotes(this.read(ceshuId), chapterKey)
  }

  add(ceshuId: string, chapterKey: string, content: string, author?: string): Promise<CeshuNote> {
    return this.enqueueWrite(() => {
      const notes = this.read(ceshuId)
      const note = createNote(chapterKey, content, author, formatLocalTimestamp())
      this.write(ceshuId, [...notes, note])
      return note
    })
  }

  update(ceshuId: string, noteId: string, content: string, author?: string): Promise<CeshuNote> {
    return this.enqueueWrite(() => {
      const notes = this.read(ceshuId)
      const next = updateNoteIn(notes, noteId, content, author, formatLocalTimestamp())
      if (!next) throw new Error('笔记不存在，可能已被删除')
      const updated = next.find((note) => note.id === noteId)
      if (!updated) throw new Error('笔记不存在，可能已被删除')
      this.write(ceshuId, next)
      return updated
    })
  }

  remove(ceshuId: string, noteId: string): Promise<{ deleted: boolean }> {
    return this.enqueueWrite(() => {
      const notes = this.read(ceshuId)
      const next = deleteNoteIn(notes, noteId)
      if (!next) return { deleted: false }
      this.write(ceshuId, next)
      return { deleted: true }
    })
  }

  private read(ceshuId: string): CeshuNote[] {
    const path = this.filePath(ceshuId)
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw new Error(`读取笔记文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    try {
      return parseNotesFile(JSON.parse(text))
    } catch {
      throw new Error('笔记文件内容损坏（JSON 解析失败）')
    }
  }

  private write(ceshuId: string, notes: CeshuNote[]): void {
    mkdirSync(this.dir, { recursive: true })
    const path = this.filePath(ceshuId)
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, JSON.stringify(serializeNotesFile(notes), null, 2), 'utf-8')
    renameSync(tmpPath, path)
  }

  private filePath(ceshuId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(ceshuId)) {
      throw new Error('非法的策划书 id')
    }
    return join(this.dir, `${ceshuId}.json`)
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}