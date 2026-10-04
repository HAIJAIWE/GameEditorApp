import { z } from 'zod'

import { ATTR_TYPES } from './attrSystem'
import { CESHU_EXPORT_FORMATS } from './ceshuConstants'
import { ADJUST_MODES, BATCH_OP_KINDS } from './dataTableOps'
import { FIELD_TYPES } from './typeSchemaFile'
import type { FieldType } from './types'

/**
 * IPC 请求 schema（仅主进程导入，用于入口运行时校验）。
 * 注意：本文件包含 zod 运行时依赖，不要被 preload 直接导入。
 */

export const listItemsInputSchema = z.object({
  type: z.string().min(1)
})

export const createItemInputSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({})
})

export const deleteItemInputSchema = z.object({
  id: z.string().min(1)
})

export const importLegacyInputSchema = z.object({
  path: z.string().min(1)
})

export const updateItemInputSchema = z.object({
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown())
})

export const exportLegacyInputSchema = z.object({
  path: z.string().min(1)
})

/* ---- 引擎代码导出 ---- */

/** 引擎代码导出：目标引擎（当前仅支持 lua）+ 目标路径（缺扩展名时导出侧补 `.lua`） */
export const engineExportInputSchema = z.object({
  engine: z.enum(['lua']),
  path: z.string().min(1)
})

/* ---- 数据表批量操作 ---- */

export const batchOpSchema = z
  .object({
    kind: z.enum(BATCH_OP_KINDS),
    field: z.string().min(1).max(64),
    value: z.string().max(5000).default(''),
    separator: z.string().max(20).default(','),
    mode: z.enum(ADJUST_MODES).default('add'),
    adjust: z.number().int().min(-99999).max(99999).default(0)
  })
  .superRefine((op, ctx) => {
    if (op.kind === 'append_value' && op.value === '') {
      ctx.addIssue({ code: 'custom', message: '请填写追加内容' })
    }
    if (op.kind === 'add_tag' && op.value === '') {
      ctx.addIssue({ code: 'custom', message: '请填写标签内容' })
    }
  })

export const batchUpdateInputSchema = z.object({
  type: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(5000),
  op: batchOpSchema
})

export const deleteManyInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000)
})

export const referencesInputSchema = z.object({
  id: z.string().min(1)
})

/* ---- 数据类型 schema（字段结构编辑器） ---- */

export const typeFieldDefSchema = z.object({
  name: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  type: z.enum(FIELD_TYPES as [FieldType, ...FieldType[]]),
  editable: z.boolean(),
  values: z.array(z.string().max(500)).max(500).optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  refType: z.string().max(64).optional()
})

export const dataTypeDefSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  pluralKey: z.string().min(1).max(64),
  color: z.string().max(40),
  formFields: z.array(typeFieldDefSchema).min(1).max(300)
})

export const schemaSaveInputSchema = z.object({
  types: z.array(dataTypeDefSchema).min(1).max(100)
})

/* ---- 属性系统 ---- */

export const attrFormulaSchema = z.object({
  coefficients: z.record(z.string().min(1).max(64), z.number()),
  baseValue: z.number()
})

export const attrDefinitionSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(ATTR_TYPES),
  category: z.string().max(64),
  displayName: z.string().max(64),
  minValue: z.number(),
  maxValue: z.number().nullable(),
  defaultValue: z.number(),
  formula: attrFormulaSchema
})

const attrSystemSchema = z.object({
  attributes: z.record(z.string().min(1).max(64), attrDefinitionSchema)
})

export const attrSystemSaveInputSchema = z.object({
  system: attrSystemSchema
})

/** 导出游戏配置：路径 + 当前草稿系统（导出未保存的编辑，对应 Python 就地编辑后导出） */
export const attrGameConfigExportInputSchema = z.object({
  path: z.string().min(1),
  system: attrSystemSchema
})

/** 导出属性系统 JSON：路径 + 当前草稿系统 */
export const attrSystemJsonExportInputSchema = z.object({
  path: z.string().min(1),
  system: attrSystemSchema
})

/** 导入属性系统 JSON：仅路径（主进程读文件并解析） */
export const attrSystemJsonImportInputSchema = z.object({
  path: z.string().min(1)
})

/** 属性系统 JSON 文件选择对话框（mode 区分导入/导出；导出可用 defaultName 预填文件名） */
export const attrJsonDialogInputSchema = z.object({
  mode: z.enum(['open', 'save']),
  defaultName: z.string().max(200).optional()
})

/* ---- 策划书（GDD） ---- */

export const ceshuCreateInputSchema = z.object({
  name: z.string().max(200).default(''),
  scope: z.enum(['full', 'lite']).default('full')
})

export const ceshuGetInputSchema = z.object({
  id: z.string().min(1)
})

/** 库管理（A2-1）：新建库 */
export const libraryCreateInputSchema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional()
})

/** 库管理：重命名库 */
export const libraryRenameInputSchema = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40)
})

/** 库管理：按库名操作（删除 / 切换） */
export const libraryNameInputSchema = z.object({
  name: z.string().min(1).max(40)
})

