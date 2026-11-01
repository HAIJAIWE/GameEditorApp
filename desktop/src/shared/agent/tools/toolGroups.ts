/**
 * 工具面分组与按档位限量（M3：G2 + DD-3 + DD-4）。
 *
 * ## 为什么单开一个模块
 * DD-3 要求「协议层的 `system.*` 槽位**按场景分组**，本地档每次会话暴露 ≤8 个、云端 ≤15 个」；
 * DD-4 要求「本地档=用户显式选技能（不做模型软路由）、云端档=可软路由但保留显式兜底」。
 * 这两条都是**纯策略**（不碰 IO、不碰 Electron），故独立成模块、可完整 Node 单测，
 * 与 `budget.ts` / `observability.ts` 同属「shared/agent 的纯逻辑层」。
 *
 * ## 与既有模块的关系
 * - 分组只决定**“怎么摆、露几个”**；每个工具**一行摘要**的文本由 `protocol.ts::getToolCatalogLine` 提供
 *   （M2/G7 的渐进披露），本模块只负责**分组标题 + 按档位裁剪**。
 * - 参数的 JSON Schema 仍由 `toolsJsonSchema()` 随 function-calling 请求下发；文本里不重复。
 * - 档位（`AgentRunTier`）来自 `observability.ts`，与 `llmConfig.ts::resolveLlmTier` 同值域
 *   （`cloud` / `local` / `unconfigured`）—— real 档位的解析在 `brainService` 完成，本模块只消费。
 *
 * ## ⚠️ 现状诚实说明（别把「机制」当「已生效」）
 * 本项目**当前只注册 5 个工具**（`system.game_data` / `system.ceshu` / `system.code` /
 * `tool.rollback_ai_changes` / `tool.ask_user`），故 ≤8/≤15 两道上限**恒满足**、截断分支在生产中不触发；
 * 本模块的真实价值是：① 把「工具面必须分组、必须有档位上限」变成**有守卫的约束**，
 * 工具数一旦增长（接 MCP / 补技能）即有硬闸；② 让**提示词按档位给出口径**（本地=显式选、云端=可软路由）。
 */

import { getToolCatalogLine, type SkillProtocol } from '../config'
import type { AgentRunTier } from '../observability'

/* ---- 场景分组（DD-3） ---- */

/**
 * 场景分组 id。设计文档 §344 裁定：本项目面向的**真实场景只有三个**——
 * **策划书创作 / 数据编辑 / 系统与协作**，故分组按这三者切，**不照搬 旧版 的 12 个 `system.*` 槽位**
 * （那会把「一个场景打散到多个槽位」，反而增加模型的选择成本）。
 */
export type ToolGroupId = 'ceshu' | 'data' | 'system'

/** 分组展示名（提示词里作组标题；中文，与面板文案同源） */
export const TOOL_GROUP_LABELS: Readonly<Record<ToolGroupId, string>> = {
  ceshu: '策划书创作',
  data: '数据编辑',
  system: '系统与协作'
}

/** 分组的固定展示顺序（确定性：目录文本与快照断言都依赖它） */
export const TOOL_GROUP_ORDER: readonly ToolGroupId[] = ['data', 'ceshu', 'system']

/**
 * 工具 id → 分组（**必须覆盖全部已注册工具**）。
 * 新增技能却忘了在此登记 ⇒ `toolGroups.test.ts` 的「已注册工具全部分组」守卫会红。
 * 之所以用「中心映射」而非在每个 `SkillProtocol` 上加 `group` 字段：单点、零改动既有技能文件，
 * 且映射是**穷举**的（漏登记可被测试抓住）。
 */
export const TOOL_GROUP_MAP: Readonly<Record<string, ToolGroupId>> = {
  'system.game_data': 'data',
  'system.ceshu': 'ceshu',
  'system.code': 'system',
  'tool.rollback_ai_changes': 'system',
  'tool.ask_user': 'system',
  'tool.spawn_subagent': 'system',
  'system.session_search': 'system',
  'system.todo_write': 'system',
  'system.present_plan': 'system'
}

/** 未登记工具的兜底分组（保守归到「系统与协作」） */
export const DEFAULT_TOOL_GROUP: ToolGroupId = 'system'

/** 取工具所属分组（未登记回退 `DEFAULT_TOOL_GROUP`） */
export function resolveToolGroup(toolId: string): ToolGroupId {
  return TOOL_GROUP_MAP[toolId] ?? DEFAULT_TOOL_GROUP
}

/* ---- 按档位限量（DD-3） ---- */

/**
 * 每档位单次会话可暴露的工具数上限（DD-3）。
 * 依据：本地 4B 在工具过多时会「只挑第一个」（G2 实测），故**本地严于云端**。
 */
export const TOOL_FACE_LIMITS: Readonly<Record<'local' | 'cloud', number>> = {
  // 本地 4B：工具一多就「只挑第一个」，刻意保守（DD-3）。
  // 云端（云端优先，2026-10-28）：上下文大、工具调用稳，放宽到 24；接多 MCP 仍可 `maxTools` 覆写。
  local: 8,
  cloud: 24
}

/**
 * 工具面上限的**全局覆写**（Slice 21）：非 null 时覆盖按档位的默认上限。
 *
 * 动机：接入 MCP 后工具可能远超 8/15。用户可在 MCP 配置里写顶层 `"maxTools": N`，
 * `McpManager` 加载配置时调 `setMaxToolsOverride(N)` —— 不必改这个模块的常量。
 * 默认 null = 沿用 DD-3 的 8/15（本地 4B 工具过多会挑错，故默认保守）。
 */
