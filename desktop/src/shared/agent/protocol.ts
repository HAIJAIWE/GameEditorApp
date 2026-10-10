/**
 * Agent 技能协议与安全策略（自 Python `core/agent/skill_protocol.py` + `security/acl.py`
 * + `skills/common.py` 的纯逻辑部分匹平迁移）。
 *
 * 迁移原则（见 `docs/a-tier-plan.md` §2.1）：**保留契约、替换实现**。
 * 本模块只放可被 Node 环境单测覆盖的纯逻辑：风险等级与权限判定、结果归一化、
 * 参数修正（action 推断 + 别名）、JSON Schema / 工具描述生成。
 * 具体技能的副作用留在 `main/agent/skills/*`。
 *
 * 有意偏离 Python（已在台账记录）：
 *  - Python 的结果带内部字段 `_raw`，属实现细节泄漏，TS 不再产出。
 *  - Python 的 `REQUIRES_MAIN_THREAD` 是 PyQt 主线程约束，与 TS 无关，
 *    改名为 `requiresMainThread` 仅作语义标记（A1-4 面板复用）。
 */

// 预算护栏的纯逻辑在 budget.ts；确认门（DD-17 + M5）复用其计算。
import { taskBudget, evaluateBudget, type LlmTaskType } from './budget'

/* ---- 风险等级与权限（对齐 security/acl.py） ---- */

/** 风险等级（数值越大越高危；对齐 Python `RiskLevel` IntEnum） */
export const RISK_LEVEL = {
  READ_ONLY: 0,
  DATA_WRITE: 1,
  FILE_SYSTEM: 2,
  NETWORK: 3,
  SYSTEM: 4
} as const

export type RiskLevel = (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL]

/** 工具 → 风险等级（或 工具 → {action: 风险}）；对齐 Python `TOOL_RISK_MAP` */
export const TOOL_RISK_MAP: Record<string, RiskLevel | Record<string, RiskLevel>> = {
  'system.game_data': {
    query: RISK_LEVEL.READ_ONLY,
    list: RISK_LEVEL.READ_ONLY,
    search: RISK_LEVEL.READ_ONLY,
    summary: RISK_LEVEL.READ_ONLY,
    list_types: RISK_LEVEL.READ_ONLY,
    create: RISK_LEVEL.DATA_WRITE,
    update: RISK_LEVEL.DATA_WRITE,
    delete: RISK_LEVEL.DATA_WRITE,
    batch: RISK_LEVEL.DATA_WRITE,
    import: RISK_LEVEL.DATA_WRITE,
    export: RISK_LEVEL.DATA_WRITE
  },
  'system.file_ops': {
    read: RISK_LEVEL.READ_ONLY,
    list: RISK_LEVEL.READ_ONLY,
    write: RISK_LEVEL.FILE_SYSTEM,
    delete: RISK_LEVEL.FILE_SYSTEM,
    edit: RISK_LEVEL.FILE_SYSTEM,
    mkdir: RISK_LEVEL.FILE_SYSTEM,
    copy: RISK_LEVEL.FILE_SYSTEM,
    move: RISK_LEVEL.FILE_SYSTEM
  },
  'system.shell': RISK_LEVEL.SYSTEM,
  'system.code': RISK_LEVEL.SYSTEM,
  'system.scheduler': RISK_LEVEL.SYSTEM,
  'system.web_search': RISK_LEVEL.NETWORK,
  'system.web_fetch': RISK_LEVEL.NETWORK,
  'system.browser': RISK_LEVEL.NETWORK,
  'system.vision': RISK_LEVEL.NETWORK,
  'system.tts': RISK_LEVEL.NETWORK,
  'system.speech_input': RISK_LEVEL.NETWORK,
  'system.image_analyze': RISK_LEVEL.NETWORK,
  'system.image_gen': RISK_LEVEL.NETWORK,
  'system.ceshu': RISK_LEVEL.DATA_WRITE,
  'system.workflow': RISK_LEVEL.DATA_WRITE,
  'system.visualization': RISK_LEVEL.DATA_WRITE,
  'system.ui_preview': RISK_LEVEL.DATA_WRITE,
  'system.export_doc': RISK_LEVEL.DATA_WRITE,
  'system.schema_edit': RISK_LEVEL.DATA_WRITE,
  'system.game_balance': RISK_LEVEL.DATA_WRITE,
  'system.todo': RISK_LEVEL.DATA_WRITE,
  'system.model': RISK_LEVEL.DATA_WRITE,
  'system.batch_data': RISK_LEVEL.DATA_WRITE,
  'system.pdf_parse': RISK_LEVEL.FILE_SYSTEM,
  'system.git': RISK_LEVEL.FILE_SYSTEM,
  'system.ask_user': RISK_LEVEL.READ_ONLY,
  'tool.ask_user': RISK_LEVEL.READ_ONLY
}

