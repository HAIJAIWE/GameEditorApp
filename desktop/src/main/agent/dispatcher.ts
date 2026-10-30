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
} from '../../shared/agent/config/protocol'

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
  private fuzzyIndex = new Map<string, string>()
  private readonly maxAllowedRisk: RiskLevel

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
  }

  register(skill: SkillProtocol): boolean {
    const ok = this.registry.register(skill)
    if (ok) this.buildFuzzyIndex()
    return ok
  }

  unregister(id: string): boolean {
    const ok = this.registry.unregister(id)
    if (ok) this.buildFuzzyIndex()
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
    this.fuzzyIndex.clear()
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
    const index = new Map<string, string>()
    for (const skill of this.registry.list()) {
      for (const token of skill.id.replace(/^system\./, '').replace(/[._]/g, ' ').split(/\s+/)) {
        if (token.length >= 3 && !index.has(token.toLowerCase())) index.set(token.toLowerCase(), skill.id)
      }
      const descWords = skill.description.toLowerCase().split(/[\s、，,。:：]+/)
      for (const word of descWords.slice(0, 10)) {
        if (word.length >= 4 && !index.has(word)) index.set(word, skill.id)
      }
    }
    for (const [key, toolId] of Object.entries(FUZZY_ALIASES)) {
      if (this.registry.get(toolId) !== undefined && !index.has(key)) index.set(key, toolId)
    }
    this.fuzzyIndex = index
  }

  /**
   * 名称解析：精确 → 索引包含匹配，取「键最长」为最佳。
   * 无可解析目标返回 null。
   */
  fuzzyMatch(name: string): string | null {
    if (name === '') return null
    const needle = name.toLowerCase().trim()
    if (this.registry.get(needle) !== undefined) return needle

    const candidates: Array<{ score: number; mapped: string }> = []
    for (const [key, mapped] of this.fuzzyIndex) {
      if (needle.includes(key)) candidates.push({ score: key.length, mapped })
      else if (key.includes(needle)) candidates.push({ score: Math.floor(key.length / 2), mapped })
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0]?.mapped ?? null
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

    try {
      const raw = await skill.execute(fixed, ctx)
      return normalizeSkillResult(raw)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), message: '' }
    }
  }

  /** 当前允许的最大风险（只读；策略判定统一走 `checkPermission`） */
  get riskCeiling(): RiskLevel {
    return this.maxAllowedRisk
  }
}
