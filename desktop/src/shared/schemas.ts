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

/* ---- 游戏数据 CSV / Excel 导入导出（features/export.py 迁移） ---- */

/** 导出目录（CSV 按类型分文件 / Excel 写 game_data.xlsx） */
export const exportDirInputSchema = z.object({
  dir: z.string().min(1)
})

/** 导入源文件路径（CSV / Excel） */
export const importDataFileInputSchema = z.object({
  path: z.string().min(1)
})

/* ---- AI 生图（features/_ai_image.py 能力缺口补齐：云图像 API 客户端） ---- */

/** 生图 provider 配置（对齐 Python common/ai_client.generate_image） */
export const imageGenConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['openai', 'qwen', 'doubao', 'generic']),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  modelOverrides: z
    .object({
      image: z
        .object({
          model: z.string().optional(),
          apiKey: z.string().optional(),
          baseUrl: z.string().optional()
        })
        .optional()
    })
    .optional()
})

/** 生图请求：配置 + 提示词 + 落盘目录（+ 可选文件名） */
export const imageGenInputSchema = z.object({
  config: imageGenConfigSchema,
  prompt: z.string().min(1),
  saveDir: z.string().min(1),
  filename: z.string().optional()
})

export type ImageGenInput = z.infer<typeof imageGenInputSchema>

/* ---- 系统钥匙串（API Key 等敏感配置，主进程用 Electron safeStorage 加密落盘） ---- */

/**
 * 密钥操作的通用入参（`hasSecret` / `deleteSecret` 共用）。
 * 这里只做「是字符串、长度不越界」的粗校验；**字符集的严格校验（禁路径分隔符 / `..`）
 * 放在主进程**，用 `main/settings/secretStore.ts` 的 `isValidSecretName` 复核，
 * 避免 shared 反向依赖 main。
 */
export const secretNameInputSchema = z.object({
  name: z.string().min(1).max(64)
})

/**
 * 写入密钥：明文只用于主进程加密落盘。
 * 长度上限 4096 与 `secretStore` 的 `MAX_SECRET_LENGTH` 一致（超长在 schema 层就挡住，
 * 避免把整份文档误当密钥存进去）。
 */
export const setSecretInputSchema = z.object({
  name: z.string().min(1).max(64),
  plaintext: z.string().min(1).max(4096)
})

export type SecretNameInput = z.infer<typeof secretNameInputSchema>
export type SetSecretInput = z.infer<typeof setSecretInputSchema>

/* ---- 引擎代码导出 ---- */

/**
 * 引擎代码导出：目标引擎 + 目标路径（缺扩展名时导出侧按引擎补）。
 * 五个目标 = `lua` + 对齐 PyQt `features/engine_export.py` 的四个引擎
 * （Unity/Unreal/Godot/Cocos2d 产物分别为 `.cs` / `.h` / `.gd` / `.json`）。
 */
/** AI 对话草稿：保存当前会话为草稿（对齐 PyQt 数字员工面板的草稿管理） */
export const agentDraftSaveInputSchema = z.object({
  /** 草稿名（空串会被主进程回落成 `对话草稿_MMDD_HHMM`；限长防超长文件名） */
  name: z.string().max(80)
})

/** AI 对话草稿：读取指定草稿 */
export const agentDraftLoadInputSchema = z.object({
  /** 草稿绝对路径（由 `agent:draftList` 返回，UI 不自行拼接） */
  path: z.string().min(1)
})

/* ---- 字段级 AI 辅助（对齐 Python `features/_ai_image.py` 的 desc 生成） ---- */

/** 单次文本生成的入参 */
export const llmGenerateInputSchema = z.object({
  /** 系统提示（缺省则用一个通用的「游戏文案助手」人格） */
  system: z.string().max(4000).default(''),
  /** 用户提示（必填；组装逻辑在 shared/fieldAiAssist，渲染层只传结果） */
  prompt: z.string().min(1).max(20000)
})

export type LlmGenerateInput = z.infer<typeof llmGenerateInputSchema>

export const engineTargetSchema = z.enum(['lua', 'unity', 'unreal', 'godot', 'cocos2d'])

