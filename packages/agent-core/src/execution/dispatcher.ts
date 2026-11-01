/**
 * 技能调度器内核。
 *
 * 职责：注册表 + 名称解析（精确/模糊）+ 危险操作确认门 + 结构化错误。
 *
 * 有意偏离 旧版（已在 `docs/a-tier-plan.md` 记录）：
 *  - **不移植** MCP 注册、SubAgent 通道、`execute_parallel`（拓扑排序 + 线程池）——
 *    前者是 A1-5 的接线，后者是 旧版/QThread 专有模型（TS 侧线程模型改为事件流）。
 *  - 模糊索引的别名表只保留**已注册技能相关**的条目；旧版 那张 200 行长表里
 *    大量映射指向本批次未注册的工具（`system.file_system` 等），照搬会产出指向
 *    不存在技能的映射，反而有害。
 *  - 旧版 的全局可变「已禁止工具/操作」集合改为 `checkPermission` 的显式入参，
 *    避免进程级隐式状态；调度器本身只做「危险确认门」。
 *  - **action 别名在调度器层统一归一**。
 *    单一归一化点更稳，但副作用是：危险确认令牌与「高危操作需用户确认: 工具/操作」里的
 *    操作名是**规范动作名**（如 `exec` → `execute`），旧版 则保留原文。
 */

import {
  RISK_LEVEL,
  checkPermission,
  fixParams,
  getToolCatalogLine,
  getToolDescription,
  normalizeSkillResult,
  toJsonSchema,
  type RiskLevel,
  type SkillExecutionContext,
  type SkillProtocol,
  type SkillResult,
  type ToolFunctionSchema
} from '@mobai/shared/agent/config'
import {
  ToolsService,
  ToolExecutionPipeline,
  createTimeoutPolicy,
  toToolDefinition,
  type ToolExecutionMode
} from '@mobai/shared/agent/toolRuntime'
import { createRepeatToolReminderGuard } from '@mobai/shared/agent/guard'

/** 模糊索引中使用的别名（仅覆盖已注册技能的相关概念） */
const FUZZY_ALIASES: Record<string, string> = {
  data: 'system.game_data',
  game_data: 'system.game_data',
  item: 'system.game_data',
  items: 'system.game_data',
  数据: 'system.game_data',
  数据表: 'system.game_data',
  角色: 'system.game_data',
  怪物: 'system.game_data',
  技能: 'system.game_data',
  装备: 'system.game_data',
  道具: 'system.game_data',
  条目: 'system.game_data',
  list_types: 'system.game_data',
  类型: 'system.game_data',
  查询: 'system.game_data',
  列表: 'system.game_data',
  新建: 'system.game_data',
  创建: 'system.game_data',
  修改: 'system.game_data',
  ask: 'tool.ask_user',
  ask_user: 'tool.ask_user',
  question: 'tool.ask_user',
  提问: 'tool.ask_user',
  询问: 'tool.ask_user',
  澄清: 'tool.ask_user',
  ceshu: 'system.ceshu',
  planning: 'system.ceshu',
  gdd: 'system.ceshu',
  策划: 'system.ceshu',
  策划书: 'system.ceshu',
  策划案: 'system.ceshu'
}

/** 技能注册表 */
export class SkillRegistry {
  private readonly skills = new Map<string, SkillProtocol>()

  /** 注册技能；id 为空时拒绝 */
  register(skill: SkillProtocol): boolean {
    if (skill.id === '') return false
    this.skills.set(skill.id, skill)
    return true
  }

  unregister(id: string): boolean {
    return this.skills.delete(id)
  }

  get(id: string): SkillProtocol | undefined {
    return this.skills.get(id)
  }

  list(): SkillProtocol[] {
    return [...this.skills.values()]
  }

  get count(): number {
    return this.skills.size
  }

  clear(): void {
    this.skills.clear()
  }
}

