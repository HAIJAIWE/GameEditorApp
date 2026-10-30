/**
 * `schemas.ts` 的纯定义层：全部 zod 运行时 schema 与 `z.infer` 类型别名。
 * 由 `schemas.ts` 再导出，外部 `import { ... } from './schemas'` 站点保持不变。
 */

import { z } from 'zod'

import { ATTR_TYPES } from './attrSystem'
import { CESHU_EXPORT_FORMATS } from './ceshuConstants'
import { FIELD_ACTIONS } from './ceshuFieldAction'
import { ADJUST_MODES, BATCH_OP_KINDS } from './util/dataTableOps'
import { FIELD_TYPES } from './typeSchemaFile'
import type { FieldType } from './types'

export const listItemsInputSchema = z.object({
  type: z.string().min(1)
})

export const createItemInputSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
  /**
   * 创建即标记为「AI 生成、待核对」。AI 数据生成面板导入时传，
   * 人工新建不传（`undefined` = 人工创建的条目，列表上不带待核对点）。
   */
  aiGeneratedAt: z.string().min(1).optional()
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

/* ---- 游戏数据 CSV / Excel 导入导出（features/export 迁移） ---- */

/** 导出目录（CSV 按类型分文件 / Excel 写 game_data.xlsx） */
export const exportDirInputSchema = z.object({
  dir: z.string().min(1)
})

/** 导入源文件路径（CSV / Excel） */
export const importDataFileInputSchema = z.object({
  path: z.string().min(1)
})

/** 导入预览：选好的文件 + 类型（决定用 Excel 还是 CSV 解析器） */
export const previewImportInputSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['excel', 'csv'])
})

/** 确认导入：带回预览时拿到的会话 id（解析结果在主进程暂存，不重复读文件） */
export const applyImportInputSchema = z.object({
  previewId: z.string().min(1)
})

/* ---- AI 生图（features/_ai_image 能力缺口补齐：云图像 API 客户端） ---- */

/** 生图 provider 配置 */
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
 * 五个目标 = `lua` + 对齐 旧版 `features/engine_export` 的四个引擎
 * （Unity/Unreal/Godot/Cocos2d 产物分别为 `.cs` / `.h` / `.gd` / `.json`）。
 */
/** AI 对话草稿：保存当前会话为草稿 */
export const agentDraftSaveInputSchema = z.object({
  /** 草稿名（空串会被主进程回落成 `对话草稿_MMDD_HHMM`；限长防超长文件名） */
  name: z.string().max(80)
})

/** AI 对话草稿：读取指定草稿 */
export const agentDraftLoadInputSchema = z.object({
  /** 草稿绝对路径（由 `agent:draftList` 返回，UI 不自行拼接） */
  path: z.string().min(1)
})

/**
 * 最近改动（操作日志）的查询条件。
 *
 * `undefined` 整体合法：旧调用方 `recentChanges()` 不带参数，不能因为新增过滤字段就报校验错。
 * `limit` 只挡明显非法值（上限 1000 远大于任何 UI 用途），真正的截断仍由 store 兜底。
 */
export const agentRecentChangesInputSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    /** 只取 `timestamp >= since` 的记录（毫秒时间戳） */
    since: z.number().nonnegative().optional(),
    conversationId: z.string().min(1).max(200).optional()
  })
  .optional()

/** 交付日志：最近交付的文件（新→旧），可按 since/conversationId 收窄 */
export const agentDeliveriesInputSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    since: z.number().nonnegative().optional(),
    conversationId: z.string().min(1).max(200).optional()
  })
  .optional()

/* ---- 字段级 AI 辅助 ---- */

/** 单次文本生成的入参 */
export const llmGenerateInputSchema = z.object({
  /** 系统提示（缺省则用一个通用的「游戏文案助手」人格） */
  system: z.string().max(4000).default(''),
  /** 用户提示（必填；组装逻辑在 shared/fieldAiAssist，渲染层只传结果） */
  prompt: z.string().min(1).max(20000)
})

