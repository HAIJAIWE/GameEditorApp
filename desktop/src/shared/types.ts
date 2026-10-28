/** 跨进程共享的数据类型（主进程 / preload / 渲染层三端共用） */

export interface ItemRecord {
  id: string
  type: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
  /**
   * AI 生成、**待人工核对**的时间戳（ISO）；`undefined` = 人工创建或已核对。
   *
   * 存在 SQLite 的独立列（不是 `data` 里）—— 塞 `data` 会漏进条目表单、CSV/Excel/Lua 导出。
   * 人在条目表单点「保存」即清空该列（= 核对过了）。
   */
  aiGeneratedAt?: string
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  dbPath: string
}

/** 单条日志条目（渲染层 → 主进程转发的载荷） */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppLogInput {
  level: LogLevel
  message: string
  /** 可选的结构化附带信息（错误对象、上下文等） */
  meta?: unknown
}

/* ---- 数据类型 schema（自 早期版本 core/defaults/rpg_schema v2.4 匹平迁移） ---- */

export type FieldType =
  | 'entry'
  | 'spinbox'
  | 'double_spin'
  | 'combobox'
  | 'multiselect'
  | 'desc'
  | 'content'
  | 'tags'
  | 'template'
  | 'image'
  | 'image_desc'
  | 'image_tags'
  | 'attrtable'
  | 'attrpanel'
  | 'droptable'
  | 'achievement_desc'
  | 'dialog'

export interface TypeFieldDef {
  name: string
  label: string
  type: FieldType
  /** 是否允许用户编辑（id 等系统字段为 false） */
  editable: boolean
  /** combobox/template 的可选值 */
  values?: string[]
  /** spinbox 下限 */
  from?: number
  /** spinbox 上限 */
  to?: number
  /** multiselect 引用的数据类型 id */
  refType?: string
}

/** 类型自定义分区定义（可选；存在时条目表单优先按它分组，见 shared/formSections.ts） */
export interface TypeSectionDef {
  /** 分区标题（如「基础信息」「战斗属性」） */
  title: string
  /** 分区图标（emoji） */
  icon: string
  /** 默认是否折叠；缺省不折叠 */
  collapsed?: boolean
  /** 归入该分区的字段名（按此顺序渲染；schema 里不存在的字段跳过） */
  fields: string[]
}

export interface DataTypeDef {
  /** 单数键：新架构内部与存储使用 */
  id: string
  /** 中文名 */
  name: string
  /** 旧版数据文件的复数键（导入映射用） */
  pluralKey: string
  color: string
  formFields: TypeFieldDef[]
  /**
   * 可选的自定义分区（标题/图标/字段归属）。存在时 `buildFormLayout` **优先采用**，
   * 使条目表单按模板/用户定义的分区渲染；缺省则回落到内置 `FORM_GROUPS` 或语义兜底。
   * 落盘进 `type_schema.json` 的 `sections` 键。
   */
  sections?: TypeSectionDef[]
}

/** 批量字段操作结果（affected=已写入，skipped=非数值跳过，missing=不存在或类型不符） */
export interface BatchUpdateSummary {
  affected: number
  skipped: number
  missing: number
}

/** 批量删除结果 */
export interface DeleteManySummary {
  deleted: number
  missing: number
}

/** 旧数据导入结果 */
export interface ImportSummary {
  filePath: string
  totalItems: number
  imported: number
  updated: number
  skipped: number
  /** 每类型入库条数（键为数据类型 id 或未识别复数键） */
  byType: Record<string, number>
  /** 文件中出现但当前 schema 未收录的复数键及其条数（数据已保留入库） */
  unknownTypes: Record<string, number>
  /**
   * 完全没有 `id` 列却仍有数据的来源（Excel 工作表名 / CSV 类型键）。
   *
   * 这些来源的每一行都会被当成**新条目**（自动分配 id）。若用户本意是「改已有数据的数值」，
   * 结果就是**整表翻倍**。此处只做报告、不阻断——「从零建表批量新增」是合法用法，
   * 拦下来反而挡住正路；但必须让用户看见风险，不能静默。
   */
  missingIdSources: string[]
}

/** 导入预览里的单字段差异 */
export interface ImportFieldChange {
  key: string
  before: unknown
  after: unknown
}

/** 导入预览里的单条记录：新建 or 修改（修改带字段级差异） */
export interface ImportRecordPreview {
  type: string
  /** 业务短 id（`data.id`），新建且文件里没给时为空串 */
  businessId: string
  /** 展示名：优先 `name`，缺省用 id */
  name: string
  kind: 'create' | 'update'
  changes: ImportFieldChange[]
}

/**
 * 导入预览：**落库前**告诉用户「这次会新增多少、改哪些字段」。
 *
 * 导入是不可撤销的批量写（撤销栈只记单条），所以必须先看清楚再落。
 */
export interface ImportPreview {
  kind: 'excel' | 'csv'
  filePath: string
  /** 文件里的数据行数（含被跳过的空行） */
  totalRows: number
  createCount: number
  updateCount: number
  /** 命中已有条目但字段值完全没变 */
  unchangedCount: number
  skipped: number
  /** 每类型的新增/修改/未变 */
  byType: Record<string, { create: number; update: number; unchanged: number }>
  /** 变更明细；超过上限时截断（`truncated` 为 true） */
  records: ImportRecordPreview[]
  truncated: boolean
  unknownTypes: Record<string, number>
  missingIdSources: string[]
}

/** 数据导出结果 */
export interface ExportSummary {
  filePath: string
  totalItems: number
  /** 每类型导出条数（键为数据类型 id 或原始键名） */
  byType: Record<string, number>
}