/** 技能调度器：注册 + 解析 + 安全门 + 结构化错误 */
export class SkillDispatcher {
  private readonly registry = new SkillRegistry()
  /**
   * 描述词派生索引（**弱**）：从 `skill.description` 前几个词切出来的键。
   *
   * 只为兜住"模型说了个人话、恰好和描述里的某个词对上"的场景，**不得压过显式别名**。
   * 曾经它和显式别名同处一个 Map，于是 `策划书` 被 `system.tech_doc` 的描述
   * （"…区别于策划书 GDD…"）整段包含，按"键最长者胜"抢走了解析结果——
   * 用户说"策划书"却拿到技术设计文档。见下方 `fuzzyMatch` 的两级查找。
   */
  private descIndex = new Map<string, string>()
  /** id 片段 + 显式别名索引（**强**）：命中即用，优先级高于 `descIndex` */
  private aliasIndex = new Map<string, string>()
  private readonly maxAllowedRisk: RiskLevel
  /**
   * dsh 形状的工具运行时（`@mobai/shared/agent/toolRuntime`）。
   *
   * 与技能注册表**同源**：`register()` 时把技能适配成 `ToolDefinition` 同步进来，
   * 执行统一走 `pipeline`（参数无损快照/冻结 → 策略链 → canonical 输出校验 → render）。
   */
  private readonly tools = new ToolsService()
  private readonly pipeline = new ToolExecutionPipeline(this.tools)

  /**
   * @param options.maxAllowedRisk 风险**硬上限**（配置式禁止，超过即拒绝、连确认都不能放行）。
   *
   * ⚠️ 缺省 `SYSTEM`（= 最高档，即不设上限），与「危险确认门」分工不同，不可互相替代：
   *  - 硬上限 = 部署方**一刀切禁止**某类操作（如纯云端会话禁掉 `system.code`）；
   *  - 确认门 = **交互式放行**，用户在当轮明确点过同意。
   * 默认不设上限是因为本项目所有 SYSTEM 级操作（`system.code` 等）本就由确认门把关；
   * 若在这里默认 `FILE_SYSTEM`（`protocol.ts` 的 `DEFAULT_MAX_ALLOWED_RISK`），
   * 会让 `system.code` **即便用户确认也无法执行** —— 那是行为破坏，不是加强安全。
   *
   * 改前该字段存了却从不读取（`riskCeiling` getter 也无调用点）：形似安全策略、实则零守卫。
   */
  constructor(options: { maxAllowedRisk?: RiskLevel } = {}) {
    this.maxAllowedRisk = options.maxAllowedRisk ?? RISK_LEVEL.SYSTEM
    // 超时策略是流水线的第一层：只有声明了 `timeoutMs` 的工具才会被 arm deadline
    this.pipeline.use(createTimeoutPolicy((name) => this.tools.get(name)))
    /*
     * 原生重复调用提醒（对齐 dsh `guard/repeat-tool-reminder`）。
     * 作为流水线**执行后守卫**常驻：每次工具调用后在 `tools/post-execute` 阶段检测连续重复，
     * 命中则把建议性提醒附到 `ToolExecutionResult.advisoryContexts`，由循环注入为 user 消息。
     * 中文文案、按会话隔离、只提醒不否决——与 dsh 行为同源，但**不再依赖 cordis 运行时**。
     */
    this.pipeline.usePostExecGuard(createRepeatToolReminderGuard())
  }

  register(skill: SkillProtocol): boolean {
    const ok = this.registry.register(skill)
    if (ok) {
      // 同一份注册同步进工具运行时（适配层负责补 canonical 输出 / 展示投影 / 执行器元数据）
      this.tools.register(toToolDefinition(skill))
      this.buildFuzzyIndex()
    }
    return ok
  }

  unregister(id: string): boolean {
    const ok = this.registry.unregister(id)
    if (ok) {
      this.tools.unregister(id)
      this.buildFuzzyIndex()
    }
    return ok
  }

  get(id: string): SkillProtocol | undefined {
    return this.registry.get(id)
  }

  list(): SkillProtocol[] {
    return this.registry.list()
  }

  get count(): number {
    return this.registry.count
  }

  clear(): void {
    this.registry.clear()
    this.tools.clear()
    this.descIndex.clear()
    this.aliasIndex.clear()
  }

  /**
   * 并发分类（fail-closed）：供 Brain 循环的并行预启动判断。
   *
   * 只有技能显式声明 `isConcurrencySafe` 且**精确返回 `true`** 才 parallel；
   * 其余一律 exclusive（与 dsh `ToolExecutionPipeline.executionMode` 同义）。
   * @param toolName - 已解析的工具名
   * @param args - 已修正的参数
   */
  executionMode(toolName: string, args: Record<string, unknown>): ToolExecutionMode {
    return this.pipeline.executionMode({ name: toolName, arguments: args })
  }

  /** 供 A1-2 组装提示词用——**全量多行**描述，含参数明细 */
  toolsDescription(): string {
    return this.registry
      .list()
      .map((skill) => getToolDescription(skill))
      .join('\n\n')
  }