/** 未在表中登记的工具默认风险（对齐 Python `TOOL_RISK_MAP.get(tool, DATA_WRITE)`） */
export const DEFAULT_TOOL_RISK: RiskLevel = RISK_LEVEL.DATA_WRITE

/** 全局允许的最大风险（对齐 Python `_max_allowed_risk = FILE_SYSTEM`） */
export const DEFAULT_MAX_ALLOWED_RISK: RiskLevel = RISK_LEVEL.FILE_SYSTEM

/** 取 (工具, 操作) 的风险等级；未登记回退 DATA_WRITE */
export function resolveRiskLevel(toolId: string, action = ''): RiskLevel {
  const entry = TOOL_RISK_MAP[toolId]
  if (entry === undefined) return DEFAULT_TOOL_RISK
  if (typeof entry === 'number') return entry
  return entry[action] ?? DEFAULT_TOOL_RISK
}

/* ---- 策划书 / 数据域「云端 LLM 调用」的确认门（v0.5 DD-17） ---- */

/**
 * 为什么单独一套判定：`ceshu:aiGenerateChapter` / `ceshu:aiGenerateData` / `ceshu:aiReview`
 * 走的**不是** agent 的技能通路（`dispatcher.execute`），而是渲染层直连的独立 IPC
 * （`window.mbApi.ceshu.*` 53 处 / `data.*` 42 处，`window.mbApi.agent` 仅 1 处，见
 * `docs/agent-framework-design.md` §5.5.1）⇒ `TOOL_RISK_MAP` 与 `approvalBroker` 对它们**不生效**。
 * 本套判定把「要不要先问用户」抽成纯函数，让这两条通路**共用同一个口径**，而不新造机制。
 */

/** 批量生成的条目数阈值（`ceshuDataGenInputSchema.count` 上限 20 的一半） */
export const LLM_BULK_COUNT_THRESHOLD = 10

export interface LlmCallScope {
  /** 是否属于大范围调用（如整篇 / 一键生成） */
  bulk?: boolean
  /** 批量生成的条目数 */
  count?: number
  /** v0.6 M5：预算护栏用 —— 任务类型、预估 token、是否云端档 */
  taskType?: LlmTaskType
  estimatedTokens?: number
  isCloud?: boolean
}

/** 一次云端 LLM 调用是否属于「大范围操作」（≥ 阈值即需先确认） */
export function isBulkLlmCall(scope: LlmCallScope): boolean {
  return llmConfirmReason(scope) !== null
}

/** 需先确认时给出中文原因；无需确认返回 `null`（判定与文案同源，避免两处漂移） */
export function llmConfirmReason(scope: LlmCallScope): string | null {
  if (scope.bulk === true) {
    return '整篇 / 一键生成会连续多次调用云端模型，耗时较长且 token 消耗较高'
  }
  const count = scope.count
  if (typeof count === 'number' && Number.isFinite(count) && count > LLM_BULK_COUNT_THRESHOLD) {
    return `批量生成 ${count} 条（超过 ${LLM_BULK_COUNT_THRESHOLD} 条）会调用云端模型，token 消耗较高`
  }
  // v0.6 M5：云端档超预算也要先确认（降级 = 提示拆分，而非静默烧钱）
  if (scope.isCloud && scope.taskType && typeof scope.estimatedTokens === 'number') {
    const budget = taskBudget(scope.taskType, { count: scope.count })
    const status = evaluateBudget(scope.estimatedTokens, budget, true)
    if (status.over) {
      return `预计花费约 ${status.estimated} token（预算 ${status.budget}），可能超出预算，建议拆分任务（如减少条数或改为单章生成）后再试`
    }
  }
  return null
}

