import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  ceshuApplyPresetInputSchema,
  ceshuCloneDecomposeInputSchema,
  ceshuConfirmSystemsInputSchema,
  ceshuCreateInputSchema,
  ceshuDeleteInputSchema,
  ceshuDeriveInputSchema,
  ceshuExportInputSchema,
  ceshuExportProjectInputSchema,
  ceshuOpenProjectInputSchema,
  ceshuAiTasksInputSchema,
  ceshuSaveDemoInputSchema,
  ceshuCheckContractInputSchema,
  ceshuCheckDataTablesInputSchema,
  ceshuScaffoldDataTablesInputSchema,
  ceshuWorkOrderInputSchema,
  ceshuWorkOrderProgressInputSchema,
  ceshuGetInputSchema,
  ceshuMigrateFieldSplitsInputSchema,
  ceshuRenameInputSchema,
  ceshuSaveChapterInputSchema,
  ceshuSyncDataInputSchema
} from '@mobai/shared/schema/adapters'
import {
  ceshuAiGenerateInputSchema,
  ceshuAiGenerateFieldInputSchema,
  ceshuDataGenInputSchema
} from '@mobai/shared/schema/adapters'
import {
  ceshuChangelogExportInputSchema,
  ceshuDiffExportInputSchema,
  ceshuDiffInputSchema,
  ceshuReviewExportInputSchema,
  ceshuReadinessExportInputSchema,
  ceshuValidationExportInputSchema
} from '@mobai/shared/schema/adapters'
import {
  notesAddInputSchema,
  notesDeleteInputSchema,
  notesListInputSchema,
  notesUpdateInputSchema
} from '@mobai/shared/schema/adapters'
import {
  templatesDeleteInputSchema,
  templatesExportInputSchema,
  templatesImportInputSchema,
  templatesListInputSchema,
  templatesSaveInputSchema,
  templatesUpdateInputSchema
} from '@mobai/shared/schema/adapters'
import { isChapterKey, type SystemEntry } from '@mobai/shared/ceshu/reference'
import { chapterDataForDoc, chapterFieldsForDoc, chapterLabelForDoc, isChapterAllowedForDoc } from '@mobai/shared/ceshu/model'
import type { DataTypeDef } from '@mobai/shared/types'
import {
  cloneDecomposeTask,
  generateChapterTask,
  generateDataTask,
  generateFieldTask,
  generateRoleTasksTask,
  reviewTask
} from '../ceshu/ai/ceshu'
import { CLONE_CONCEPT_CHAPTERS } from '@mobai/shared/ceshu/prompts'
import { checkContract } from '@mobai/shared/ceshu/validation'
import {
  checkDataTablePlan,
  parseDataTableRequirements,
  readDataTableRows,
  type DataTableActual
} from '@mobai/shared/ceshu/data'
import { applyDataTableScaffold, planDataTableScaffold } from '@mobai/shared/ceshu/data'
import {
  HANDOFF_PROGRESS_FILE,
  annotateHandoffProgress,
  buildHandoffProgressBoard,
  buildHandoffWorkOrder,
  buildVersionDiff,
  parseHandoffProgress,
  renderHandoffProgressBoardMarkdown
} from '@mobai/shared/ceshu/workflow'
import { formatLocalTimestamp } from '@mobai/shared/util/datetime'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getWorkspaceRoot } from '@mobai/agent-core/workspace/workspaceStore'
import { buildSystemConfirmResult } from '@mobai/shared/ceshu/prompts'
import { computeReadiness } from '@mobai/shared/ceshu/readiness'
import { validateCeshu } from '@mobai/shared/ceshu/validation'
import { exportCeshuDocument } from '../ceshu/export/exporter'
import { exportHandoff, handoffFolderName } from '../ceshu/export/delivery/handoff'
import { exportProjectFolder } from '../ceshu/export/delivery/projectFolder'
import { exportTextReportFile } from '../ceshu/reportExport'