/** Agent Brain：审批回传（渲染层弹模态后按 requestId 回传决定） */
export const agentApprovalResponseInputSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean()
})

/** Agent Brain：技能交互答复（确认破坏性动作 / 回答提问） */
export const agentInteractionResponseInputSchema = z
  .object({
    requestId: z.string().min(1),
    approved: z.boolean().optional(),
    answer: z.string().max(4000).optional(),
    /** 多问题答复：按下标对齐（与 questions 顺序一致） */
    answers: z.array(z.string().max(4000)).max(20).optional()
  })
  .refine(
    (value) => value.approved !== undefined || value.answer !== undefined || value.answers !== undefined,
    { message: '必须提供 approved、answer 或 answers' }
  )

/** Agent Brain：跑一轮对话循环（输入用户消息，返回事件流与最终文本） */
export const agentChatInputSchema = z.object({
  input: z.string().min(1).max(4000)
})

/** Agent 技能调度：执行工具（tool 为技能 id 或可模糊解析的别名） */
export const agentExecuteToolInputSchema = z.object({
  tool: z.string().min(1).max(80),
  params: z.record(z.string(), z.unknown()).default({})
})

/** 首页卡片：重命名策划书（对齐 Python `rename_ceshu`，名称非空） */
export const ceshuRenameInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200)
})

export const ceshuSaveChapterInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  /** 同时写回的文档级字段（一键生成应用时写入风格/类型 key） */
  style: z.string().max(50).optional(),
  moduleType: z.string().max(50).optional()
})

export const ceshuExportInputSchema = z.object({
  id: z.string().min(1),
  format: z.enum(CESHU_EXPORT_FORMATS),
  path: z.string().min(1)
})

export const ceshuChooseExportFileInputSchema = z.object({
  format: z.enum(CESHU_EXPORT_FORMATS),
  defaultName: z.string().max(200).default('策划书')
})

export const ceshuDeriveInputSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(500).default('')
})

/** 混合玩法预设市场：应用某个预设到当前策划书 */
export const ceshuApplyPresetInputSchema = z.object({
  id: z.string().min(1),
  presetKey: z.string().min(1).max(50)
})

/** 系统确认：确认/调整游戏系统（对齐 Python SystemConfirmDialog._on_confirm） */
export const ceshuConfirmSystemsInputSchema = z.object({
  id: z.string().min(1),
  enabledKeys: z.array(z.string().min(1).max(64)).max(200),
  customSystems: z
    .array(z.object({ key: z.string().min(1).max(64), name: z.string().min(1).max(120) }))
    .max(200)
    .default([])
})

/** 数据同步：双向同步策划书 systems ↔ 游戏数据（对齐 Python CeshuDataSync.syncBoth） */
export const ceshuSyncDataInputSchema = z.object({
  id: z.string().min(1)
})

export const ceshuAiGenerateInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  onlyEmpty: z.boolean().default(false),
  /** 一键生成上下文：draft 仅合并进提示词作为上下文，不写盘 */
  fullGenerate: z
    .object({
      styleKey: z.string().max(50).default(''),
      extraPrompt: z.string().max(6000).default(''),
      draft: z.record(z.string(), z.record(z.string(), z.unknown())).default({})
    })
    .optional()
})

/** AI 生成候选游戏数据（数值/系统章作为设定 → 候选 → 人工导入） */
export const ceshuDataGenInputSchema = z.object({
  id: z.string().min(1),
  dataTypes: z.array(z.string().max(50)).max(30).default([]),
  count: z.number().int().min(1).max(20).default(5),
  instruction: z.string().max(500).default('')
})

/** AI 审阅报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuReviewExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 完备性检查报告导出（同上：渲染层生成 Markdown，主进程原子写盘） */
export const ceshuChecklistExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 版本对比：两个不同版本 id */
export const ceshuDiffInputSchema = z.object({
  id: z.string().min(1),
  otherId: z.string().min(1)
})

/** 版本对比报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuDiffExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/* ---- 章节笔记 ---- */

export const notesListInputSchema = z.object({
  id: z.string().min(1),
  chapterKey: z.string().max(50).optional()
})

export const notesAddInputSchema = z.object({
  id: z.string().min(1),
  chapterKey: z.string().min(1).max(50),
  content: z.string().max(20000).default(''),
  author: z.string().max(100).optional()
})

export const notesUpdateInputSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
  content: z.string().max(20000).default(''),
  author: z.string().max(100).optional()
})

export const notesDeleteInputSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1)
})

/* ---- 自定义模板 ---- */

export const templatesListInputSchema = z.object({
  chapterKey: z.string().max(50).optional()
})

export const templatesSaveInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  tags: z.array(z.string().max(50)).max(50).default([]),
  /** 所属章节键；空串表示全局模板 */
  chapterKey: z.string().max(50).default(''),
  data: z.record(z.string(), z.unknown()).default({}),
  sourceGame: z.string().max(200).default('')
})

export const templatesDeleteInputSchema = z.object({
  id: z.string().min(1)
})