export interface PermissionCheck {
  allowed: boolean
  risk: RiskLevel
  /** 是否需用户二次确认（对齐 Python：risk >= SYSTEM） */
  needsConfirmation: boolean
}

/**
 * 权限判定（对齐 Python `acl.check_permission` 的三段：显式禁止 → 全局上限 → 危险确认）。
 * `blockedTools` / `blockedActions` 由调用方按会话维度传入（Python 是进程级全局集合，
 * TS 侧刻意改成显式入参，避免全局可变状态）。
 */
export function checkPermission(
  toolId: string,
  action = '',
  options: {
    maxAllowedRisk?: RiskLevel
    blockedTools?: ReadonlySet<string>
    blockedActions?: ReadonlySet<string>
  } = {}
): PermissionCheck {
  const maxAllowed = options.maxAllowedRisk ?? DEFAULT_MAX_ALLOWED_RISK
  if (options.blockedTools?.has(toolId)) {
    return { allowed: false, risk: RISK_LEVEL.SYSTEM, needsConfirmation: false }
  }
  if (action !== '' && options.blockedActions?.has(`${toolId}/${action}`)) {
    return { allowed: false, risk: RISK_LEVEL.SYSTEM, needsConfirmation: false }
  }
  const risk = resolveRiskLevel(toolId, action)
  if (risk > maxAllowed) {
    return { allowed: false, risk, needsConfirmation: false }
  }
  return { allowed: true, risk, needsConfirmation: risk >= RISK_LEVEL.SYSTEM }
}

/* ---- 技能协议 ---- */

/** 参数定义（对齐 Python `BaseSkill.parameters` 的 list[dict] 形态） */
export interface SkillParameter {
  name: string
  /** JSON Schema 基础类型：string / integer / number / boolean / array / object */
  type: string
  description: string
  required?: boolean
  default?: unknown
  enum?: readonly unknown[]
  example?: unknown
  minimum?: number
  maximum?: number
  /** type=array 时的元素类型 */
  items?: string
}

/** 工具执行上下文（对齐 Python `execute(params, context)` 的 context dict） */
export interface SkillExecutionContext {
  /**
   * 危险操作的一次性确认令牌（对齐 Python `context['_danger_confirmed']` 元组语义）。
   * 与本次 (工具, 操作) 完全匹配时放行，并**就地置空**以避免重复使用。
   */
  dangerConfirmed?: { tool: string; action: string } | null
  /** 调用来源/会话（便于日志与后续 A1-3 会话存储） */
  sessionId?: string
  [key: string]: unknown
}

/**
 * 技能与用户的交互请求（TS 侧新增，统一覆盖两类「非危险」确认）：
 *  - `confirm`：破坏性动作的二次确认（→ 批准后带 `confirm: true` 重执行）
 *  - `question`：参数/选项不确定时向用户提问（→ 答复作为工具结果回灌）
 *
 * 背景：Python 里 `needs_confirm`（`game_data_skill.py:414`）**只有生产者、没有消费者**，
 * 标志位无人处理、循环只把错误文案回灌给 LLM —— 属死路。TS 把它做成真实通道。
 */
/** 候选项（对齐 Python `ask_user_skill` 的 `{label, description}`） */
export interface SkillInteractionOption {
  label: string
  description?: string
}

