import type { CeshuDocument, CeshuSummary, ChapterData, ChapterKey, GddScope } from '../../shared/ceshuConstants'
import { computeChapterProgress, createDefaultCeshu, getGddScope, withChapter } from '../../shared/ceshuModel'
import { CeshuStorage } from './storage'

/**
 * 策划书服务：本模块内唯一写者。
 * 写操作（新建/保存章节）经内部串行队列执行，避免并发写同一文件造成互相覆盖。
 */
export class CeshuManager {
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly storage: CeshuStorage) {}

  /** 列表摘要：按 updated_at 倒序（格式固定，字符串序即时间序） */
  list(): CeshuSummary[] {
    return this.storage
      .listDocuments()
      .map((doc) => this.toSummary(doc))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): CeshuDocument {
    return this.storage.load(id)
  }

  create(options: { scope: GddScope; name?: string }): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = createDefaultCeshu(options)
      this.storage.save(doc)
      return doc
    })
  }

  /** 保存单章：读最新文件 → 合并章节 → 刷新时间戳/启用编辑器 → 原子写回 */
  saveChapter(id: string, chapter: ChapterKey, data: ChapterData): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const next = withChapter(doc, chapter, data)
      this.storage.save(next)
      return next
    })
  }

  private toSummary(doc: CeshuDocument): CeshuSummary {
    const gameName = doc.meta.game_name
    return {
      id: doc.ceshu_id,
      gameName: typeof gameName === 'string' ? gameName : '',
      scope: getGddScope(doc),
      versionLabel: doc.version_label,
      updatedAt: doc.updated_at,
      progress: computeChapterProgress(doc).total ?? 0
    }
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}