  /**
   * 供提示词注入用（M2/G7 **渐进披露**）：每个工具**一行摘要**，不含参数明细。
   * 参数由 `toolsJsonSchema()` 随 function-calling 请求下发，文本里不重复。
   */
  toolCatalog(): string {
    return this.registry
      .list()
      .map((skill) => getToolCatalogLine(skill))
      .join('\n')
  }

  /**
   * 供 LLM Function Calling 用。
   *
   * ⚠️ 返回的是**内层** `{name,description,parameters}`（同一个函数也供 `agent:listTools` 的
   * UI 编辑器使用），**不是**可直接下发的线格式 —— 下发前需经 `toFunctionCallingTools` 补
   * `{type:'function'}` 外层（`brainService` 已统一处理）。
   */
  toolsJsonSchema(): ToolFunctionSchema[] {
    return this.registry.list().map((skill) => toJsonSchema(skill))
  }

  /** 把技能 id 与描述切成模糊索引键（>=3 字符的 id 片段 / >=4 字符的描述词） */
  private buildFuzzyIndex(): void {
    const alias = new Map<string, string>()
    const desc = new Map<string, string>()
    for (const skill of this.registry.list()) {
      for (const token of skill.id.replace(/^system\./, '').replace(/[._]/g, ' ').split(/\s+/)) {
        if (token.length >= 3 && !alias.has(token.toLowerCase())) alias.set(token.toLowerCase(), skill.id)
      }
      const descWords = skill.description.toLowerCase().split(/[\s、，,。:：]+/)
      for (const word of descWords.slice(0, 10)) {
        if (word.length >= 4 && !desc.has(word)) desc.set(word, skill.id)
      }
    }
    for (const [key, toolId] of Object.entries(FUZZY_ALIASES)) {
      if (this.registry.get(toolId) !== undefined && !alias.has(key)) alias.set(key, toolId)
    }
    this.aliasIndex = alias
    this.descIndex = desc
  }

  /** 在一张索引上做「包含匹配」，取键最长者为最佳；无候选返回 null */
  private static bestIn(index: Map<string, string>, needle: string): string | null {
    const candidates: Array<{ score: number; mapped: string }> = []
    for (const [key, mapped] of index) {
      if (needle.includes(key)) candidates.push({ score: key.length, mapped })
      else if (key.includes(needle)) candidates.push({ score: Math.floor(key.length / 2), mapped })
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0]?.mapped ?? null
  }

  /**
   * 名称解析：精确 → **显式别名/id 片段** → 描述词。
   *
   * 两级查找是刻意的（见 `descIndex` 的注释）：描述是**给模型读的自然语言**，
   * 里面会提到别的技能名（"区别于策划书 GDD"），拿它当解析依据天然会误伤。
   * 故显式别名一旦命中就不再往下走；只有显式索引完全无候选时才让描述词兜底。
   */
  fuzzyMatch(name: string): string | null {
    if (name === '') return null
    const needle = name.toLowerCase().trim()
    if (this.registry.get(needle) !== undefined) return needle

    return SkillDispatcher.bestIn(this.aliasIndex, needle) ?? SkillDispatcher.bestIn(this.descIndex, needle)
  }