export const engineExportInputSchema = z.object({
  engine: engineTargetSchema,
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

/** 字段 ID 的 AI 候选请求（术语表未收录时使用） */
export const fieldIdSuggestInputSchema = z.object({
  label: z.string().min(1).max(64),
  existingNames: z.array(z.string().max(64)).max(500),
  typeName: z.string().max(64).optional(),
  fieldType: z.string().max(32).optional()
})

/** 用户自定义字段模板：保存（新建/覆盖）。存完整字段定义，非 Python 那样只存标签 */
export const fieldTemplateSaveInputSchema = z.object({
  name: z.string().min(1).max(40),
  fields: z.array(typeFieldDefSchema).min(1).max(300)
})

/** 用户自定义字段模板：按名操作（读取 / 删除） */
export const fieldTemplateNameInputSchema = z.object({
  name: z.string().min(1).max(40)
})

/** 渲染层转发到主进程的日志条目 */
export const appLogInputSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().min(1).max(4096),
  meta: z.unknown().optional()
})

/** 渲染层上报最后停留的界面模式（落进 window-state.json，下次启动恢复） */
export const windowModeInputSchema = z.object({
  mode: z.enum(['data', 'ceshu', 'digital'])
})
export type WindowModeInput = z.infer<typeof windowModeInputSchema>

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

/** 引擎代码导出（E2）：选择导出文件路径（`engine` 决定默认扩展名与过滤器标题） */
export const engineExportFileDialogInputSchema = z.object({
  defaultName: z.string().min(1).max(120),
  engine: engineTargetSchema.default('lua')
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

/** Agent 反馈：评分（1-5）+ 可选评论；评分 ≥4 且评论非空时提炼偏好写入偏好库 */
export const agentFeedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(4000).default('')
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

/* ---- 备份（数据安全，破坏性操作带 confirm 布尔位） ---- */

/** 创建备份：可选标签（[A-Za-z0-9_-]{1,40}），用于区分同秒内的多次备份 */
export const backupCreateInputSchema = z.object({
  label: z.string().max(40).optional()
})

/** 恢复备份：confirm 必须为 true —— 主进程再做一次校验（渲染层的确认可被绕过） */
export const backupRestoreInputSchema = z.object({
  name: z.string().min(1),
  confirm: z.boolean()
})

/** 删除备份：软删除（改名），仍需 confirm */
export const backupDeleteInputSchema = z.object({
  name: z.string().min(1),
  confirm: z.boolean()
})

export type ListItemsInput = z.infer<typeof listItemsInputSchema>
export type CreateItemInput = z.infer<typeof createItemInputSchema>
export type DeleteItemInput = z.infer<typeof deleteItemInputSchema>
export type ImportLegacyInput = z.infer<typeof importLegacyInputSchema>
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>
export type ExportLegacyInput = z.infer<typeof exportLegacyInputSchema>
export type ExportDirInput = z.infer<typeof exportDirInputSchema>
export type ImportDataFileInput = z.infer<typeof importDataFileInputSchema>
export type EngineExportInput = z.infer<typeof engineExportInputSchema>
export type BatchOpInput = z.infer<typeof batchOpSchema>
export type BatchUpdateInput = z.infer<typeof batchUpdateInputSchema>
export type DeleteManyInput = z.infer<typeof deleteManyInputSchema>
export type ReferencesInput = z.infer<typeof referencesInputSchema>
export type SchemaSaveInput = z.infer<typeof schemaSaveInputSchema>
export type FieldTemplateSaveInput = z.infer<typeof fieldTemplateSaveInputSchema>
export type FieldTemplateNameInput = z.infer<typeof fieldTemplateNameInputSchema>
export type FieldIdSuggestInput = z.infer<typeof fieldIdSuggestInputSchema>
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
export type AgentDraftSaveInput = z.infer<typeof agentDraftSaveInputSchema>
export type AgentDraftLoadInput = z.infer<typeof agentDraftLoadInputSchema>
export type AgentFeedbackInput = z.infer<typeof agentFeedbackInputSchema>
export type AgentChatInput = z.infer<typeof agentChatInputSchema>
export type AgentApprovalResponseInput = z.infer<typeof agentApprovalResponseInputSchema>
export type AgentInteractionResponseInput = z.infer<typeof agentInteractionResponseInputSchema>
export type EngineExportFileDialogInput = z.infer<typeof engineExportFileDialogInputSchema>
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
export type BackupCreateInput = z.infer<typeof backupCreateInputSchema>
export type BackupRestoreInput = z.infer<typeof backupRestoreInputSchema>
export type BackupDeleteInput = z.infer<typeof backupDeleteInputSchema>