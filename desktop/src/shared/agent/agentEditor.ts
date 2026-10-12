/**
 * 智能体编辑器 —— 纯逻辑层（零 React / 零 Electron，Node 下可单测）。
 *
 * ## 范围判定（读 Python 真源 `src/ui/widgets/team_dialog.py` 后得出）
 *
 * PyQt 的 TeamDialog 是 818 行的「双栏对话框」，但**两半在 TS 侧的数据支撑完全不同**：
 *
 * ### 判定为「不做」（PyQt 侧结构存在，TS 侧无真源 / 无消费者 → 做了就是假控件）
 *
 * | PyQt 位置 | 功能 | 不做的依据 |
 * | --- | --- | --- |
 * | `team_dialog.py:80-105, 669-770` | 团队列表 CRUD（新建/删除/保存/选中） | 依赖 `AgentManager.create_team/update_team/delete_team`（`core/agent/agents/agent_manager.py:233-253`），TS 侧**无** `Team` 类型、**无** teams.json、**无**任何 IPC 通道；`grep -rn "team\|Team" desktop/src/` 在 agent 域零命中。存哪儿都定不下来 |
 * | `team_dialog.py:178-237` | 成员勾选列表 | 数据源是 `AgentManager.list_default_agents()`（`agent_manager.py:173`），TS 侧**无** `DEFAULT_AGENTS`；且 `:717` 的默认勾选集合 `{"data_operator","planner","analyst"}` 是 PyQt 侧硬编码字面量，照搬即造假数据 |
 * | `team_dialog.py:243-273` | 「编辑提示词」 | 写入 `Team.custom_prompts`（`agent_manager.py:58`），TS 侧无 Team 容器；`AgentBrainService.chat()`（`main/agent/brainService.ts:111`）只读 `PreferenceStore`，不读团队提示词 → 改了没人消费 |
 * | `team_dialog.py:279-355` | 「配置工具」（成员级工具覆盖） | 写入 `Team.member_tools`（`agent_manager.py:59`），同上无消费者。**注意**：本模块只做「工具风险可见」，不做「按成员裁剪工具」——后者是团队概念，前者是调度器事实 |
 * | `team_dialog.py:460-663` | 「管理智能体定义」（自定义 agent 增删改） | 依赖 `register_agent`/`unregister_agent`（`agent_manager.py:205-225`）写 agents.json；TS 侧自定义 agent **无消费者**——`brainService.ts:120` 恒用 `buildSystemPrompts` 的单一身份，不按 agent 分派 |
 * | `team_dialog.py:772-781` | 「使用此团队」/「切换到个人模式」 | 依赖 `set_current_team`（`agent_manager.py:256`）；TS 侧无「当前团队」状态，Brain 也不读 → 点了没有任何可观测变化 |
 * | `team_dialog.py:812-818` | 底栏「当前: 团队模式 / 个人模式」 | 同上，`is_team_mode()`（`agent_manager.py:268`）无对应状态 |
 *
 * ### 判定为「做」（TS 侧有真实数据 **且** 有真实消费者）
 *
 * | PyQt 位置 | 功能 | TS 侧真源 |
 * | --- | --- | --- |
 * | `team_dialog.py:358-421` `_collect_all_tools` | 汇总所有可用工具 | IPC `agent:listTools`（`main/ipc.ts:260`）→ `SkillDispatcher.toolsJsonSchema()`（`main/agent/dispatcher.ts:148`），返回**真实已注册**技能的 id/描述/参数 schema |
 * | `team_dialog.py:362-395` 系统工具分类 | 工具按分类列出 | 同一份 IPC 数据 + `shared/agent/protocol.ts:30` 的 `TOOL_RISK_MAP` 真实风险表。**不移植** `:369-389` 的 `desc_map`——那是 PyQt 侧硬编码字面量，且与 TS 实际工具集不符（它列了 `system.git`/`system.shell` 等 TS 未注册的工具）；TS 侧描述一律取 `skill.description` 真实值 |
 * | `team_dialog.py:279-292` 的**风险语义**（本面板改造版） | 哪些工具危险、会不会弹审批 | `resolveRiskLevel`（`protocol.ts:88`）+ `RISK_LEVEL`。这是**调度器实际执行的判定**：`dispatcher.ts:212` 用同一函数在 `risk >= SYSTEM` 时要求 `dangerConfirmed` |
 *
 * ## 一条重要的「不做」：工具准入上限
 *
 * `checkPermission`（`protocol.ts:107`）在 `risk > maxAllowedRisk` 时返回 `allowed: false`，而
 * `SkillDispatcher` 的构造上限是 `FILE_SYSTEM`（`dispatcher.ts:107`）。但 **`dispatcher.execute`
 * 根本不调用 `checkPermission`**——它只做危险确认门。故「某工具当前被禁止执行」在 TS 侧**不是事实**，
 * 本模块因此**不暴露** allowed/blocked 字段，避免面板显示一个运行时并不生效的结论。
 */