export type LlmGenerateInput = z.infer<typeof llmGenerateInputSchema>

/**
 * 按路径读取图片（供「已保存的图片路径」回显预览）。
 * **刻意不收任意绝对路径**：主进程只允许读「当前库 images 目录」内的文件，
 * 越界一律拒绝 —— 渲染层永远不该有能力指定任意本地文件被读进内存。
 */
export const imageReadByPathInputSchema = z.object({
  path: z.string().min(1).max(1000)
})

export type ImageReadByPathInput = z.infer<typeof imageReadByPathInputSchema>

/**
 * LLM 非敏感配置。
 * **刻意不含 apiKey** —— Key 走 safeStorage（见 `shared/secretNames.ts` 的 `llmApiKey`）。
 */
/**
 * LLM 非敏感配置（对齐 `StoredLlmConfig` 全 17 字段）。
 *
 * ⚠️ 铁律（见 `llmConfigData.ts:240`）：本 schema 必须**镜像 `StoredLlmConfig` 的全部字段**。
 * zod `object()` 默认剥掉未知键，只改 `StoredLlmConfig` 不改这里 ⇒ 主进程静默丢字段
 * （表现为「设置存了但没用」）。历史上 `confidential` 已踩过此坑。
 * 各字段取值上下限与 `llmConfigData.ts` 的同名常量保持一致（此处用字面量，与文件既有写法统一）。
 */
export const llmConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['ollama', 'openai', 'doubao', 'qwen', 'claude', 'deepseek', 'custom']),
  model: z.string().max(200),
  baseUrl: z.string().max(500),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(32000),
  topP: z.number().min(0).max(1),
  numCtx: z.number().int().min(512).max(128000),
  repeatPenalty: z.number().min(1).max(2),
  topK: z.number().int().min(0).max(100),
  seed: z.number().int().min(-1).max(2147483647),
  mirostatMode: z.number().int().min(0).max(2),
  mirostatTau: z.number().min(0).max(10),
  mirostatEta: z.number().min(0).max(1),
  stopWords: z.string().max(2000),
  numGpu: z.number().int().min(-1).max(200),
  confidential: z.boolean()
})

/** 渲染层 → 主进程推配置镜像（启动时 + 改设置时各一次） */
export const llmConfigureInputSchema = z.object({
  config: llmConfigSchema
})

export const llmStatusInputSchema = z.object({})

/** 测试连接（E63）：无入参，主进程按当前配置镜像探活 */
export const llmTestConnectionInputSchema = z.object({})

export type LlmConfigureInput = z.infer<typeof llmConfigureInputSchema>

/* ---- 图片库扫描 / 清理（迁移 `features/advanced::cleanup_unused_images`） ---- */

/**
 * 物理删除图片。**破坏性操作**：`confirm` 必须为 `true`。
 *
 * 主进程会**再跑一次差集复核**才动手 —— 不只信渲染层传来的 `paths`。
 * 理由：渲染层算的是「扫描那一刻」的未引用集合，用户可能在此期间改了数据。
 */
export const deleteImagesInputSchema = z.object({
  paths: z.array(z.string().min(1)),
  /** 破坏性操作的显式确认位；缺失或 false 时主进程直接拒绝 */
  confirm: z.literal(true)
})

export type DeleteImagesInput = z.infer<typeof deleteImagesInputSchema>

export const engineTargetSchema = z.enum(['lua', 'unity', 'unreal', 'godot', 'cocos2d'])

export const engineExportInputSchema = z.object({
  engine: engineTargetSchema,
  path: z.string().min(1),
  /**
   * 「缺失图片即阻断」：开启时，引用到的库内图片若有缺失，导出前直接抛错、不落盘
   * （避免导出一个「数据在、图缺几张」的半成品，AI 覆盖游戏活文件时尤其危险）。
   * 默认关：保持旧行为（拷得到的拷、找不到的记 missing 不阻断）。
   */
  blockOnMissingImages: z.boolean().default(false)
})