/** 单个问题（`questions` 的元素，对齐 Python `{question, options, multiSelect}`） */
export interface SkillInteractionQuestion {
  prompt: string
  options?: readonly SkillInteractionOption[]
  /** 是否可多选 */
  multiSelect?: boolean
}

export interface SkillInteraction {
  kind: 'confirm' | 'question'
  /** 展示给用户的文案（多问题时作为总标题） */
  prompt: string
  /**
   * kind === 'question' 的单问题候选选项（留空表示自由文本回答）。
   * 注意：这是 `questions` 长度为 1 时的便捷写法；两者同时存在时**以 `questions` 为准**。
   */
  options?: readonly SkillInteractionOption[]
  /** kind === 'question' 的多问题列表（对齐 Python `questions`） */
  questions?: readonly SkillInteractionQuestion[]
}

/** 技能执行结果（对齐 Python 归一化后的 `{success, message, data}`，另加 `interaction`） */
export interface SkillResult {
  success: boolean
  message: string
  data?: unknown
  error?: string
  /** 需要与用户交互（确认/提问）；由 Brain 循环暂停并等待回答 */
  interaction?: SkillInteraction
}

/** 技能协议：实现该接口即可被调度器注册 */
export interface SkillProtocol {
  /** 工具 id，如 `system.game_data`（对齐 Python `name` / `NAME`） */
  id: string
  description: string
  version: string
  /** 参数定义（当未提供 parametersSchema 时用于生成 JSON Schema） */
  parameters?: SkillParameter[]
  /** 直出 JSON Schema（优先；对齐 Python `PARAMS_SCHEMA`） */
  parametersSchema?: JsonObjectSchema
  tags?: readonly string[]
  /** 依赖的同批工具 id（对齐 Python `depends_on`） */
  dependsOn?: readonly string[]
  /** 语义标记：涉及 GUI 主线程（TS 侧无硬约束，仅供面板/调度排序参考） */
  requiresMainThread?: boolean
  execute(params: Record<string, unknown>, ctx: SkillExecutionContext): SkillResult | Promise<SkillResult>
}

/** 极简 JSON Schema（object 根） */
export interface JsonObjectSchema {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: readonly string[]
}

export interface JsonSchemaProperty {
  type: string
  description?: string
  enum?: readonly unknown[]
  default?: unknown
  example?: unknown
  minimum?: number
  maximum?: number
  items?: { type: string }
}

/** 技能工具描述（对齐 Python `BaseSkill.to_json_schema`） */
export function toJsonSchema(skill: SkillProtocol): {
  name: string
  description: string
  parameters: JsonObjectSchema
} {
  if (skill.parametersSchema) {
    return { name: skill.id, description: skill.description, parameters: skill.parametersSchema }
  }
  const properties: Record<string, JsonSchemaProperty> = {}
  const required: string[] = []
  for (const param of skill.parameters ?? []) {
    if (param.name === '') continue
    const prop: JsonSchemaProperty = { type: param.type, description: param.description }
    if (param.enum) prop.enum = param.enum
    if (param.default !== undefined) prop.default = param.default
    if (param.example !== undefined) prop.example = param.example
    if (param.minimum !== undefined) prop.minimum = param.minimum
    if (param.maximum !== undefined) prop.maximum = param.maximum
    if (param.items) prop.items = { type: param.items }
    properties[param.name] = prop
    if (param.required) required.push(param.name)
  }
  return { name: skill.id, description: skill.description, parameters: { type: 'object', properties, required } }
}

/**
 * 工具目录摘要的默认字符上限（渐进披露：每个工具一行，超长截断）。
 * 太长的描述会触发本地 4B 的「提示词冗长税」（见设计文档 §4.1 实测 1）。
 */
export const TOOL_CATALOG_SUMMARY_MAX_CHARS = 60

/**
 * 工具目录**单行**（渐进披露，G7）：`- {id}: {摘要}`，**不含参数明细**。
 *
 * 为什么不带参数：参数已由 function-calling 的 `tools` JSON Schema 随请求下发
 * （`SkillDispatcher.toolsJsonSchema()`），在文本提示词里重复是冗余，且长参数块正是
 * 「提示词冗长税」的来源（§4.1 实测 1：>30 行 ⇒ 4B 完全不用工具）。
 * 需要**全量多行**描述的场合（如 `agent:listTools` 给 UI 编辑器）继续用 `getToolDescription`。
 */