import {
  RISK_LEVEL,
  resolveRiskLevel,
  type JsonObjectSchema,
  type JsonSchemaProperty,
  type RiskLevel
} from './protocol'

/* ------------------------------------------------------------------ */
/* 风险等级文案                                                          */
/* ------------------------------------------------------------------ */

/** 风险等级 → 中文标签（与 `protocol.ts` 的 `RISK_LEVEL` 数值一一对应） */
export const RISK_LABELS: Readonly<Record<RiskLevel, string>> = {
  [RISK_LEVEL.READ_ONLY]: '只读',
  [RISK_LEVEL.DATA_WRITE]: '数据写入',
  [RISK_LEVEL.FILE_SYSTEM]: '文件系统',
  [RISK_LEVEL.NETWORK]: '网络访问',
  [RISK_LEVEL.SYSTEM]: '系统级'
}

/** 触发危险确认的阈值（对齐 `dispatcher.ts:212` 的 `>= RISK_LEVEL.SYSTEM`） */
export const CONFIRM_THRESHOLD: RiskLevel = RISK_LEVEL.SYSTEM

/** 风险标签查询；越界数值回退到「未知」而非抛错（面板不该因一条脏数据白屏） */
export function riskLabel(risk: RiskLevel): string {
  return RISK_LABELS[risk] ?? '未知'
}

/** 是否触发危险确认门（与调度器判定完全同源，避免面板与运行时结论分叉） */
export function needsConfirmation(risk: RiskLevel): boolean {
  return risk >= CONFIRM_THRESHOLD
}

/* ------------------------------------------------------------------ */
/* 工具 id 分类                                                          */
/* ------------------------------------------------------------------ */

/** 工具 id 的命名空间（`system.*` / `tool.*` / 其他） */
export type ToolNamespace = 'system' | 'tool' | 'other'

/** 命名空间 → 中文分类名（`team_dialog.py:393` 的「系统工具」是 Python 侧的自造分类名） */
export const NAMESPACE_LABELS: Readonly<Record<ToolNamespace, string>> = {
  system: '系统工具',
  tool: '交互工具',
  other: '其他工具'
}

/** 按 id 前缀取命名空间：`system.game_data` → `system`；无前缀 → `other` */
export function toolNamespace(toolId: string): ToolNamespace {
  const dot = toolId.indexOf('.')
  if (dot <= 0) return 'other'
  const prefix = toolId.slice(0, dot)
  if (prefix === 'system' || prefix === 'tool') return prefix
  return 'other'
}

/** 去掉命名空间前缀的短名，用于紧凑展示：`system.game_data` → `game_data` */
export function toolShortName(toolId: string): string {
  const dot = toolId.indexOf('.')
  return dot > 0 ? toolId.slice(dot + 1) : toolId
}

/* ------------------------------------------------------------------ */
/* 参数 schema → 视图模型                                               */
/* ------------------------------------------------------------------ */

/** 单个参数的展示模型 */
export interface ToolParamView {
  /** 参数名 */
  name: string
  /** JSON Schema 类型（`string` / `integer` / `array` …） */
  type: string
  /** 是否在 schema 的 `required` 列表中 */
  required: boolean
  /** schema 描述；缺失时为空串（不填占位假文案） */
  description: string
  /** 枚举取值；非枚举参数为空数组 */
  enumValues: string[]
}

/** 从 JSON Schema 的 `properties` 摊出参数视图；`properties` 缺失时返回空数组 */
export function buildParamViews(parameters: JsonObjectSchema | null | undefined): ToolParamView[] {
  const properties = parameters?.properties
  if (properties === null || properties === undefined || typeof properties !== 'object') return []
  const required = new Set<string>(parameters?.required ?? [])
  return Object.entries(properties).map(([name, prop]) => toParamView(name, prop, required.has(name)))
}

/** 单个属性 → 参数视图（`prop` 可能是脏数据，按字段逐一防御性取值） */
function toParamView(name: string, prop: JsonSchemaProperty | undefined, required: boolean): ToolParamView {
  const safe = prop ?? { type: 'unknown' }
  const enumValues = Array.isArray(safe.enum) ? safe.enum.map((item) => String(item)) : []
  return {
    name,
    type: typeof safe.type === 'string' && safe.type !== '' ? safe.type : 'unknown',
    required,
    description: typeof safe.description === 'string' ? safe.description : '',
    enumValues
  }
}

