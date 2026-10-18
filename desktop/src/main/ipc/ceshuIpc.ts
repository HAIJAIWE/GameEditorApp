import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  ceshuAiGenerateInputSchema,
  ceshuAiGenerateFieldInputSchema,
  ceshuApplyPresetInputSchema,
  ceshuChangelogExportInputSchema,
  ceshuConfirmSystemsInputSchema,
  ceshuCreateInputSchema,
  ceshuDataGenInputSchema,
  ceshuDeleteInputSchema,
  ceshuDeriveInputSchema,
  ceshuDiffExportInputSchema,
  ceshuDiffInputSchema,
  ceshuExportInputSchema,
  ceshuGetInputSchema,
  ceshuRenameInputSchema,
  ceshuReviewExportInputSchema,
  ceshuSaveChapterInputSchema,
  ceshuScoreExportInputSchema,
  ceshuSyncDataInputSchema,
  ceshuValidationExportInputSchema,
  notesAddInputSchema,
  notesDeleteInputSchema,
  notesListInputSchema,
  notesUpdateInputSchema,
  templatesDeleteInputSchema,
  templatesExportInputSchema,
  templatesImportInputSchema,
  templatesListInputSchema,
  templatesSaveInputSchema,
  templatesUpdateInputSchema
} from '../../shared/schemas'
import { CHAPTER_LABELS, isChapterKey, type ChapterKey, type SystemEntry } from '../../shared/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../shared/ceshuFields'
import { generateChapterTask, generateDataTask, generateFieldTask, reviewTask } from '../ai/tasks/ceshu'
import { buildVersionDiff } from '../../shared/ceshuDiff'
import { buildSystemConfirmResult } from '../../shared/ceshuSystemConfirm'
import { scoreCeshu } from '../../shared/ceshuScorer'
import { validateCeshu } from '../../shared/ceshuValidation'
import { exportCeshuDocument } from '../ceshu/export/exporter'
import { exportTextReportFile } from '../ceshu/reportExport'