/* ---- 数据快照导出（给人 / 给 git 审核，不是给游戏运行吃） ---- */

/** 快照格式：json = 确定性可 diff 的全量数据；csv = 单表宽表（每行一条） */
export const dataSnapshotFormatSchema = z.enum(['json', 'csv'])

/**
 * 数据快照导出：把 SQLite 全量数据 + 类型 schema 渲染成**确定性可 git diff** 的 JSON/CSV，
 * 让策划改动能在 PR 里逐行审核（SQLite 真相源本身不可读、blob diff 噪声大）。
 * 与 `engine:exportData`（给游戏运行态的产物）不同：本通道是**审查件**。
 */
export const dataSnapshotInputSchema = z.object({
  /** 目标路径（含扩展名；缺省时按 format 兜底补 .json/.csv） */
  path: z.string().min(1),
  format: dataSnapshotFormatSchema.default('json')
})

export const dataSnapshotFileDialogInputSchema = z.object({
  defaultName: z.string().min(1).max(120).optional(),
  format: dataSnapshotFormatSchema.default('json'),
  defaultPath: z.string().min(1).max(4096).optional()
})

export type DataSnapshotFormat = z.infer<typeof dataSnapshotFormatSchema>
export type DataSnapshotInput = z.infer<typeof dataSnapshotInputSchema>
export type DataSnapshotFileDialogInput = z.infer<typeof dataSnapshotFileDialogInputSchema>

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

/**
 * 清空所有数据：**破坏性**操作。
 * confirm 必须为 true —— 渲染层的二次确认可被绕过，主进程再校验一次
 * （与 `backupRestoreInputSchema` / `backupDeleteInputSchema` 同一约定）。
 */
export const clearAllInputSchema = z.object({
  confirm: z.boolean()
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

/** 类型自定义分区（可选；见 shared/types.ts 的 TypeSectionDef） */
export const typeSectionDefSchema = z.object({
  title: z.string().min(1).max(100),
  icon: z.string().max(16),
  collapsed: z.boolean().optional(),
  fields: z.array(z.string().min(1).max(64)).max(300)
})

export const dataTypeDefSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  pluralKey: z.string().min(1).max(64),
  color: z.string().max(40),
  formFields: z.array(typeFieldDefSchema).min(1).max(300),
  /**
   * 可选分区（模板/用户定义）。
   * ⚠️ **必须显式声明**：zod 默认会剥掉未声明的键 —— 漏了它，
   * `schema:save` 会在校验阶段静默丢掉 `sections`，分区设置永远存不下来。
   */
  sections: z.array(typeSectionDefSchema).max(50).optional()
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

/** 用户自定义字段模板：保存（新建/覆盖）。存完整字段定义，非 旧版 那样只存标签 */
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

/** 视图菜单动作（缩放 / 重载 / 开发者工具）：主进程对**聚焦窗口**的 webContents 执行 */
export const appViewActionSchema = z.enum(['zoomIn', 'zoomOut', 'zoomReset', 'reload', 'toggleDevTools'])

export const appViewActionInputSchema = z.object({
  action: appViewActionSchema
})

export type AppViewActionInput = z.infer<typeof appViewActionInputSchema>

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

/** 导出游戏配置：路径 + 当前草稿系统 */
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

/** 复刻拆解：给参考游戏名 + 可选品类，AI 拆成「立项一页」并新建文档 */
export const ceshuCloneDecomposeInputSchema = z.object({
  gameName: z.string().min(1).max(200),
  gameType: z.string().max(100).optional()
})

export const ceshuGetInputSchema = z.object({
  id: z.string().min(1),
  /** 云端档超预算确认标志（v0.6 M5，同 `ceshuAiGenerateInputSchema.confirmed`） */
  confirmed: z.boolean().optional()
})

/** 字段拆分迁移（幂等、非破坏）：只需要策划书 id */
export const ceshuMigrateFieldSplitsInputSchema = z.object({
  id: z.string().min(1)
})

/** 导出项目文件夹：策划书 id + 目标目录（config.json + design/*.md + tasks/*.md） */
export const ceshuExportProjectInputSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1)
})