  /**
   * 执行工具。
   * 危险确认令牌与本次 (工具, action) 匹配时放行并**就地置空**（一次性）。
   * 技能抛错不冒泡，统一收敛为结构化错误。
   */
  async execute(
    toolName: string,
    params: Record<string, unknown> | undefined,
    ctx: SkillExecutionContext = {}
  ): Promise<SkillResult> {
    const resolved = this.fuzzyMatch(toolName)
    if (resolved === null) {
      return { success: false, error: `未知工具: ${toolName}`, message: '' }
    }
    const skill = this.registry.get(resolved)
    if (skill === undefined) {
      return { success: false, error: `未注册技能: ${resolved}`, message: '' }
    }

    const fixed = fixParams(resolved, params)
    const action = typeof fixed.action === 'string' ? fixed.action : ''

    // 信任边界：模型**永远不能自带 confirm**。`fixParams` 会把 confirmed/sure 别名归一成 confirm，
    // 若放任，模型只要在参数里写 `confirm:true` 就能跳过 delete/rollback 的用户询问。
    // 唯一可信来源是 Brain 在用户批准后写入 `ctx.dangerConfirmed` 的一次性令牌。
    delete fixed.confirm

    // 权限判定统一走 `protocol.checkPermission`（显式禁止 → 硬上限 → 危险确认 三段）。
    // 改前这里是 `resolveRiskLevel(...) >= RISK_LEVEL.SYSTEM` 的手写判定 + 一个从不读取的
    // `maxAllowedRisk` 字段 ⇒ 「限制工具/动作」这一整档能力在调度器层不可达。
    const check = checkPermission(resolved, action, { maxAllowedRisk: this.maxAllowedRisk })
    if (!check.allowed) {
      return {
        success: false,
        error: `超出风险上限（${resolved}/${action}，等级 ${check.risk}）`,
        message: ''
      }
    }
    const token = ctx.dangerConfirmed
    const tokenMatches = token !== null && token !== undefined && token.tool === resolved && token.action === action
    if (check.needsConfirmation) {
      // SYSTEM 档：没有可信令牌一律拒绝（连确认都不能放行）。
      if (!tokenMatches) {
        return { success: false, error: `高危操作需用户确认: ${resolved}/${action}`, message: '' }
      }
      ctx.dangerConfirmed = null
    } else if (tokenMatches) {
      // DATA_WRITE 档的技能内部确认（delete / rollback）：用户已在 Brain 侧批准，
      // 用可信令牌把 confirm 注入给技能——**不**信任模型参数里的 confirm。
      ctx.dangerConfirmed = null
      fixed.confirm = true
    }

    // 统一走工具运行时：无损快照/冻结 → 策略链（超时）→ canonical 输出校验 → render。
    // 技能抛错不再需要这里 catch——流水线会把任何异常收敛成结构化失败结果。
    const candidateSignal = ctx.signal
    const signal = candidateSignal instanceof AbortSignal ? candidateSignal : undefined
    const execution = await this.pipeline.execute({
      name: resolved,
      arguments: fixed,
      ...(signal !== undefined ? { signal } : {}),
      hostContext: ctx
    })
    if (execution.isError) {
      return { success: false, error: execution.error.message, message: '' }
    }
    const normalized = normalizeSkillResult(execution.value)
    // 执行后守卫的建议性上下文（如重复调用提醒）随结果上抛，由循环注入为 user 消息
    return execution.advisoryContexts !== undefined
      ? { ...normalized, advisoryContexts: execution.advisoryContexts }
      : normalized
  }

  /**
   * 带审批的工具执行（审批下沉）：给「技能内部再调工具」用（如 `system.workflow`）。
   *
   * 与 `execute` 的区别：目标工具风险 ≥ SYSTEM 时，先经 `ctx.requestApproval` 询问；
   * **没有审批通道 ⇒ fail-closed**（`APPROVAL_REQUIRED`），绝不裸执行——堵住「技能内调工具绕过审批」。
   * 循环的顶层调用仍走 `execute`（审批已在循环层完成），避免双重询问。
   */
  async executeGated(
    toolName: string,
    params: Record<string, unknown> | undefined,
    ctx: SkillExecutionContext = {}
  ): Promise<SkillResult> {
    const resolved = this.fuzzyMatch(toolName)
    if (resolved === null) return this.execute(toolName, params, ctx)
    const fixed = fixParams(resolved, params)
    const action = typeof fixed.action === 'string' ? fixed.action : ''
    const check = checkPermission(resolved, action, { maxAllowedRisk: this.maxAllowedRisk })

    // 只有「需要确认且未超上限」才走审批；超上限由 execute 统一报错
    if (check.allowed && check.needsConfirmation) {
      const approver = ctx.requestApproval as
        | ((tool: string, params: Record<string, unknown>) => Promise<boolean>)
        | undefined
      if (typeof approver !== 'function') {
        return { success: false, error: 'APPROVAL_REQUIRED', message: '子步骤需要审批，但当前无审批通道' }
      }
      const approved = await approver(resolved, params ?? {})
      if (!approved) {
        return { success: false, error: 'APPROVAL_DENIED', message: `用户拒绝执行 ${resolved}` }
      }
      // 注入一次性令牌，让 execute 内部的 SYSTEM 门放行（execute 会就地消费并置空）
      return this.execute(toolName, params, { ...ctx, dangerConfirmed: { tool: resolved, action } })
    }
    return this.execute(toolName, params, ctx)
  }

  /** 当前允许的最大风险（只读；策略判定统一走 `checkPermission`） */
  get riskCeiling(): RiskLevel {
    return this.maxAllowedRisk
  }
}
