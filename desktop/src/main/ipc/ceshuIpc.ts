import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  ceshuAiGenerateInputSchema,
  ceshuAiGenerateFieldInputSchema,
  ceshuApplyPresetInputSchema,
  ceshuChangelogExportInputSchema,
  ceshuCloneDecomposeInputSchema,
  ceshuConfirmSystemsInputSchema,
  ceshuCreateInputSchema,
  ceshuDataGenInputSchema,
  ceshuDeleteInputSchema,
  ceshuDeriveInputSchema,
  ceshuDiffExportInputSchema,
  ceshuDiffInputSchema,
  ceshuExportInputSchema,
  ceshuExportProjectInputSchema,
  ceshuOpenProjectInputSchema,
  ceshuAiTasksInputSchema,
  ceshuSaveDemoInputSchema,
  ceshuCheckContractInputSchema,
  ceshuCheckDataTablesInputSchema,
  ceshuScaffoldDataTablesInputSchema,
  ceshuGetInputSchema,
  ceshuMigrateFieldSplitsInputSchema,
  ceshuRenameInputSchema,
  ceshuReviewExportInputSchema,
  ceshuSaveChapterInputSchema,
  ceshuReadinessExportInputSchema,
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
} from '../../shared/schema/schemas'
import { CHAPTER_LABELS, isChapterKey, type ChapterKey, type SystemEntry } from '../../shared/ceshu/reference/ceshuConstants'
import type { DataTypeDef } from '../../shared/types'
import { CESHU_CHAPTER_FIELDS } from '../../shared/ceshu/fields/ceshuFields'
import {
  cloneDecomposeTask,
  generateChapterTask,
  generateDataTask,
  generateFieldTask,
  generateRoleTasksTask,
  reviewTask
} from '../ceshu/ai/ceshu'
import { CLONE_CONCEPT_CHAPTERS } from '../../shared/ceshu/prompts/ceshuClonePrompt'
import { checkContract } from '../../shared/ceshu/validation/ceshuContract'
import {
  checkDataTablePlan,
  parseDataTableRequirements,
  readDataTableRows,
  type DataTableActual
} from '../../shared/ceshu/data/ceshuDataTableCheck'
import { applyDataTableScaffold, planDataTableScaffold } from '../../shared/ceshu/data/ceshuDataTableScaffold'
import { buildVersionDiff } from '../../shared/ceshu/workflow/ceshuDiff'
import { formatLocalTimestamp } from '../../shared/util/datetime'
import { buildSystemConfirmResult } from '../../shared/ceshu/prompts/ceshuSystemConfirm'
import { computeReadiness } from '../../shared/ceshu/readiness/ceshuReadiness'
import { validateCeshu } from '../../shared/ceshu/validation/ceshuValidation'
import { exportCeshuDocument } from '../ceshu/export/exporter'
import { exportHandoff } from '../ceshu/export/handoff'
import { exportProjectFolder } from '../ceshu/export/projectFolder'
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
    // 系统章/元信息章保存后，确保启用系统的数据结构已注册
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
    // 对齐 旧版 `editor_view_mixins:833`：确认后置 `meta.system_confirmed`，
    // 之后再次打开该策划书就不再自动弹确认对话框
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
  handle('ceshu:readiness', ceshuGetInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    // 校验结果只算一次：既喂完备度（同源），又避免与 validate 通道口径漂移
    return computeReadiness(doc, validateCeshu(doc))
  })
  handle('ceshu:aiGenerateChapter', ceshuAiGenerateInputSchema, async (req, event) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    // 显式收窄成 const：属性访问的类型收窄不跨入异步调用
    const chapter: ChapterKey = req.chapter
    // 编排（提示词 / 预算门 / 取消 / 质量门 / 判官）全部在 `main/ceshu/ai/ceshu`，
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
  handle('ceshu:cloneDecompose', ceshuCloneDecomposeInputSchema, async (req, event) => {
    // 编排（提示词/预算/解析）在 `main/ceshu/ai/ceshu`；这里只负责新建文档 + 逐章落盘
    const task = await cloneDecomposeTask(
      { llm, client: llmClient },
      {
        gameName: req.gameName,
        ...(req.gameType !== undefined ? { gameType: req.gameType } : {}),
        senderId: event.sender.id
      }
    )
    let doc = await ceshuManager.create({ scope: 'full', name: req.gameName })
    for (const chapter of CLONE_CONCEPT_CHAPTERS) {
      const data = task.fields[chapter]
      if (data === undefined) continue
      doc = await ceshuManager.saveChapter(doc.ceshu_id, chapter, data)
    }
    return { doc, model: task.model }
  })
  handle('ceshu:exportProjectFolder', ceshuExportProjectInputSchema, (req) => {
    return exportProjectFolder(ceshuManager.get(req.id), req.path)
  })
  // 开发交接包：分卷规格（架构→玩法→内容→系统→界面→打磨）+ 机读包 + 契约 + 数据表快照 + 原型。
  // 输入契约与「导出项目文件夹」同形（id + 目标目录），故复用同一 zod schema。
  handle('ceshu:exportHandoff', ceshuExportProjectInputSchema, (req) => {
    return exportHandoff(ceshuManager.get(req.id), req.path, {
      generatedAt: formatLocalTimestamp(),
      types: typeSchemaStore.getTypes(),
      items: dataService.listAllItems()
    })
  })
  // 打开项目文件夹：读目录 → 还原文档 → 在本库落地为项目文件夹（之后 save 自动走文件夹形态）
  handle('ceshu:openProjectFolder', ceshuOpenProjectInputSchema, async (req) => {
    const doc = await ceshuManager.openProjectFolder(req.path)
    return { doc }
  })
  // 保存可玩原型：落盘到项目文件夹 prototype/demo.html（原型也是交付物）
  handle('ceshu:saveDemo', ceshuSaveDemoInputSchema, async (req) => {
    const doc = await ceshuManager.saveDemo(req.id, req.html)
    return { doc }
  })
  /*
   * 设计 ↔ 数据表核对：策划书「所需数据表」（tech.data_tables）vs 数据编辑器里的实际表。
   * 这里只负责把两侧凑齐（文档 + SQLite 现状），判断逻辑在 shared/ceshuDataTableCheck（纯函数）。
   */
  /** 数据编辑器现状摘要（核对与补齐共用，避免两处各写一份统计口径） */
  const readDataTableActual = (types: readonly DataTypeDef[]): DataTableActual[] =>
    types.map((def) => ({
      typeId: def.id,
      typeName: def.name,
      count: dataService.listItems(def.id).length,
      fieldNames: def.formFields.map((field) => field.name),
      fieldLabels: def.formFields.map((field) => field.label)
    }))

  /*
   * 设计契约体检：把「散在各章的可验证承诺」投影成一份机读契约并整体检查。
   * 与 `validateCeshu` 的分工：那个逐条给编辑中的作者报错；这个是交付前的一次性
   * 盖章（PASS/FAIL + 规则集标识），可序列化、可与原型 Demo 的 RULESET 比对。
   */
  handle('ceshu:checkContract', ceshuCheckContractInputSchema, (req) => {
    return checkContract(ceshuManager.get(req.id))
  })
  handle('ceshu:checkDataTables', ceshuCheckDataTablesInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    const types = typeSchemaStore.getTypes()
    const requirements = parseDataTableRequirements(readDataTableRows(doc))
    return checkDataTablePlan(requirements, readDataTableActual(types))
  })
  /*
   * 按声明补齐结构：**只建表/加字段，不造数据行**。
   * 声明写「期望 200 条」不等于让系统凭空生成 200 条空记录——那是往库里灌垃圾，
   * 真正的数值还得人来定。条数缺口仍然由核对面板继续报。
   */
  handle('ceshu:planDataTableScaffold', ceshuScaffoldDataTablesInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    const types = typeSchemaStore.getTypes()
    const requirements = parseDataTableRequirements(readDataTableRows(doc))
    return planDataTableScaffold(requirements, readDataTableActual(types), types)
  })
  handle('ceshu:applyDataTableScaffold', ceshuScaffoldDataTablesInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    const types = typeSchemaStore.getTypes()
    const requirements = parseDataTableRequirements(readDataTableRows(doc))
    const plan = planDataTableScaffold(requirements, readDataTableActual(types), types)

    // 没有要改的就别碰 schema 文件（避免无意义重写 + mtime 抖动）
    if (plan.createTypeCount === 0 && plan.addFieldCount === 0) {
      return { plan, createTypeCount: 0, addFieldCount: 0, check: checkDataTablePlan(requirements, readDataTableActual(types)) }
    }

    // saveTypes 内部走 validateTypeSchema：字段名/首字段 id 等不合法会抛中文错误，这里不吞
    const savedTypes = typeSchemaStore.saveTypes(applyDataTableScaffold(types, plan))
    return {
      plan,
      createTypeCount: plan.createTypeCount,
      addFieldCount: plan.addFieldCount,
      check: checkDataTablePlan(requirements, readDataTableActual(savedTypes))
    }
  })
  // 岗位任务生成：整份文档 → 各岗位可执行任务；编排在 main/ceshu/ai/ceshu，这里只落盘
  handle('ceshu:aiGenerateTasks', ceshuAiTasksInputSchema, async (req, event) => {
    const base = ceshuManager.get(req.id)
    const task = await generateRoleTasksTask(
      { llm, client: llmClient },
      {
        base,
        ...(req.roles !== undefined ? { roles: req.roles } : {}),
        senderId: event.sender.id
      }
    )
    const doc = await ceshuManager.saveTaskPlan(req.id, task.plan)
    return { doc, plan: task.plan, model: task.model }
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
      {
        base,
        chapter,
        field: req.field,
        ...(req.action !== undefined ? { action: req.action } : {}),
        senderId: event.sender.id
      }
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
  // 字段拆分迁移（幂等、非破坏）：大 textarea → 要点列表 + 补充说明，原文保留
  handle('ceshu:migrateFieldSplits', ceshuMigrateFieldSplitsInputSchema, (req) => ceshuManager.migrateFieldSplits(req.id))
  handle('ceshu:diff', ceshuDiffInputSchema, (req) => {
    if (req.id === req.otherId) {
      throw new Error('请选择两个不同的版本')
    }
    return buildVersionDiff(ceshuManager.get(req.id), ceshuManager.get(req.otherId))
  })
  handle('ceshu:exportDiffReport', ceshuDiffExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '对比报告')
  )
  handle('ceshu:exportReadinessReport', ceshuReadinessExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '完备度报告')
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