/**
 * 打开项目文件夹（一个游戏一个文件夹）：源目录路径。
 * 主进程会校验 `config.json` 是否存在——不是项目文件夹就直接报错，避免误把任意目录导进来。
 */
export const ceshuOpenProjectInputSchema = z.object({
  path: z.string().min(1)
})

/** 岗位任务生成：策划书 id + 可选岗位子集（缺省 = 全部岗位） */
export const ceshuAiTasksInputSchema = z.object({
  id: z.string().min(1),
  roles: z.array(z.enum(['programmer', 'artist', 'tester', 'numeric', 'audio'])).optional()
})

/** 设计 ↔ 数据表核对：读某份策划书的「所需数据表」并与数据编辑器实际表比对 */
export const ceshuCheckDataTablesInputSchema = z.object({
  id: z.string().min(1)
})

/** 设计契约体检：读某份策划书，投影出机读契约并做一次整体体检 */
export const ceshuCheckContractInputSchema = z.object({
  id: z.string().min(1)
})

/** 按声明补齐数据表结构（建类型 / 加字段）：同一份入参，plan 只算不写、apply 才落盘 */
export const ceshuScaffoldDataTablesInputSchema = z.object({
  id: z.string().min(1)
})

/**
 * 保存可玩原型：策划书 id + 单文件 HTML。
 * `html` 允许空串（= 清掉已存的原型），所以不设 `.min(1)`。
 * 上限 2MB：正常原型 30-150KB，超过基本是模型吐了重复内容。
 */
export const ceshuSaveDemoInputSchema = z.object({
  id: z.string().min(1),
  html: z.string().max(2_000_000)
})

export type CeshuMigrateFieldSplitsInput = z.infer<typeof ceshuMigrateFieldSplitsInputSchema>

/**
 * 删除策划书：`confirm` 是**必填的显式确认标志**（与 `clearAllInputSchema` 同一约定）。
 *
 * 渲染层 `CeshuHomePanel` 的「确认删除」二次确认框是 **UX 层**防护；这里是**契约层**防护
 * ——主进程只接受 `confirm: true`，将来任何新调用点（agent skill / CLI / 测试）都绕不过。
 * 此前本通道复用 `ceshuGetInputSchema`，而它的 `confirmed` 是**云端超预算**标志、与删除无关
 * ⇒ 等于删除操作在主进程侧零守卫。
 */
export const ceshuDeleteInputSchema = z.object({
  id: z.string().min(1),
  confirm: z.boolean()
})

export type CeshuDeleteInput = z.infer<typeof ceshuDeleteInputSchema>

/** 引擎代码导出（E2）：选择导出文件路径（`engine` 决定默认扩展名与过滤器标题）。
 * - `defaultName`：无记忆路径时的默认文件名（可选，记忆路径存在时冗余）。
 * - `defaultPath`：上次导出路径（按引擎记忆，回填到 SaveDialog，免得每次重选游戏文件）。
 *   二者皆可缺省——都缺时回落到 `GameData`。 */
