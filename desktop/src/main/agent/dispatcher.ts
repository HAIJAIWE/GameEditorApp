/**
 * 技能调度器内核（自 Python `core/agent/dispatcher.py` 匹平迁移，A1-1）。
 *
 * 职责：注册表 + 名称解析（精确/模糊）+ 危险操作确认门 + 结构化错误。
 *
 * 有意偏离 Python（已在 `docs/a-tier-plan.md` 记录）：
 *  - **不移植** MCP 注册、SubAgent 通道、`execute_parallel`（拓扑排序 + 线程池）——
 *    前者是 A1-5 的接线，后者是 PyQt/QThread 专有模型（TS 侧线程模型改为事件流）。
 *  - 模糊索引的别名表只保留**已注册技能相关**的条目；Python 那张 200 行长表里
 *    大量映射指向本批次未注册的工具（`system.file_system` 等），照搬会产出指向
 *    不存在技能的映射，反而有害。
 *  - Python 的全局可变「已禁止工具/操作」集合改为 `checkPermission` 的显式入参，
 *    避免进程级隐式状态；调度器本身只做「危险确认门」（与 Python `_check_dangerous` 一致）。
 *  - **action 别名在调度器层统一归一**（Python 是在各技能内部调 `normalize_params`）。
 *    单一归一化点更稳，但副作用是：危险确认令牌与「高危操作需用户确认: 工具/操作」里的
 *    操作名是**规范动作名**（如 `exec` → `execute`），Python 则保留原文。
 */

import {
  RISK_LEVEL,
  fixParams,
  getToolDescription,
  normalizeSkillResult,
  resolveRiskLevel,
  toJsonSchema,
  type JsonObjectSchema,
  type RiskLevel,
  type SkillExecutionContext,
  type SkillProtocol,
  type SkillResult
} from '../../shared/agent/protocol'

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

  /** 注册技能；id 为空时拒绝（对齐 Python `register_skill` 返回 False） */
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

  constructor(options: { maxAllowedRisk?: RiskLevel } = {}) {
    this.maxAllowedRisk = options.maxAllowedRisk ?? RISK_LEVEL.FILE_SYSTEM
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

  /** 供 A1-2 组装提示词用（对齐 Python `get_tools_description`） */
  toolsDescription(): string {
    return this.registry
      .list()
      .map((skill) => getToolDescription(skill))
      .join('\n\n')
  }

  /** 供 LLM Function Calling 用（对齐 Python `get_tools_json_schema`） */
  toolsJsonSchema(): Array<{ name: string; description: string; parameters: JsonObjectSchema }> {
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
   * 名称解析（对齐 Python `fuzzy_match`）：精确 → 索引包含匹配，取「键最长」为最佳。
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
   * 执行工具（对齐 Python `ToolDispatcher.execute` 的解析 → 参数修正 → 危险确认 → 执行）。
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

    // 危险操作确认门（对齐 Python `_check_dangerous`：risk >= SYSTEM 需二次确认）
    if (resolveRiskLevel(resolved, action) >= RISK_LEVEL.SYSTEM) {
      const confirmed = ctx.dangerConfirmed
      if (confirmed !== null && confirmed !== undefined && confirmed.tool === resolved && confirmed.action === action) {
        ctx.dangerConfirmed = null
      } else {
        return { success: false, error: `高危操作需用户确认: ${resolved}/${action}`, message: '' }
      }
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