let maxToolsOverride: number | null = null

/** 设置/清除工具面上限覆写（正整数才生效；null/非法值 = 恢复按档位默认） */
export function setMaxToolsOverride(value: number | null): void {
  maxToolsOverride = value !== null && Number.isFinite(value) && value > 0 ? Math.floor(value) : null
}

/** 取档位对应的工具面上限；有全局覆写则优先，否则 8/15（`unconfigured` 按最保守的本地预算） */
export function faceLimitFor(tier: AgentRunTier): number {
  if (maxToolsOverride !== null) return maxToolsOverride
  return tier === 'cloud' ? TOOL_FACE_LIMITS.cloud : TOOL_FACE_LIMITS.local
}

/* ---- 路由策略（DD-4） ---- */

/**
 * 工具路由策略：
 * - `explicit`：**用户显式选定**可用技能（本地档默认）—— 4B 无能力做软路由，不给它这个自由；
 * - `soft`：**允许模型在暴露面内软挑**（云端档默认），但仍**保留显式选择**作为兜底与可解释性
 *   （`explicitIds` 非空时显式压过软路由）。
 */
export type ToolRoutingPolicy = 'explicit' | 'soft'

/** 由档位解析路由策略（云端可软路由，其余一律显式） */
export function resolveRoutingPolicy(tier: AgentRunTier): ToolRoutingPolicy {
  return tier === 'cloud' ? 'soft' : 'explicit'
}

/* ---- 工具面装配 ---- */

/** 一次会话实际暴露的工具面（面板/提示词/请求三处共用同一份） */
export interface ToolFace {
  tier: AgentRunTier
  policy: ToolRoutingPolicy
  /** 本档位工具数上限 */
  limit: number
  /** 注册表里的工具总数 */
  total: number
  /** 本面暴露的工具（顺序 = 注册顺序，确定性） */
  exposed: SkillProtocol[]
  /** 是否因超出本档位上限而被截断（面板可据此提示「工具面已限量」） */
  truncated: boolean
  /** 分组目录文本（组标题 + 每工具一行摘要），供提示词 `## 可用工具` 注入 */
  catalog: string
}

/**
 * 组装工具面。
 *
 * @param skills      注册表当前全部技能（顺序即注册顺序，`SkillDispatcher.list()`）
 * @param tier        生效档位（`resolveLlmTier` 的结果）
 * @param explicitIds 用户**显式选定**的工具 id（DD-4 兜底：非空时压过软路由，且不再受档位上限"静默"截断，
 *                    但为安全仍尊重上限并标记 `truncated`）
 */
export function buildToolFace(
  skills: readonly SkillProtocol[],
  tier: AgentRunTier,
  explicitIds?: readonly string[]
): ToolFace {
  const limit = faceLimitFor(tier)
  const explicit = (explicitIds ?? []).filter((id) => id.trim() !== '')
  const policy: ToolRoutingPolicy = explicit.length > 0 ? 'explicit' : resolveRoutingPolicy(tier)

  // 先按「显式选择」筛（保留注册顺序），否则用全量，再统一按上限裁剪
  const base = explicit.length > 0 ? skills.filter((skill) => explicit.includes(skill.id)) : [...skills]
  const exposed = base.slice(0, limit)
  const truncated = base.length > limit

  return {
    tier,
    policy,
    limit,
    total: skills.length,
    exposed,
    truncated,
    catalog: groupToolCatalog(exposed, tier, policy)
  }
}

/**
 * 把工具折成**按场景分组的目录文本**。
 *
 * 形态：
 * ```
 * ### 数据编辑
 * - system.game_data: 查询/增删改游戏数据表中的条目
 * ### 策划书创作
 * - system.ceshu: 读取与编辑策划书章节
 * ```
 * 每行**不含参数明细**（参数由 function-calling schema 下发，见 `protocol.ts::getToolCatalogLine`）。
 * 空分组不输出；全部为空时返回 `''`（调用方据此不注入该段）。
 */
export function groupToolCatalog(
  skills: readonly SkillProtocol[],
  tier: AgentRunTier,
  policy: ToolRoutingPolicy
): string {
  const header = catalogPreamble(tier, policy, skills.length)
  const blocks: string[] = []
  for (const group of TOOL_GROUP_ORDER) {
    const lines = skills
      .filter((skill) => resolveToolGroup(skill.id) === group)
      .map((skill) => getToolCatalogLine(skill))
    if (lines.length === 0) continue
    blocks.push([`### ${TOOL_GROUP_LABELS[group]}`, ...lines].join('\n'))
  }
  if (blocks.length === 0) return ''
  return [header, ...blocks].join('\n')
}

/** 目录抬头：按档位给出「工具面口径」（本地=显式选 / 云端=可软路由），让模型知道自己的选择自由度 */
function catalogPreamble(tier: AgentRunTier, policy: ToolRoutingPolicy, count: number): string {
  const scope = tier === 'cloud' ? '云端档' : '本地档'
  const mode =
    policy === 'soft'
      ? '你可在这份清单里自动挑选最合适的工具'
      : '请只使用这份清单里的工具'
  return `（${scope}工具面，共 ${count} 个；${mode}）`
}