export const engineExportFileDialogInputSchema = z.object({
  defaultName: z.string().min(1).max(120).optional(),
  engine: engineTargetSchema.default('lua'),
  defaultPath: z.string().min(1).max(4096).optional()
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

/** 库管理：按库名操作（切换） */
export const libraryNameInputSchema = z.object({
  name: z.string().min(1).max(40)
})

/**
 * 删除整个游戏库：**破坏性**操作，一次性抹掉该库的策划书 + 数据 + 图片。
 *
 * `confirm` 必须为 true —— 渲染层的确认可被绕过（任何未来调用点 / agent skill / 测试
 * 都能直接打这条 IPC），主进程必须再挡一次，与 `clearAllInputSchema` /
 * `backupDeleteInputSchema` / `ceshuDeleteInputSchema` 同一约定。
 *
 * ⚠️ 此前本通道**只有 `libraryNameInputSchema{name}`、且渲染层点一下就直接删**：
 * ① 无契约层 confirm，② 无 UX 二次确认，③ 删除**不走撤销**（撤销只覆盖数据条目，
 * 不覆盖整库删除）⇒ 误点一次即永久丢失整个库。这是本仓「破坏性操作必须有契约层
 * confirm」铁律下最后一个漏网的入口（`data:clearAll` / `ceshu:delete` /
 * `backup:*` / `images:deleteImages` 均已守住）。
 */
export const libraryRemoveInputSchema = z.object({
  name: z.string().min(1).max(40),
  confirm: z.boolean()
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
/** MCP 配置保存：整份 JSON 文本（主进程解析 + 校验 + 写盘 + 重连） */
export const mcpSetConfigInputSchema = z.object({
  content: z.string().max(200_000)
})

export const agentChatInputSchema = z.object({
  input: z.string().min(1).max(4000),
  /**
   * 本轮运行 id（可选）：渲染层生成，用于把 `task:cancel` 精确投递给**这一轮**。
   * 不传时主进程按「该窗口当前活跃任务」兜底（见 `main/task/taskRegistry.ts`）。
   */
  runId: z.string().min(1).max(64).optional(),
  /**
   * 智能体预设 id（借 dsh agent-preset 设计；来自 `shared/agent/presets.ts` 的 `AGENT_PRESETS`）。
   * 渲染层开聊前选定；主进程据此注入角色定位 system prompt。未知 id 静默忽略。
   */
  preset: z.string().min(1).max(64).optional(),
  /**
   * 本轮目标（对齐 dsh GoalBar）：用户在输入框上方的目标条里填的一句话，
   * 随每次 `chat` 一起发往主进程，注入为系统提示词的一段「本轮目标」。
   * 可选、纯展示性约束——不阻断对话，也不强制模型遵守；仅作为意图锚点。
   * 空串视为未填。
   */
  goal: z.string().max(500).optional(),
  /**
   * 随消息附带的文件元数据（对齐 dsh ui-attachment 的诚实子集）：
   * 渲染层在用户选文件时先经 `attachments:add` 复制进 `<库>/attachments/`，
   * 发送时把这些元数据带上，主进程注入系统提示词让智能体知道有这些文件。
   */
  attachments: z
    .array(
      z.object({
        // 只存叶子名（对齐 dsh FileAttachmentRef：持久化事件不含路径）
        name: z.string().min(1).max(260),
        mime: z.string().min(1).max(120),
        bytes: z.number().int().nonnegative()
      })
    )
    .max(20)
    .optional()
})

/** 会话附件：把用户选中的文件复制进 `<活跃库>/attachments/` 并返回元数据 */
export const attachmentsAddInputSchema = z.object({
  path: z.string().min(1)
})
export type AttachmentsAddInput = z.infer<typeof attachmentsAddInputSchema>

/** 会话附件：用系统默认程序打开库内附件（按叶子名解析，不含路径） */
export const attachmentsOpenInputSchema = z.object({
  name: z.string().min(1).max(260)
})
export type AttachmentsOpenInput = z.infer<typeof attachmentsOpenInputSchema>

/** 会话附件：把库内图片附件读成 data URL（按叶子名解析，缩略图/lightbox 用） */
export const attachmentsReadImageInputSchema = z.object({
  name: z.string().min(1).max(260)
})
export type AttachmentsReadImageInput = z.infer<typeof attachmentsReadImageInputSchema>

/** 用系统默认程序打开任意路径（交付文件等不在 attachments 目录的产物） */
export const shellOpenPathInputSchema = z.object({
  path: z.string().min(1)
})
export type ShellOpenPathInput = z.infer<typeof shellOpenPathInputSchema>

/** Agent Brain：对运行中的子智能体「插话」（push 一条消息进它的收件箱） */
export const agentSubagentSendInputSchema = z.object({
  id: z.string().min(1).max(64),
  content: z.string().min(1).max(4000)
})
/** Agent Brain：单独停止某个运行中的子智能体（不牵连父循环） */
export const agentSubagentStopInputSchema = z.object({
  id: z.string().min(1).max(64)
})

/**
 * 取消某个长任务（对话循环 / 单发 AI 生成都走这一条）。
 * 缺省 `taskId` ⇒ 取消该窗口当前活跃的那一笔（面板上只有一个停止按钮时的自然语义）。
 */
export const taskCancelInputSchema = z.object({
  taskId: z.string().min(1).max(64).optional()
})
export type TaskCancelInput = z.infer<typeof taskCancelInputSchema>

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

/** 首页卡片：重命名策划书 */
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

/** 系统确认：确认/调整游戏系统 */
export const ceshuConfirmSystemsInputSchema = z.object({
  id: z.string().min(1),
  enabledKeys: z.array(z.string().min(1).max(64)).max(200),
  customSystems: z
    .array(z.object({ key: z.string().min(1).max(64), name: z.string().min(1).max(120) }))
    .max(200)
    .default([])
})

/** 数据同步：双向同步策划书 systems ↔ 游戏数据 */
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
    .optional(),
  /**
   * 大范围调用（一键生成 / 批量）的用户确认标志（v0.5 DD-17）。
   * 主进程判定需要确认时会**拒绝并给出中文原因**，渲染层确认后**带 `confirmed: true` 重发**，
   * 与 `main/agent/dispatcher.ts` 的 `dangerConfirmed` 同一模式。
   * **刻意用 `optional` 而非 `default`**：契约类型取的是 `z.infer`（输出类型），
   * 用 `default` 会逼所有既有调用点补传该字段。
   */
  confirmed: z.boolean().optional()
})

/** 按字段 AI 生成：单字段定向生成，非整章。
 *  `action` 为局部重生成动作（停靠栏快捷操作），缺省 = 重新起草该字段 */
export const ceshuAiGenerateFieldInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  field: z.string().min(1),
  action: z.enum([...FIELD_ACTIONS]).optional()
})

