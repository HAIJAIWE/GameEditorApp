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
export interface SkillInteraction {
  kind: 'confirm' | 'question'
  /** 展示给用户的文案 */
  prompt: string
  /** kind === 'question' 时的候选选项（留空表示自由文本回答） */
  options?: readonly string[]
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

/** 结构校验：只有 kind 合法且 prompt 非空的才算有效交互请求 */
export function isSkillInteraction(value: unknown): value is SkillInteraction {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (record.kind !== 'confirm' && record.kind !== 'question') return false
  return typeof record.prompt === 'string' && record.prompt !== ''
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