export function getToolCatalogLine(skill: SkillProtocol): string {
  return `- ${skill.id}: ${clipToolSummary(skill.description)}`
}

/** 折成单行并截断到 `TOOL_CATALOG_SUMMARY_MAX_CHARS`（超出以 `…` 结尾） */
function clipToolSummary(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  const max = TOOL_CATALOG_SUMMARY_MAX_CHARS
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine
}

/**
 * 单行工具描述（对齐 Python `BaseSkill.get_tool_description`）：
 * `- {id}: {description}` + 每个参数一行 `    {*}{name}: {desc} ({type=.., enum=[..], default=..})`
 */
export function getToolDescription(skill: SkillProtocol): string {
  const lines = [`- ${skill.id}: ${skill.description}`]
  const schema = toJsonSchema(skill).parameters
  for (const [name, prop] of Object.entries(schema.properties)) {
    const constraints: string[] = []
    if (prop.type) constraints.push(`type=${prop.type}`)
    if (prop.enum) constraints.push(`enum=[${prop.enum.map((item) => String(item)).join('|')}]`)
    if (prop.default !== undefined) constraints.push(`default=${String(prop.default)}`)
    const requiredMark = (schema.required ?? []).includes(name) ? '*' : ''
    const hint = constraints.length > 0 ? ` (${constraints.join(', ')})` : ''
    lines.push(`    ${requiredMark}${name}: ${prop.description ?? ''}${hint}`)
  }
  return lines.join('\n')
}

/* ---- 结果归一化 ---- */

function isOptionList(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as { label?: unknown }).label === 'string' &&
      (item as { label: string }).label !== ''
  )
}

/** 结构校验：只有 kind 合法且 prompt 非空的才算有效交互请求 */
export function isSkillInteraction(value: unknown): value is SkillInteraction {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (record.kind !== 'confirm' && record.kind !== 'question') return false
  if (typeof record.prompt !== 'string' || record.prompt === '') return false
  if (record.options !== undefined && !isOptionList(record.options)) return false
  if (record.questions !== undefined) {
    if (!Array.isArray(record.questions) || record.questions.length === 0) return false
    return record.questions.every((item) => {
      if (item === null || typeof item !== 'object') return false
      const question = item as Record<string, unknown>
      if (typeof question.prompt !== 'string' || question.prompt === '') return false
      return question.options === undefined || isOptionList(question.options)
    })
  }
  return true
}

/** 取出真正要问的问题列表：`questions` 优先，否则由 `options` 折成单问题 */
export function resolveInteractionQuestions(
  interaction: SkillInteraction
): readonly SkillInteractionQuestion[] {
  if (interaction.questions !== undefined && interaction.questions.length > 0) {
    return interaction.questions
  }
  return [
    {
      prompt: interaction.prompt,
      ...(interaction.options !== undefined ? { options: interaction.options } : {})
    }
  ]
}

/** 归一化技能返回（对齐 Python `ToolDispatcher._normalize_result`，去掉内部 `_raw`） */
export function normalizeSkillResult(raw: unknown): SkillResult {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    const error = typeof record.error === 'string' ? record.error : undefined
    const interaction = isSkillInteraction(record.interaction) ? record.interaction : undefined
    if (typeof record.success === 'boolean') {
      return {
        success: record.success,
        message,
        data: record.data,
        ...(error ? { error } : {}),
        ...(interaction ? { interaction } : {})
      }
    }
    return {
      success: true,
      message: message !== '' ? message : String(record.data ?? ''),
      data: record.data,
      ...(error ? { error } : {})
    }
  }
  return { success: true, message: String(raw), data: null }
}