export type CeshuAiGenerateFieldInput = z.infer<typeof ceshuAiGenerateFieldInputSchema>

/** AI 生成候选游戏数据（数值/系统章作为设定 → 候选 → 人工导入） */
export const ceshuDataGenInputSchema = z.object({
  id: z.string().min(1),
  dataTypes: z.array(z.string().max(50)).max(30).default([]),
  count: z.number().int().min(1).max(20).default(5),
  instruction: z.string().max(500).default(''),
  /** 批量超过阈值时的用户确认标志（v0.5 DD-17，同 `ceshuAiGenerateInputSchema.confirmed`） */
  confirmed: z.boolean().optional()
})

/** AI 审阅报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuReviewExportInputSchema = z.object({
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

/** 完备度报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuReadinessExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 校验报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuValidationExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 变更日志导出（渲染层生成 MD/HTML/Text，主进程原子写盘） */
export const ceshuChangelogExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/**
 * 报告文件保存对话框（按扩展名/显示名动态生成过滤器）。
 * 用于「导出校验报告 / 变更日志」这类**非策划书导出格式枚举**内的文件
 * （`CESHU_EXPORT_FORMATS` 只有 markdown/html/docx/pptx/pdf/excel，不含纯文本）。
 */
export const reportFileDialogInputSchema = z.object({
  defaultName: z.string().max(200),
  /** 含点扩展名，如 `.md` / `.html` / `.txt` */
  extension: z.string().min(2).max(10),
  label: z.string().min(1).max(50)
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
  /** 名称传空串时由存储层判定为「更新失败」 */
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
export type PreviewImportInput = z.infer<typeof previewImportInputSchema>
export type ApplyImportInput = z.infer<typeof applyImportInputSchema>
export type EngineExportInput = z.infer<typeof engineExportInputSchema>
export type BatchOpInput = z.infer<typeof batchOpSchema>
export type BatchUpdateInput = z.infer<typeof batchUpdateInputSchema>
export type DeleteManyInput = z.infer<typeof deleteManyInputSchema>
export type ClearAllInput = z.infer<typeof clearAllInputSchema>
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
export type CeshuCloneDecomposeInput = z.infer<typeof ceshuCloneDecomposeInputSchema>
export type CeshuExportProjectInput = z.infer<typeof ceshuExportProjectInputSchema>
export type CeshuOpenProjectInput = z.infer<typeof ceshuOpenProjectInputSchema>
export type CeshuAiTasksInput = z.infer<typeof ceshuAiTasksInputSchema>
export type CeshuCheckDataTablesInput = z.infer<typeof ceshuCheckDataTablesInputSchema>
export type CeshuCheckContractInput = z.infer<typeof ceshuCheckContractInputSchema>
export type CeshuScaffoldDataTablesInput = z.infer<typeof ceshuScaffoldDataTablesInputSchema>
export type CeshuSaveDemoInput = z.infer<typeof ceshuSaveDemoInputSchema>
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
export type AgentDeliveriesInput = z.infer<typeof agentDeliveriesInputSchema>
export type AgentApprovalResponseInput = z.infer<typeof agentApprovalResponseInputSchema>
export type AgentInteractionResponseInput = z.infer<typeof agentInteractionResponseInputSchema>
export type AgentSubagentSendInput = z.infer<typeof agentSubagentSendInputSchema>
export type AgentSubagentStopInput = z.infer<typeof agentSubagentStopInputSchema>
export type EngineExportFileDialogInput = z.infer<typeof engineExportFileDialogInputSchema>
export type LibraryCreateInput = z.infer<typeof libraryCreateInputSchema>
export type LibraryRenameInput = z.infer<typeof libraryRenameInputSchema>
export type LibraryNameInput = z.infer<typeof libraryNameInputSchema>
export type LibraryRemoveInput = z.infer<typeof libraryRemoveInputSchema>
export type CeshuApplyPresetInput = z.infer<typeof ceshuApplyPresetInputSchema>
export type CeshuConfirmSystemsInput = z.infer<typeof ceshuConfirmSystemsInputSchema>
export type CeshuSyncDataInput = z.infer<typeof ceshuSyncDataInputSchema>
export type CeshuAiGenerateInput = z.infer<typeof ceshuAiGenerateInputSchema>
export type CeshuDataGenInput = z.infer<typeof ceshuDataGenInputSchema>
export type CeshuReviewExportInput = z.infer<typeof ceshuReviewExportInputSchema>
export type CeshuDiffInput = z.infer<typeof ceshuDiffInputSchema>
export type CeshuDiffExportInput = z.infer<typeof ceshuDiffExportInputSchema>
export type CeshuReadinessExportInput = z.infer<typeof ceshuReadinessExportInputSchema>
export type CeshuValidationExportInput = z.infer<typeof ceshuValidationExportInputSchema>
export type CeshuChangelogExportInput = z.infer<typeof ceshuChangelogExportInputSchema>
export type ReportFileDialogInput = z.infer<typeof reportFileDialogInputSchema>
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
/** 代码面板：列目录（path 为绝对路径，空串由主进程回落默认根） */
export const fsListDirInputSchema = z.object({
  path: z.string()
})
export type FsListDirInput = z.infer<typeof fsListDirInputSchema>

/** 代码面板：读文本文件（主进程做大小/二进制双重闸） */
export const fsReadFileInputSchema = z.object({
  path: z.string().min(1)
})
export type FsReadFileInput = z.infer<typeof fsReadFileInputSchema>