/** CSV 导出结果：每种数据类型一个文件 */
export interface CsvExportSummary {
  /** 导出目录 */
  dir: string
  /** 已写出的文件绝对路径（按 schema 顺序） */
  files: string[]
  totalItems: number
  /** 每类型导出条数（键为数据类型 id） */
  byType: Record<string, number>
}

/* ---- 质量门 verdict 形状（跨域契约：agent 产出、ceshu/data 消费、UI 展示）---- */

/* ---- LLM-as-Judge 的辅助维度（DD-19 剩余项，章节侧专用） ---- */

/**
 * LLM-as-Judge 的辅助结论。
 *
 * ## 定位：确定性门为主，judge 为辅
 * 本项目的策划书/数据已有 7,114 行确定性纯逻辑在生产跑（`ceshuValidation` /
 * `ceshuReadiness` / `dataStats` / `dataCountConstraint`），它们给出的
 * `blocking` / `errorDelta` / `completionDelta` **是客观可机器判定**的质量结论。
 * LLM judge 只补机器判不了的维度：
 * - `toxicity`：合规红线（暴力/涉政/色情等），确定性门看不到；
 * - `readability` / `creativity`：文字质量与创意，机器打分无能为力；
 * - `score`：judge 综合分（0-100），**仅供参考**，不与任何确定性结论混用。
 *
 * 权重远低于确定性门：`toxicity === 'flagged'` 也**不推翻** `blocking` /
 * `completionDelta`，只由 `applyJudge` 往 `summary` 追加一条合规提示，
 * 把"是否发布"的最终裁决权留在人手里。
 */
export interface LlmJudgeVerdict {
  /** 合规性：safe = 未命中红线；flagged = 命中需人工复核 */
  toxicity: 'safe' | 'flagged'
  /** 可读性（0-10） */
  readability: number
  /** 创意性（0-10） */
  creativity: number
  /** judge 综合分（0-100），仅供参考 */
  score: number
  /** judge 评语，UI 直接展示 */
  comment: string
}

/**
 * 策划书 AI 生成的**确定性质量门**结论（v0.5 DD-19 章节侧）。
 *
 * 由 `shared/agent/qualityGate.ts::evaluateChapterDraft` 产出，经
 * `domain/ceshu/ceshuAi.ts::CeshuAiGenerateResult.quality` 回流给生成链路与 UI。
 * 形状属跨域共享 ⇒ 按 README Q2 存放 contract 层，双方各引一份。
 */
export interface QualityGateVerdict {
  /** 被评估的章节 */
  chapter: string
  /** 生成前的校验错误数 */
  beforeErrors: number
  /** 应用生成结果后的校验错误数 */
  afterErrors: number
  /** 错误数变化（**负数 = 变好**） */
  errorDelta: number
  /** 应用后仍存在的**阻断性**问题（必填缺失 / 一致性冲突）；软警告不算 */
  blocking: string[]
  /** 生成前的**立项阶段**完成度（0~1，取自 `computeChapterProgress(doc,'concept')`） */
  completionBefore: number
  /** 生成后的立项阶段完成度（0~1） */
  completionAfter: number
  /** 完成度变化（正数 = 变好；已四舍五入到 4 位） */
  completionDelta: number
  /** 是否确有净改善（错误减少 **或** 完成度提高） */
  improved: boolean
  /** 一句话结论，供 UI 直接展示 */
  summary: string
  /**
   * LLM-as-Judge 的**辅助**结论（DD-19 剩余项，章节侧专用）。
   * 确定性门为主、judge 为辅：`toxicity` 命中只往 `summary` 追加合规提示，
   * **不推翻** `blocking` / `completionDelta`。异步计算后再由 `applyJudge` 合并进来，
   * 故确定性 `evaluateChapterDraft` 产出的 verdict 此字段为 `null`。
   */
  judge: LlmJudgeVerdict | null
}

/** 单个「类型 × 数值字段」的平衡性评估（数据侧质量门） */
export interface DataBalanceRow {
  /** 复数键 */
  type: string
  typeName: string
  /** 字段名 */
  field: string
  /** 字段显示名（去掉表单标签的冒号后缀，与 `dataStats` 一致） */
  label: string
  /** 参与统计的有效数值条数 */
  count: number
  avg: number
  std: number
  /** 平衡性判定（阈值 0.3，与 `dataStats::assessBalance` 同源） */
  verdict: 'good' | 'needs_adjust'
}

/** 数据侧质量门的单条问题（数量约束在前，平衡性在后） */
export interface DataQualityIssue {
  /** 复数键 */
  type: string
  typeName: string
  /** `count_limit` = 数量约束超限（**硬约束**）；`balance` = 离散度偏高（**建议**） */
  kind: 'count_limit' | 'balance'
  message: string
}

/**
 * 数据 AI 候选的**确定性质量门**结论（v0.5 DD-19 数据侧）。
 *
 * 由 `shared/agent/qualityGate.ts::evaluateDataCandidates` 产出，经
 * `domain/ceshu/ceshuDataGen.ts` 回流给数据生成链路与 `AiDataGenPanel`。
 */
export interface DataQualityVerdict {
  /** 本次候选总条数 */
  total: number
  /** 逐复数键的候选条数 */
  counts: Record<string, number>
  /** 需要人工注意的问题（数量约束在前，平衡性在后） */
  issues: DataQualityIssue[]
  /** 逐「类型 × 数值字段」的平衡性（无论好坏都列出，供 UI 展示） */
  balance: DataBalanceRow[]
  /** 是否存在问题（数量约束超限或离散度偏高） */
  hasIssues: boolean
  /** 一句话结论，供 UI 直接展示 */
  summary: string
}