export function registerCeshuIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const {
    ceshuManager,
    ceshuNotesStore,
    ceshuTemplateStore,
    typeSchemaStore,
    dataService,
    dataSync,
    llmClient,
    libraryManager
  } = deps

  handle('ceshu:list', undefined, () => ceshuManager.list())
  handle('ceshu:create', ceshuCreateInputSchema, (req) => ceshuManager.create(req))
  handle('ceshu:get', ceshuGetInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    dataSync.setCurrentCeshu(req.id)
    return doc
  })
  handle('ceshu:saveChapter', ceshuSaveChapterInputSchema, async (req) => {
    if (!isChapterAllowedForDoc(ceshuManager.get(req.id), req.chapter)) {
      throw new Error(`未知小节：${req.chapter}`)
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
    const base = ceshuManager.get(req.id)
    if (!isChapterAllowedForDoc(base, req.chapter)) {
      throw new Error(`未知小节：${req.chapter}`)
    }
    const chapter: string = req.chapter
    // 编排（提示词 / 预算门 / 取消 / 质量门 / 判官）全部在 `main/ceshu/ai/ceshu`，
    // 此处只负责取文档与转交渲染层入参，见该文件顶部说明。
    return generateChapterTask(
      { llm, client: llmClient },
      {
        base,
        draft: req.fullGenerate?.draft ?? {},
        chapter,
        onlyEmpty: req.onlyEmpty,
        styleKey: req.fullGenerate?.styleKey,
        extraPrompt: req.fullGenerate?.extraPrompt,
        generationOrder: req.fullGenerate?.generationOrder,
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
  // 派工单：把刚导出的交接包翻译成「编码智能体开工的第一句话」。
  // 只读两处：工作区根的 `进度.md`（上一轮做完没做完）与交接包目录反查工作区。
  // 不派活、不落盘——渲染层拿到 markdown 后预填进智能体输入框，由用户确认再发送。
  handle('ceshu:workOrder', ceshuWorkOrderInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    // 交接包目录：渲染层刚导出过就传进来；施工看板的「派这一份」不持有目录，
    // 按 exportHandoff 的落点公式反推（<活跃库>/exports/<游戏名>-交接包）。
    // 反推出的目录不存在 = 这份文档还没导出过交接包 ⇒ 就地补导出一次（落在库里，
    // 与菜单导出的默认落点同一处），否则派工单会指向一堆不存在的文件。
    let bundleDir = req.bundleDir ?? ''
    let exported = false
    if (bundleDir === '') {
      const targetDir = join(libraryManager.activeDir(), 'exports')
      bundleDir = join(targetDir, handoffFolderName(doc))
      if (!existsSync(bundleDir)) {
        exportHandoff(doc, targetDir, {
          generatedAt: formatLocalTimestamp(),
          types: typeSchemaStore.getTypes(),
          items: dataService.listAllItems()
        })
        exported = true
      }
    }
    const workspace = getWorkspaceRoot()
    const progressPath = join(workspace, HANDOFF_PROGRESS_FILE)
    const progress = existsSync(progressPath) ? readFileSync(progressPath, 'utf-8') : ''
    // 验收现状：把「这一份现在到底算不算做完」的机器判定来源一起注入，
    // 派工单才能写「a1 已通过 / a2 未过」，而不是只列 5 种判定方式让人自己猜。
    const contract = checkContract(doc).contract
    const dataTables = checkDataTablePlan(
      parseDataTableRequirements(readDataTableRows(doc)),
      readDataTableActual(typeSchemaStore.getTypes())
    )
    const order = buildHandoffWorkOrder(doc, {
      bundleDir,
      workspace,
      completed: parseHandoffProgress(progress),
      ...(req.targetPath !== undefined ? { targetPath: req.targetPath } : {}),
      context: { doc, contract, dataTables }
    })
    return {
      markdown: order.markdown,
      bundleDir,
      exported,
      targetPath: order.target?.path ?? null,
      requestedPath: order.requestedPath,
      applicableCount: order.applicableCount,
      readyCount: order.readyCount,
      doneCount: order.doneCount,
      remaining: order.remaining,
      acceptance: order.target?.verdicts ?? null
    }
  })
  /*
   * 施工看板：一次算清「这么多份交接文档现在做到哪了、下一份做谁」。
   *
   * 与派工单的分工：派工单只把「下一份」翻译成开工指令；看板给的是全局——
   * 每份的机判结论、工序状态、剩余份数，并把成绩单贴回工作区的 `进度.md`。
   *
   * 只认两处事实：`进度.md` 的施工记录（人/智能体自己写的）与策划书侧的机判
   * （契约 + 数据表 + 断言）。机判**不**替人盖章：记录写完成但机判有 fail ⇒ 降级成
   * 「需返工」，记录为空 ⇒ 一律不算完成（否则就退回「AI 自述完成」的老路）。
   */
  handle('ceshu:workOrderProgress', ceshuWorkOrderProgressInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    const workspace = getWorkspaceRoot()
    const progressPath = join(workspace, HANDOFF_PROGRESS_FILE)
    const previous = existsSync(progressPath) ? readFileSync(progressPath, 'utf-8') : ''
    const contract = checkContract(doc).contract
    const dataTables = checkDataTablePlan(
      parseDataTableRequirements(readDataTableRows(doc)),
      readDataTableActual(typeSchemaStore.getTypes())
    )
    const board = buildHandoffProgressBoard(doc, {
      completed: parseHandoffProgress(previous),
      context: { doc, contract, dataTables }
    })
    const markdown = annotateHandoffProgress(previous, board, { generatedAt: formatLocalTimestamp() })
    // 写回失败不该让看板不可用（只读工作区、磁盘满、权限）——如实返回 written=false。
    let written = false
    try {
      mkdirSync(workspace, { recursive: true })
      writeFileSync(progressPath, markdown, 'utf-8')
      written = true
    } catch {
      written = false
    }
    return {
      progressPath,
      workspace,
      markdown: renderHandoffProgressBoardMarkdown(board),
      written,
      counts: board.counts,
      next: board.next,
      nextState: board.nextState,
      remaining: board.remaining,
      entries: board.entries.map((entry) => ({
        path: entry.path,
        title: entry.title,
        volumeTitle: entry.volumeTitle,
        number: entry.number,
        ready: entry.ready,
        claimed: entry.claimed,
        state: entry.state,
        note: entry.note,
        summary: entry.summary,
        failures: entry.results
          .filter((result) => result.verdict === 'fail')
          .map((result) => ({
            id: result.id,
            text: result.text,
            check: result.check,
            evidence: result.evidence
          }))
      }))
    }
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
   * 这里只负责把两侧凑齐（文档 + SQLite 现状）；判断逻辑在 `shared/ceshu/data` 的
   * `checkDataTablePlan`（纯函数），实际表现状由下方 `readDataTableActual` 汇总。
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
    const chapter: string = req.chapter
    const base = ceshuManager.get(req.id)
    if (!isChapterAllowedForDoc(base, chapter)) {
      throw new Error(`未知小节：${chapter}`)
    }
    // 校验字段属于该章表单（含既有扩展字段），避免把任意字符串喂给 LLM 当字段名。
    // 应用章的字段表/章数据/章标签一律走规格化查表，游戏档委托既有常量（零回归）。
    const allowedFields = new Set<string>([
      ...chapterFieldsForDoc(base, chapter).map((field) => field.key),
      ...Object.keys(chapterDataForDoc(base, chapter))
    ])
    if (!allowedFields.has(req.field)) {
      throw new Error(`字段「${req.field}」不在「${chapterLabelForDoc(base, chapter)}」章表单中`)
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
      throw new Error(`未知小节：${req.chapterKey}`)
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
      throw new Error(`未知小节：${req.chapterKey}`)
    }
    return ceshuTemplateStore.save(req)
  })
  handle('ceshu:templates:delete', templatesDeleteInputSchema, (req) => ceshuTemplateStore.remove(req.id))
  handle('ceshu:templates:update', templatesUpdateInputSchema, (req) => {
    if (req.chapterKey && !isChapterKey(req.chapterKey)) {
      throw new Error(`未知小节：${req.chapterKey}`)
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