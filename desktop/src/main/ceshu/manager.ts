import type { CeshuDocument, CeshuSummary, ChapterData, ChapterKey, GddScope } from '../../shared/ceshuConstants'
import { buildChangelogEntry, compareVersionLabels, nextVersionLabel, type CeshuChangelog } from '../../shared/ceshuDiff'
import { autoFillRequiredFields } from '../../shared/ceshuFill'
import { computeChapterProgress, computeEnabledEditors, createCeshuId, createDefaultCeshu, formatLocalTimestamp, getGddScope, withChapter } from '../../shared/ceshuModel'
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
  saveChapter(
    id: string,
    chapter: ChapterKey,
    data: ChapterData,
    docFields: { style?: string; moduleType?: string } = {}
  ): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const next = withChapter(doc, chapter, data)
      if (docFields.style !== undefined) next.style = docFields.style
      if (docFields.moduleType !== undefined) next.module_type = docFields.moduleType
      this.storage.save(next)
      return next
    })
  }

  /**
   * 一键修复（对应 Python CeshuModel.auto_fill_required）：
   * 按规则自动填充空必填字段 → 刷新时间戳/启用编辑器 → 整文档原子写盘。
   * 无字段可填时不写盘，原样返回。
   */
  autoFill(id: string): Promise<{ doc: CeshuDocument; filled: number }> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const { doc: filledDoc, filled } = autoFillRequiredFields(doc)
      if (filled > 0) {
        filledDoc.updated_at = formatLocalTimestamp()
        filledDoc.enabled_editors = computeEnabledEditors(filledDoc)
        this.storage.save(filledDoc)
      }
      return { doc: filledDoc, filled }
    })
  }

  /** 版本链列表：主策划在首位，其余按版本号排序（对应 Python list_versions） */
  versions(id: string): CeshuSummary[] {
    const target = this.storage.load(id)
    const rootId = target.parent_id || target.ceshu_id
    const chain = this.storage
      .listDocuments()
      .filter((doc) => doc.ceshu_id === rootId || doc.parent_id === rootId)
    const main = chain.filter((doc) => doc.ceshu_id === rootId)
    const subs = chain
      .filter((doc) => doc.ceshu_id !== rootId)
      .sort((a, b) => compareVersionLabels(a.version_label, b.version_label))
    return [...main, ...subs].map((doc) => this.toSummary(doc))
  }

  /**
   * 派生新版本（对应 Python derive_version）：
   * 复制父本全部内容 → parent_id 指向链根 → 版本号自动递增 → 默认非激活。
   */
  derive(id: string, note: string): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const parent = this.storage.load(id)
      const rootId = parent.parent_id || parent.ceshu_id
      const existingLabels = this.versions(rootId).map((item) => item.versionLabel)
      const versionLabel = nextVersionLabel(parent.version_label, existingLabels)
      const now = formatLocalTimestamp()
      const next: CeshuDocument = {
        ...structuredClone(parent),
        ceshu_id: createCeshuId(),
        parent_id: rootId,
        version_label: versionLabel,
        version_note: note,
        is_active: false,
        created_at: now,
        updated_at: now
      }
      this.storage.save(next)
      return next
    })
  }

  /** 设为激活版本：同链其他版本取消激活（对应 Python set_active_version） */
  setActive(id: string): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const target = this.storage.load(id)
      const rootId = target.parent_id || target.ceshu_id
      for (const doc of this.storage.listDocuments()) {
        const inChain = doc.ceshu_id === rootId || doc.parent_id === rootId
        if (!inChain || doc.ceshu_id === id || !doc.is_active) continue
        doc.is_active = false
        this.storage.save(doc)
      }
      target.is_active = true
      this.storage.save(target)
      return target
    })
  }

  /** 变更日志：同链版本按时间升序逐对计算 diff（对应 Python generate_changelog） */
  changelog(id: string): CeshuChangelog {
    const target = this.storage.load(id)
    const rootId = target.parent_id || target.ceshu_id
    const chain = this.versions(rootId)
    if (chain.length < 2) return { entries: [] }
    const docs = chain
      .map((item) => this.storage.load(item.id))
      .sort((a, b) => (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || ''))
    const entries = []
    for (let index = 1; index < docs.length; index++) {
      const oldDoc = docs[index - 1]
      const newDoc = docs[index]
      if (!oldDoc || !newDoc || oldDoc.ceshu_id === newDoc.ceshu_id) continue
      entries.push(buildChangelogEntry(oldDoc, newDoc, newDoc.version_label, newDoc.updated_at || newDoc.created_at))
    }
    return { entries }
  }

  private toSummary(doc: CeshuDocument): CeshuSummary {
    const gameName = doc.meta.game_name
    return {
      id: doc.ceshu_id,
      gameName: typeof gameName === 'string' ? gameName : '',
      scope: getGddScope(doc),
      versionLabel: doc.version_label,
      updatedAt: doc.updated_at,
      progress: computeChapterProgress(doc).total ?? 0,
      parentId: doc.parent_id,
      isActive: doc.is_active,
      createdAt: doc.created_at
    }
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}