export function registerCeshuIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const {
    ceshuManager,
    ceshuNotesStore,
    ceshuTemplateStore,
    typeSchemaStore,
    dataService,
    dataSync,
    llmClient
  } = deps

  handle('ceshu:list', undefined, () => ceshuManager.list())
  handle('ceshu:create', ceshuCreateInputSchema, (req) => ceshuManager.create(req))
  handle('ceshu:get', ceshuGetInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    dataSync.setCurrentCeshu(req.id)
    return doc
  })
  handle('ceshu:saveChapter', ceshuSaveChapterInputSchema, async (req) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    const updated = await ceshuManager.saveChapter(req.id, req.chapter, req.data, {
      style: req.style,
      moduleType: req.moduleType
    })
    // 系统章/元信息章保存后，确保启用系统的数据结构已注册（对齐 Python ceshu_changed → sync_systems_to_data）
    if (req.chapter === 'systems' || req.chapter === 'meta') {
      dataSync.syncSystemsToData(updated, '')
    }
    return updated
  })
  handle('ceshu:export', ceshuExportInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    return exportCeshuDocument(doc, req.format, req.path)
  })
  handle('ceshu:versions', ceshuGetInputSchema, (req) => ceshuManager.versions(req.id))
  handle('ceshu:derive', ceshuDeriveInputSchema, (req) => ceshuManager.derive(req.id, req.note))
  handle('ceshu:applyPreset', ceshuApplyPresetInputSchema, async (req) => {
    const result = await ceshuManager.applyPreset(req.id, req.presetKey)
    dataSync.syncSystemsToData(result.doc, '')
    return result
  })
  handle('ceshu:confirmSystems', ceshuConfirmSystemsInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    const baseSystems = (doc.systems ?? {}) as Record<string, SystemEntry>
    const { systems } = buildSystemConfirmResult(baseSystems, req.enabledKeys, req.customSystems)
    const updated = await ceshuManager.saveChapter(req.id, 'systems', systems)
    // 对齐 PyQt `editor_view_mixins.py:833`：确认后置 `meta.system_confirmed`，
    // 之后再次打开该策划书就不再自动弹确认对话框（PyQt 的弹窗条件是「未确认 且 已启用系统」）
    const confirmed = await ceshuManager.saveChapter(req.id, 'meta', {
      ...(updated.meta ?? {}),
      system_confirmed: true
    })
    const syncResult = dataSync.syncSystemsToData(confirmed, '')
    const systemsMap = confirmed.systems as Record<string, { enabled: boolean }>
    const enabledCount = Object.values(systemsMap).filter((entry) => entry.enabled === true).length
    const addedCustom = req.customSystems.filter((custom) => !(custom.key in baseSystems)).length
    return { doc: confirmed, enabledCount, addedCustom, addedTypes: syncResult.addedTypes }
  })
  handle('ceshu:syncData', ceshuSyncDataInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    return dataSync.syncBoth(doc, req.id, '')
  })
  handle('ceshu:rename', ceshuRenameInputSchema, (req) => ceshuManager.rename(req.id, req.name))
  handle('ceshu:delete', ceshuDeleteInputSchema, async (req) => {
    // 契约层防误删（与 `data:clearAll` 同一约定）：渲染层的「确认删除」二次确认框是 UX 防护，
    // 这里是主进程侧守卫——`confirm` 必填且必须为 true，任何调用点都绕不过。
    if (req.confirm !== true) throw new Error('删除策划书需要确认')
    const deleted = await ceshuManager.remove(req.id)
    // 被删除的文档若正是数据同步的当前上下文，清空以免后续同步指向已不存在的文档
    if (deleted) dataSync.clearCurrentCeshu()
    return { deleted }
  })
  handle('ceshu:duplicate', ceshuGetInputSchema, (req) => ceshuManager.duplicate(req.id))
  handle('ceshu:setActive', ceshuGetInputSchema, (req) => ceshuManager.setActive(req.id))
  handle('ceshu:changelog', ceshuGetInputSchema, (req) => ceshuManager.changelog(req.id))
  handle('ceshu:validate', ceshuGetInputSchema, (req) => validateCeshu(ceshuManager.get(req.id)))
  handle('ceshu:score', ceshuGetInputSchema, (req) => scoreCeshu(ceshuManager.get(req.id)))
  handle('ceshu:aiGenerateChapter', ceshuAiGenerateInputSchema, async (req, event) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    // 显式收窄成 const：属性访问的类型收窄不跨入异步调用
    const chapter: ChapterKey = req.chapter
    // 编排（提示词 / 预算门 / 取消 / 质量门 / 判官）全部在 `main/ai/tasks/ceshu`，
    // 此处只负责取文档与转交渲染层入参，见该文件顶部说明。
    return generateChapterTask(
      { llm, client: llmClient },
      {
        base: ceshuManager.get(req.id),
        draft: req.fullGenerate?.draft ?? {},
        chapter,
        onlyEmpty: req.onlyEmpty,
        styleKey: req.fullGenerate?.styleKey,
        extraPrompt: req.fullGenerate?.extraPrompt,
        fullGenerate: req.fullGenerate !== undefined,
        confirmed: req.confirmed === true,
        senderId: event.sender.id
      }
    )
  })
  handle('ceshu:aiGenerateField', ceshuAiGenerateFieldInputSchema, async (req, event) => {
    const chapter = req.chapter
    if (!isChapterKey(chapter)) {
      throw new Error(`未知章节：${chapter}`)
    }
    const base = ceshuManager.get(req.id)
    // 校验字段属于该章表单（含既有扩展字段），避免把任意字符串喂给 LLM 当字段名
    const allowedFields = new Set<string>([
      ...(CESHU_CHAPTER_FIELDS[chapter] ?? []).map((field) => field.key),
      ...Object.keys(base[chapter])
    ])
    if (!allowedFields.has(req.field)) {
      throw new Error(`字段「${req.field}」不在「${CHAPTER_LABELS[chapter]}」章表单中`)
    }
    return generateFieldTask(
      { llm, client: llmClient },
      { base, chapter, field: req.field, senderId: event.sender.id }
    )
  })
  handle('ceshu:aiGenerateData', ceshuDataGenInputSchema, async (req, event) => {
    const doc = ceshuManager.get(req.id)
    return generateDataTask(
      { llm, client: llmClient },
      {
        doc,
        types: typeSchemaStore.getTypes(),
        dataTypes: req.dataTypes,
        count: req.count,
        instruction: req.instruction,
        confirmed: req.confirmed === true,
        senderId: event.sender.id,
        // 既有条目计数在 ai/ 层不可直接取（禁止 import main/data/**），由此处注入
        existingCounts: async () => {
          const counts: Record<string, number> = {}
          for (const item of await dataService.listAllItems()) {
            // `items.type` 存的是**单数**类型 id（见 roadmap「数据表键口径」）
            counts[item.type] = (counts[item.type] ?? 0) + 1
          }
          return counts
        }
      }
    )
  })
  handle('ceshu:aiReview', ceshuGetInputSchema, async (req, event) =>
    reviewTask(
      { llm, client: llmClient },
      {
        doc: ceshuManager.get(req.id),
        confirmed: req.confirmed === true,
        senderId: event.sender.id
      }
    )
  )
  handle('ceshu:exportReviewReport', ceshuReviewExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '审阅报告')
  )
  handle('ceshu:autoFill', ceshuGetInputSchema, (req) => ceshuManager.autoFill(req.id))
  handle('ceshu:diff', ceshuDiffInputSchema, (req) => {
    if (req.id === req.otherId) {
      throw new Error('请选择两个不同的版本')
    }
    return buildVersionDiff(ceshuManager.get(req.id), ceshuManager.get(req.otherId))
  })
  handle('ceshu:exportDiffReport', ceshuDiffExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '对比报告')
  )
  handle('ceshu:exportScoreReport', ceshuScoreExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '评分报告')
  )
  handle('ceshu:exportValidationReport', ceshuValidationExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '校验报告')
  )
  handle('ceshu:exportChangelogReport', ceshuChangelogExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '变更日志')
  )
  handle('ceshu:notes:list', notesListInputSchema, (req) => ceshuNotesStore.list(req.id, req.chapterKey))
  handle('ceshu:notes:add', notesAddInputSchema, (req) => {
    if (!isChapterKey(req.chapterKey)) {
      throw new Error(`未知章节：${req.chapterKey}`)
    }
    return ceshuNotesStore.add(req.id, req.chapterKey, req.content, req.author)
  })
  handle('ceshu:notes:update', notesUpdateInputSchema, (req) =>
    ceshuNotesStore.update(req.id, req.noteId, req.content, req.author)
  )
  handle('ceshu:notes:delete', notesDeleteInputSchema, (req) => ceshuNotesStore.remove(req.id, req.noteId))
  handle('ceshu:templates:list', templatesListInputSchema, (req) => ceshuTemplateStore.list(req.chapterKey))
  handle('ceshu:templates:save', templatesSaveInputSchema, (req) => {
    if (req.chapterKey && !isChapterKey(req.chapterKey)) {
      throw new Error(`未知章节：${req.chapterKey}`)
    }
    return ceshuTemplateStore.save(req)
  })
  handle('ceshu:templates:delete', templatesDeleteInputSchema, (req) => ceshuTemplateStore.remove(req.id))
  handle('ceshu:templates:update', templatesUpdateInputSchema, (req) => {
    if (req.chapterKey && !isChapterKey(req.chapterKey)) {
      throw new Error(`未知章节：${req.chapterKey}`)
    }
    return ceshuTemplateStore.update(req.id, {
      name: req.name,
      description: req.description,
      tags: req.tags,
      chapterKey: req.chapterKey,
      data: req.data,
      sourceGame: req.sourceGame
    })
  })
  handle('ceshu:templates:export', templatesExportInputSchema, (req) => ceshuTemplateStore.exportAll(req.path))
  handle('ceshu:templates:import', templatesImportInputSchema, (req) =>
    ceshuTemplateStore.importFrom(req.path, req.overwrite)
  )
}
