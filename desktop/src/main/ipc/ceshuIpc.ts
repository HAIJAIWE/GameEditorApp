import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  ceshuAiGenerateInputSchema,
  ceshuAiGenerateFieldInputSchema,
  ceshuApplyPresetInputSchema,
  ceshuChangelogExportInputSchema,
  ceshuChecklistExportInputSchema,
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
import { CHAPTER_LABELS, isChapterKey, type SystemEntry } from '../../shared/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../shared/ceshuFields'
import { llmConfirmReason } from '../../shared/agent/protocol'
import { estimateTokens } from '../../shared/agent/budget'
import { applyJudge, evaluateChapterDraft, evaluateDataCandidates } from '../../shared/agent/qualityGate'
import { runLlmJudge } from '../agent/qualityJudge'
import {
  buildChapterPrompt,
  buildReviewPrompts,
  filterGeneratedFields,
  mergeChapterDraft,
  parseReviewResponse
} from '../../shared/ceshuAi'
import { parseLlmJson } from '../../shared/util/parseLlmJson'
import {
  DATA_GEN_ERROR_EMPTY,
  DATA_GEN_ERROR_NO_TYPE,
  DATA_GEN_ERROR_UNPARSABLE,
  buildDataGenPrompt,
  buildDataGenSummaryMessage,
  clampDataGenCount,
  normalizeDataGenCandidates,
  resolveSelectedDataTypes
} from '../../shared/ceshuDataGen'
import { runChecklist } from '../../shared/ceshuChecklist'
import { buildVersionDiff } from '../../shared/ceshuDiff'
import { buildFieldDepsReport } from '../../shared/ceshuFieldDeps'
import { computeChapterProgress } from '../../shared/ceshuModel'
import { buildSystemConfirmResult } from '../../shared/ceshuSystemConfirm'
import { scoreCeshu } from '../../shared/ceshuScorer'
import { validateCeshu } from '../../shared/ceshuValidation'
import { buildWordStatsReport } from '../../shared/ceshuWordStats'
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
  handle('ceshu:aiGenerateChapter', ceshuAiGenerateInputSchema, async (req) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    const base = ceshuManager.get(req.id)
    const draft = req.fullGenerate?.draft ?? {}
    // 一键生成：draft（已生成章节 + meta 种子）仅作为提示词上下文合并，不写盘
    const doc = Object.keys(draft).length > 0 ? mergeChapterDraft(base, draft) : base
    const built = buildChapterPrompt(doc, req.chapter, {
      onlyEmpty: req.onlyEmpty,
      styleOverride: req.fullGenerate?.styleKey,
      extraPrompt: req.fullGenerate?.extraPrompt
    })
    if (req.onlyEmpty && built.fields.length === 0) {
      // 无空字段：不调用 LLM，直接返回空结果（UI 提示「无需补全」）
      return { model: '', fields: {}, rawText: '' }
    }
    // v0.5 DD-17 + v0.6 M5：整篇 / 一键生成属「大范围云端调用」，需渲染层带 `confirmed: true` 重发；
    // 云端档若预估超预算也需先确认（降级 = 提示拆分，而非静默烧钱）
    const callOpts = await llm.llmCallOptions()
    const isCloud = llm.isCloudCall(callOpts)
    const estimated = estimateTokens(built.system + built.prompt)
    const confirmReason = llmConfirmReason({
      bulk: req.fullGenerate !== undefined,
      taskType: req.fullGenerate !== undefined ? 'full' : 'chapter',
      estimatedTokens: estimated,
      isCloud
    })
    if (confirmReason !== null && req.confirmed !== true) {
      throw new Error(confirmReason)
    }
    const { model, content, usage } = await llmClient.generate(built.system, built.prompt, callOpts)
    const parsed = parseLlmJson(content)
    const fields = filterGeneratedFields(doc, req.chapter, parsed)
    // v0.5 DD-19：产出过确定性评分门（validateCeshu + scoreCeshu），供 UI 展示"生成有没有变好"
    const deterministic = evaluateChapterDraft(base, req.chapter, fields)
    // v1.0 DD-19 剩余项：确定性门为主、judge 为辅；judge 走同源 callOpts 自动遵守保密，
    // 失败降级为 null（applyJudge 原样返回确定性 verdict，绝不阻断正文生成）
    const judge = await runLlmJudge(callOpts, req.chapter, fields)
    return {
      model,
      fields,
      rawText: content,
      quality: applyJudge(deterministic, judge),
      // v0.6 M5：成本护栏的观测数据
      usage: usage ?? null
    }
  })
  handle('ceshu:aiGenerateField', ceshuAiGenerateFieldInputSchema, async (req) => {
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
    // 单字段定向生成（E62）：只让 LLM 生成这一个字段，提示词走 buildChapterPrompt 的 onlyFields 分支
    const built = buildChapterPrompt(base, chapter, { onlyFields: [req.field] })
    const callOpts = await llm.llmCallOptions()
    const { model, content, usage } = await llmClient.generate(built.system, built.prompt, callOpts)
    const parsed = parseLlmJson(content)
    const raw = parsed[req.field]
    const fields =
      raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)
        ? {}
        : { [req.field]: raw }
    // 单字段回填无需整章质量门；usage 透传成本观测数据
    return { model, fields, rawText: content, usage: usage ?? null }
  })
  handle('ceshu:aiGenerateData', ceshuDataGenInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    const types = typeSchemaStore.getTypes()
    const selected = resolveSelectedDataTypes(types, req.dataTypes)
    if (selected.length === 0) {
      throw new Error(DATA_GEN_ERROR_NO_TYPE)
    }
    // v0.5 DD-17 + v0.6 M5：批量生成超过阈值 / 云端档超预算，都需渲染层带 `confirmed: true` 重发
    const count = clampDataGenCount(req.count)
    const built = buildDataGenPrompt(doc, types, selected, count, req.instruction.trim())
    const callOpts = await llm.llmCallOptions()
    const isCloud = llm.isCloudCall(callOpts)
    const estimated = estimateTokens(built.system + built.prompt)
    const confirmReason = llmConfirmReason({
      count,
      taskType: 'datagen',
      estimatedTokens: estimated,
      isCloud
    })
    if (confirmReason !== null && req.confirmed !== true) {
      throw new Error(confirmReason)
    }
    const { model, content, usage } = await llmClient.generate(built.system, built.prompt, callOpts)
    const parsed = parseLlmJson(content)
    if (Object.keys(parsed).length === 0) {
      throw new Error(DATA_GEN_ERROR_UNPARSABLE)
    }
    const normalized = normalizeDataGenCandidates(parsed, selected, new Set(types.map((type) => type.pluralKey)))
    if (normalized.total === 0) {
      throw new Error(DATA_GEN_ERROR_EMPTY)
    }
    // v0.5 DD-19（数据半边）：候选过确定性质量门 —— 数量约束（P5，硬）+ 平衡性（建议）。
    // `items.type` 存的是**单数**类型 id（见 roadmap「数据表键口径」），故 existingCounts 以它为键。
    const existingCounts: Record<string, number> = {}
    for (const item of await dataService.listAllItems()) {
      existingCounts[item.type] = (existingCounts[item.type] ?? 0) + 1
    }
    return {
      model,
      candidates: normalized.candidates,
      generatedCounts: normalized.generatedCounts,
      total: normalized.total,
      summary: buildDataGenSummaryMessage(normalized.generatedCounts),
      quality: evaluateDataCandidates(normalized.candidates, {
        types,
        systems: doc.systems,
        existingCounts
      }),
      // v0.6 M5：成本护栏的观测数据
      usage: usage ?? null
    }
  })
  handle('ceshu:aiReview', ceshuGetInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    const progress = computeChapterProgress(doc)
    const validationErrors = validateCeshu(doc)
    const built = buildReviewPrompts(doc, {
      progressTotal: progress.total ?? 0,
      validationCount: validationErrors.length
    })
    // v0.6 M5：云端档超预算需先确认（审阅整篇也可能很长）
    const callOpts = await llm.llmCallOptions()
    const isCloud = llm.isCloudCall(callOpts)
    const estimated = estimateTokens(built.system + built.prompt)
    const confirmReason = llmConfirmReason({ taskType: 'review', estimatedTokens: estimated, isCloud })
    if (confirmReason !== null && req.confirmed !== true) {
      throw new Error(confirmReason)
    }
    const { model, content, usage } = await llmClient.generate(built.system, built.prompt, callOpts)
    return {
      model,
      ...parseReviewResponse(content),
      progressTotal: progress.total ?? 0,
      validationCount: validationErrors.length,
      // v0.6 M5：成本护栏的观测数据
      usage: usage ?? null
    }
  })
  handle('ceshu:exportReviewReport', ceshuReviewExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '审阅报告')
  )
  handle('ceshu:checklist', ceshuGetInputSchema, (req) => runChecklist(ceshuManager.get(req.id)))
  handle('ceshu:autoFill', ceshuGetInputSchema, (req) => ceshuManager.autoFill(req.id))
  handle('ceshu:exportChecklistReport', ceshuChecklistExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '检查报告')
  )
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
  handle('ceshu:wordStats', ceshuGetInputSchema, (req) => buildWordStatsReport(ceshuManager.get(req.id)))
  handle('ceshu:fieldDeps', ceshuGetInputSchema, (req) => buildFieldDepsReport(ceshuManager.get(req.id)))
}