/** 从参数视图里取 `action` 参数的枚举值（工具的动作轴；无 `action` 参数时返回空数组） */
export function actionNamesOf(params: readonly ToolParamView[]): string[] {
  const action = params.find((param) => param.name === 'action')
  return action === undefined ? [] : [...action.enumValues]
}

/* ------------------------------------------------------------------ */
/* 动作 → 风险                                                          */
/* ------------------------------------------------------------------ */

/** 单个 (工具, 动作) 的展示模型 */
export interface ToolActionView {
  /** 动作名（来自 schema 的 `action` 枚举） */
  action: string
  /** 该动作的风险等级（`resolveRiskLevel` 的真实判定） */
  risk: RiskLevel
  /** 风险中文标签 */
  riskLabel: string
  /** 是否会触发危险确认门 */
  needsConfirmation: boolean
}

/**
 * 列出工具的全部动作及其风险。
 *
 * 退化规则：schema 未声明 `action` 枚举时返回**空数组**（而不是伪造一个 `(默认)` 动作）——
 * 无动作轴的工具其风险由工具级 `resolveRiskLevel(toolId)` 单独给出。
 */
export function buildActionViews(toolId: string, params: readonly ToolParamView[]): ToolActionView[] {
  return actionNamesOf(params).map((action) => {
    const risk = resolveRiskLevel(toolId, action)
    return { action, risk, riskLabel: riskLabel(risk), needsConfirmation: needsConfirmation(risk) }
  })
}

/* ------------------------------------------------------------------ */
/* 工具 → 视图模型                                                      */
/* ------------------------------------------------------------------ */

/** IPC `agent:listTools` 返回的单条工具（结构见 `shared/ipc.ts:204`） */
export interface ToolListEntry {
  name: string
  description: string
  parameters: JsonObjectSchema
}

/** 单个工具的完整展示模型 */
export interface ToolView {
  /** 完整工具 id */
  id: string
  /** 去掉前缀的短名 */
  shortName: string
  /** 命名空间 */
  namespace: ToolNamespace
  /** 命名空间中文名 */
  namespaceLabel: string
  /** 工具描述（取 `skill.description` 真实值） */
  description: string
  /** 全部动作及风险；无动作轴时为空数组 */
  actions: ToolActionView[]
  /** 全部参数 */
  params: ToolParamView[]
  /** 工具最高风险：有动作轴时取动作最大值，否则取工具级判定 */
  highestRisk: RiskLevel
  /** 最高风险的中文标签 */
  highestRiskLabel: string
  /** 最高风险是否触发危险确认 */
  needsConfirmation: boolean
}

/**
 * 风险等级计数表的全零初值。
 *
 * 显式列出 5 个键（而非 `for (const risk of RISK_ORDER)` 循环）：后者在类型系统眼里
 * 只能证明「这 5 个键被赋了 0」，无法证明**没有第 6 个键**——将来 `RISK_LEVEL` 加一项时
 * 显式字面量会立刻报「缺属性」，是这里想要的失败方式。
 */
function emptyRiskCounts(): Record<RiskLevel, number> {
  return {
    [RISK_LEVEL.READ_ONLY]: 0,
    [RISK_LEVEL.DATA_WRITE]: 0,
    [RISK_LEVEL.FILE_SYSTEM]: 0,
    [RISK_LEVEL.NETWORK]: 0,
    [RISK_LEVEL.SYSTEM]: 0
  }
}

/** 单个工具 → 视图模型 */
export function buildToolView(entry: ToolListEntry): ToolView {
  const params = buildParamViews(entry.parameters)
  const actions = buildActionViews(entry.name, params)
  // 工具级风险：无动作轴时 `resolveRiskLevel('')` 会落到 `DEFAULT_TOOL_RISK`，
  // 故只在**确无**动作轴时才用它——避免用回退值盖掉逐动作的真实判定。
  // `reduce<RiskLevel>` 必须显式给泛型：`RiskLevel` 是字面量联合，
  // 交给推断会退化成 `0`，导致 accumulator 类型冲突。
  const highestRisk: RiskLevel =
    actions.length > 0
      ? actions.reduce<RiskLevel>((max, item) => (item.risk > max ? item.risk : max), RISK_LEVEL.READ_ONLY)
      : resolveRiskLevel(entry.name)
  const namespace = toolNamespace(entry.name)
  return {
    id: entry.name,
    shortName: toolShortName(entry.name),
    namespace,
    namespaceLabel: NAMESPACE_LABELS[namespace],
    // 描述缺失/类型不对一律归一为空串：数据层不产出 `undefined`，
    // 免得渲染层每个使用点都要自己判空（对齐 `ToolView.description` 的契约）。
    description: typeof entry.description === 'string' ? entry.description : '',
    actions,
    params,
    highestRisk,
    highestRiskLabel: riskLabel(highestRisk),
    needsConfirmation: needsConfirmation(highestRisk)
  }
}