export const templatesUpdateInputSchema = z.object({
  id: z.string().min(1),
  /** 名称传空串时由存储层判定为「更新失败」（对应 Python update_template 的 False） */
  name: z.string().max(200).default(''),
  description: z.string().max(2000).default(''),
  tags: z.array(z.string().max(50)).max(50).default([]),
  chapterKey: z.string().max(50).default(''),
  data: z.record(z.string(), z.unknown()).default({}),
  sourceGame: z.string().max(200).default('')
})

export const templatesExportInputSchema = z.object({
  path: z.string().min(1)
})

export const templatesImportInputSchema = z.object({
  path: z.string().min(1),
  overwrite: z.boolean().default(false)
})

/** 模板 JSON 文件选择（open=导入 / save=导出），与 attr 侧 dialog 通道同构 */
export const templateJsonDialogInputSchema = z.object({
  mode: z.enum(['open', 'save']),
  defaultName: z.string().max(200).optional()
})

export type ListItemsInput = z.infer<typeof listItemsInputSchema>
export type CreateItemInput = z.infer<typeof createItemInputSchema>
export type DeleteItemInput = z.infer<typeof deleteItemInputSchema>
export type ImportLegacyInput = z.infer<typeof importLegacyInputSchema>
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>
export type ExportLegacyInput = z.infer<typeof exportLegacyInputSchema>
export type EngineExportInput = z.infer<typeof engineExportInputSchema>
export type BatchOpInput = z.infer<typeof batchOpSchema>
export type BatchUpdateInput = z.infer<typeof batchUpdateInputSchema>
export type DeleteManyInput = z.infer<typeof deleteManyInputSchema>
export type ReferencesInput = z.infer<typeof referencesInputSchema>
export type SchemaSaveInput = z.infer<typeof schemaSaveInputSchema>
export type AttrSystemSaveInput = z.infer<typeof attrSystemSaveInputSchema>
export type AttrGameConfigExportInput = z.infer<typeof attrGameConfigExportInputSchema>
export type AttrSystemJsonExportInput = z.infer<typeof attrSystemJsonExportInputSchema>
export type AttrSystemJsonImportInput = z.infer<typeof attrSystemJsonImportInputSchema>
export type AttrJsonDialogInput = z.infer<typeof attrJsonDialogInputSchema>
export type CeshuCreateInput = z.infer<typeof ceshuCreateInputSchema>
export type CeshuSaveChapterInput = z.infer<typeof ceshuSaveChapterInputSchema>
export type CeshuExportInput = z.infer<typeof ceshuExportInputSchema>
export type CeshuChooseExportFileInput = z.infer<typeof ceshuChooseExportFileInputSchema>
export type CeshuDeriveInput = z.infer<typeof ceshuDeriveInputSchema>
export type CeshuRenameInput = z.infer<typeof ceshuRenameInputSchema>
export type AgentExecuteToolInput = z.infer<typeof agentExecuteToolInputSchema>
export type AgentChatInput = z.infer<typeof agentChatInputSchema>
export type AgentApprovalResponseInput = z.infer<typeof agentApprovalResponseInputSchema>
export type AgentInteractionResponseInput = z.infer<typeof agentInteractionResponseInputSchema>
export type LibraryCreateInput = z.infer<typeof libraryCreateInputSchema>
export type LibraryRenameInput = z.infer<typeof libraryRenameInputSchema>
export type LibraryNameInput = z.infer<typeof libraryNameInputSchema>
export type CeshuApplyPresetInput = z.infer<typeof ceshuApplyPresetInputSchema>
export type CeshuConfirmSystemsInput = z.infer<typeof ceshuConfirmSystemsInputSchema>
export type CeshuSyncDataInput = z.infer<typeof ceshuSyncDataInputSchema>
export type CeshuAiGenerateInput = z.infer<typeof ceshuAiGenerateInputSchema>
export type CeshuDataGenInput = z.infer<typeof ceshuDataGenInputSchema>
export type CeshuReviewExportInput = z.infer<typeof ceshuReviewExportInputSchema>
export type CeshuChecklistExportInput = z.infer<typeof ceshuChecklistExportInputSchema>
export type CeshuDiffInput = z.infer<typeof ceshuDiffInputSchema>
export type CeshuDiffExportInput = z.infer<typeof ceshuDiffExportInputSchema>
export type NotesListInput = z.infer<typeof notesListInputSchema>
export type NotesAddInput = z.infer<typeof notesAddInputSchema>
export type NotesUpdateInput = z.infer<typeof notesUpdateInputSchema>
export type NotesDeleteInput = z.infer<typeof notesDeleteInputSchema>
export type TemplatesListInput = z.infer<typeof templatesListInputSchema>
export type TemplatesSaveInput = z.infer<typeof templatesSaveInputSchema>
export type TemplatesDeleteInput = z.infer<typeof templatesDeleteInputSchema>
export type TemplatesUpdateInput = z.infer<typeof templatesUpdateInputSchema>
export type TemplatesExportInput = z.infer<typeof templatesExportInputSchema>
export type TemplatesImportInput = z.infer<typeof templatesImportInputSchema>
export type TemplateJsonDialogInput = z.infer<typeof templateJsonDialogInputSchema>