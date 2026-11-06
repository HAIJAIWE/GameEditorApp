import type { CeshuDocument, CeshuSummary, ChapterData, ChapterKey, GddScope } from '@mobai/shared/ceshu/reference'
import { buildChangelogEntry, compareVersionLabels, nextVersionLabel, type CeshuChangelog } from '@mobai/shared/ceshu/workflow'
import { countDocPendingFields } from '@mobai/shared/ceshu/fields'
import { autoFillRequiredFields } from '@mobai/shared/ceshu/workflow'
import { buildDuplicateName } from '@mobai/shared/ceshu/notes'
import { computeChapterProgress, computeEnabledEditors, createCeshuId, createDefaultCeshu, formatLocalTimestamp, getDocKind, getGddScope, withChapter } from '@mobai/shared/ceshu/model'
import { migrateCeshuFieldSplits } from '@mobai/shared/ceshu/data'
import { buildPresetApplication } from '@mobai/shared/ceshu/reference'
import { fingerprintCeshuDesign } from '@mobai/shared/ceshu/workflow'
import type { CeshuTaskPlan } from '@mobai/shared/ceshu/workflow'
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

  /** 重命名策划书 */
  rename(id: string, name: string): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const next = withChapter(doc, 'meta', { ...doc.meta, game_name: name })
      this.storage.save(next)
      return next
    })
  }

  /** 删除策划书；文件不存在时返回 false */
  remove(id: string): Promise<boolean> {
    return this.enqueueWrite(() => this.storage.remove(id))
  }

  /**
   * 复制为独立副本：新 id + 名称加「 (副本)」+ 刷新时间戳。
   * 偏离：`parent_id` 置空——旧版 会原样保留，与其 UI「独立副本 / 不建立版本关系」的表述自相矛盾。
   */
  duplicate(id: string): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const now = formatLocalTimestamp()
      const gameName = typeof doc.meta.game_name === 'string' ? doc.meta.game_name : ''
      const copy: CeshuDocument = {
        ...structuredClone(doc),
        ceshu_id: createCeshuId(),
        parent_id: '',
        created_at: now,
        updated_at: now,
        meta: { ...doc.meta, game_name: buildDuplicateName(gameName) }
      }
      copy.enabled_editors = computeEnabledEditors(copy)
      this.storage.save(copy)
      return copy
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
   * 一键修复：
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

  /**
   * 字段拆分迁移（幂等、非破坏）：把大 textarea 拆成 `*_points` + `*_notes`，
   * **原文保留**（确认新字段无误后可手动清空，也留了回滚余地）。
   * 无可迁移字段时不写盘，原样返回。
   */
  migrateFieldSplits(
    id: string
  ): Promise<{ doc: CeshuDocument; migrated: Array<{ chapter: ChapterKey; fieldKey: string; points: number }> }> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const { doc: next, migrated } = migrateCeshuFieldSplits(doc)
      if (migrated.length > 0) {
        next.updated_at = formatLocalTimestamp()
        next.enabled_editors = computeEnabledEditors(next)
        this.storage.save(next)
      }
      return { doc: next, migrated }
    })
  }

  /**
   * 应用混合玩法预设：
   * 启用推荐系统 + 空 game_type 时写入预设模块类型，systems 与 meta 两章一次原子写盘。
   */
  applyPreset(
    id: string,
    presetKey: string
  ): Promise<{ doc: CeshuDocument; enabledCount: number; presetLabel: string; gameTypeFilled: boolean }> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const application = buildPresetApplication(doc, presetKey)
      if (!application) throw new Error(`未知预设：${presetKey}`)
      const withSystems = withChapter(doc, 'systems', application.systems)
      const next = withChapter(withSystems, 'meta', application.meta)
      this.storage.save(next)
      return {
        doc: next,
        enabledCount: application.enabledCount,
        presetLabel: application.preset.label,
        gameTypeFilled: application.gameTypeFilled
      }
    })
  }

  /** 版本链列表：主策划在首位，其余按版本号排序 */
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
   * 派生新版本：
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

  /** 设为激活版本：同链其他版本取消激活 */
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

  /** 变更日志：同链版本按时间升序逐对计算 diff */
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

  /** 打开项目文件夹（一个游戏一个文件夹）：导入并在本库落地为项目文件夹，返回文档 */
  openProjectFolder(sourceDir: string): Promise<CeshuDocument> {
    return this.enqueueWrite(() => this.storage.importProjectFolder(sourceDir))
  }

  /**
   * 保存 AI 生成的岗位任务计划（整份替换）。
   * 空计划 = 清掉计划，岗位任务回落到「按章字段清单」。
   */
  saveTaskPlan(id: string, plan: CeshuTaskPlan): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const next: CeshuDocument = { ...doc }
      if (Object.keys(plan).length === 0) delete next.task_plan
      else next.task_plan = plan
      next.updated_at = formatLocalTimestamp()
      this.storage.save(next)
      return next
    })
  }

  /**
   * 保存可玩原型（单文件 HTML）。空串 = 清掉（原型是交付物，删掉也该跟着删）。
   * 落盘在项目文件夹的 `prototype/demo.html`，见 `buildProjectFolder`。
   */
  saveDemo(id: string, html: string): Promise<CeshuDocument> {
    return this.enqueueWrite(() => {
      const doc = this.storage.load(id)
      const next: CeshuDocument = { ...doc }
      const trimmed = html.trim()
      if (trimmed === '') {
        delete next.demo_html
        delete next.demo_source_fingerprint
      } else {
        next.demo_html = html
        // 记下「生成这一刻」的设计指纹（`doc` 尚未被本次写入改动）：
        // 之后文档再改，指纹对不上就能提示「原型可能过期」，而不是让旧原型冒充最新。
        next.demo_source_fingerprint = fingerprintCeshuDesign(doc)
      }
      next.updated_at = formatLocalTimestamp()
      this.storage.save(next)
      return next
    })
  }

  private toSummary(doc: CeshuDocument): CeshuSummary {
    const gameName = doc.meta.game_name
    const gameType = doc.meta.game_type
    const status = doc.meta.status
    const platform = doc.meta.platform
    return {
      id: doc.ceshu_id,
      gameName: typeof gameName === 'string' ? gameName : '',
      scope: getGddScope(doc),
      versionLabel: doc.version_label,
      updatedAt: doc.updated_at,
      progress: computeChapterProgress(doc).total ?? 0,
      parentId: doc.parent_id,
      isActive: doc.is_active,
      createdAt: doc.created_at,
      versionNote: doc.version_note,
      gameType: typeof gameType === 'string' ? gameType : '',
      docKind: getDocKind(doc),
      platform: Array.isArray(platform) ? platform.filter((p) => typeof p === 'string') : [],
      status: typeof status === 'string' && status !== '' ? status : 'draft',
      // 首页卡片用：不打开文档也能看出「还有多少 AI 草稿没审」
      pendingCount: countDocPendingFields(doc)
    }
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}