/** 按「风险降序 → id 升序」排序：把危险工具顶到最前，且顺序完全确定（无并列随机性） */
export function sortToolViews(views: readonly ToolView[]): ToolView[] {
  return [...views].sort((a, b) => (b.highestRisk - a.highestRisk) || a.id.localeCompare(b.id))
}

/* ------------------------------------------------------------------ */
/* 工具目录 + 检索                                                       */
/* ------------------------------------------------------------------ */

/** 工具清单面板的完整数据模型 */
export interface ToolCatalog {
  /** 排序后的全部工具 */
  tools: ToolView[]
  /** 工具总数 */
  toolCount: number
  /** 动作总数（各工具动作数之和） */
  actionCount: number
  /** 触发危险确认的工具数 */
  confirmationCount: number
  /** 最高风险等级（全清单聚合；空清单为 `READ_ONLY`） */
  peakRisk: RiskLevel
  /** 各风险等级的工具数（键为 `RISK_LEVEL` 的数值） */
  riskCounts: Readonly<Record<RiskLevel, number>>
}

/** 空目录（加载完成但调度器一个技能都没注册时的合法状态） */
export function emptyToolCatalog(): ToolCatalog {
  return {
    tools: [],
    toolCount: 0,
    actionCount: 0,
    confirmationCount: 0,
    peakRisk: RISK_LEVEL.READ_ONLY,
    riskCounts: emptyRiskCounts()
  }
}

/**
 * IPC `agent:listTools` 的结果 → 工具目录。
 *
 * 脏数据防御：跳过没有字符串 `name` 的条目（渲染层不该因一条坏数据整体失败）。
 */
export function buildToolCatalog(entries: readonly ToolListEntry[] | null | undefined): ToolCatalog {
  if (!Array.isArray(entries) || entries.length === 0) return emptyToolCatalog()

  const views: ToolView[] = []
  for (const entry of entries) {
    if (entry === null || entry === undefined) continue
    if (typeof entry.name !== 'string' || entry.name === '') continue
    views.push(
      buildToolView({
        name: entry.name,
        description: typeof entry.description === 'string' ? entry.description : '',
        parameters: entry.parameters
      })
    )
  }
  if (views.length === 0) return emptyToolCatalog()

  const sorted = sortToolViews(views)
  const riskCounts = emptyRiskCounts()
  let actionCount = 0
  let confirmationCount = 0
  let peakRisk: RiskLevel = RISK_LEVEL.READ_ONLY
  for (const view of sorted) {
    actionCount += view.actions.length
    if (view.needsConfirmation) confirmationCount += 1
    if (view.highestRisk > peakRisk) peakRisk = view.highestRisk
    riskCounts[view.highestRisk] += 1
  }
  return { tools: sorted, toolCount: sorted.length, actionCount, confirmationCount, peakRisk, riskCounts }
}

/** 检索选项 */
export interface ToolFilter {
  /** 关键词：命中 id / 短名 / 描述 / 动作名（大小写不敏感）；空串或纯空白视为不过滤 */
  query?: string
  /** 只看会触发危险确认的工具 */
  onlyRisky?: boolean
}

/**
 * 按关键词 + 风险开关过滤工具目录。**不改变**统计口径（统计始终反映全量），
 * 这样标题栏的「N 个工具」不会随搜索跳变而误导。
 */
export function filterToolViews(views: readonly ToolView[], filter: ToolFilter = {}): ToolView[] {
  const query = (filter.query ?? '').trim().toLowerCase()
  const onlyRisky = filter.onlyRisky === true
  if (query === '' && !onlyRisky) return [...views]
  return views.filter((view) => {
    if (onlyRisky && !view.needsConfirmation) return false
    if (query === '') return true
    if (view.id.toLowerCase().includes(query)) return true
    if (view.shortName.toLowerCase().includes(query)) return true
    if (view.description.toLowerCase().includes(query)) return true
    return view.actions.some((action) => action.action.toLowerCase().includes(query))
  })
}

/* ------------------------------------------------------------------ */
/* 标题栏摘要                                                            */
/* ------------------------------------------------------------------ */

/** 标题栏摘要文案（单测锁住措辞，避免各处各写一份） */
export function summarizeCatalog(catalog: ToolCatalog): string {
  if (catalog.toolCount === 0) return '调度器当前没有注册任何技能'
  const parts = [`${catalog.toolCount} 个工具`, `${catalog.actionCount} 个动作`]
  if (catalog.confirmationCount > 0) {
    parts.push(`${catalog.confirmationCount} 个需二次确认（最高 ${riskLabel(catalog.peakRisk)}）`)
  } else {
    parts.push('均无需二次确认')
  }
  return parts.join(' · ')
}