/* ---- 参数修正（对齐 Python `ToolDispatcher._fix_params` + `skills/common.normalize_params`） ---- */

/** action 别名表（对齐 Python `normalize_params` 的 ALIASES，含中文） */
export const ACTION_ALIASES: Record<string, string> = {
  add: 'create',
  add_item: 'create',
  create_item: 'create',
  new: 'create',
  新增: 'create',
  创建: 'create',
  添加: 'create',
  edit: 'update',
  modify: 'update',
  change: 'update',
  update_item: 'update',
  修改: 'update',
  更新: 'update',
  编辑: 'update',
  remove: 'delete',
  delete_item: 'delete',
  del: 'delete',
  删除: 'delete',
  移除: 'delete',
  search: 'query',
  find: 'query',
  query_items: 'query',
  查询: 'query',
  搜索: 'query',
  查找: 'query',
  list_all: 'list',
  list_items: 'list',
  ls: 'list',
  列表: 'list',
  全部: 'list',
  info: 'get',
  show: 'get',
  get_info: 'get',
  view: 'get',
  详情: 'get',
  查看: 'get',
  run: 'execute',
  exec: 'execute',
  执行: 'execute'
}

/** 参数别名表（对齐 Python `_fix_params` 的 param_aliases） */
const PARAM_ALIASES: Record<string, readonly string[]> = {
  data_type: ['data_type', 'type', 'category', 'kind'],
  field: ['field', 'attr', 'attribute', 'prop', 'property', 'column'],
  value: ['value', 'val', 'new_value'],
  name: ['name', 'title', 'label', 'item_name', 'prefix'],
  new_name: ['new_name', 'rename_to', 'target_name'],
  filter: ['filter', 'condition', 'conditions', 'where'],
  sort_by: ['sort_by', 'sort', 'order_by'],
  sort_order: ['sort_order', 'order', 'direction'],
  confirm: ['confirm', 'confirmed', 'sure'],
  keyword: ['keyword', 'search', 'q', 'query'],
  limit: ['limit', 'top', 'count', 'n']
}

/**
 * 按工具推断缺失的 action（对齐 Python `_fix_params` 的 action 推断）。
 * 只覆盖**本批次已注册的工具**（game_data / ceshu）；Python 里还有 shell / file_ops /
 * code / ui_control 的推断分支，待相应技能在 A1-5 接线时一并补上。
 */
export function inferAction(toolId: string, params: Record<string, unknown>): string {
  if (typeof params.action === 'string' && params.action !== '') return params.action
  if (toolId.includes('system.game_data')) {
    if (params.keyword || params.sort_by) return 'query'
    if (params.data_type && !params.item_id) {
      if (params.field || params.value) return 'update'
      if (params.name) return 'create'
      return 'list'
    }
    if (params.item_id) return 'update'
  }
  if (toolId.includes('system.ceshu')) {
    if (params.ceshu_id) return 'get'
    return 'list'
  }
  return ''
}

/**
 * 修正调用参数（对齐 Python `_fix_params` + `normalize_params`）：
 * 1) action 别名归一（含中文）；2) 缺失 action 按工具推断；3) 参数别名收敛到规范名。
 * 输入不被修改，返回新对象。
 */
export function fixParams(toolId: string, rawParams: Record<string, unknown> | undefined): Record<string, unknown> {
  const params: Record<string, unknown> = { ...(rawParams ?? {}) }

  if (typeof params.action === 'string' && params.action !== '') {
    const key = params.action.toLowerCase()
    params.action = ACTION_ALIASES[key] ?? key
  }

  const inferred = inferAction(toolId, params)
  if (inferred !== '' && (params.action === undefined || params.action === '')) {
    params.action = inferred
  }

  for (const [canonical, aliases] of Object.entries(PARAM_ALIASES)) {
    if (params[canonical] !== undefined) continue
    for (const alias of aliases) {
      if (params[alias] !== undefined) {
        params[canonical] = params[alias]
        if (alias !== canonical) delete params[alias]
        break
      }
    }
  }

  return params
}
