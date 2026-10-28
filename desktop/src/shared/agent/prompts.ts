/**
 * Agent 提示词骨架（自 旧版 `core/agent/brain_prompt::_build_system_prompt`
 * 与 `core/agent/prompts` 的**结构**匹平迁移，A1-2）。
 *
 * 只移植骨架：身份 + `## 规则` + **能力目录（渐进披露，M2/G7）** + 可选上下文块。
 *
 * M2 起 `## 可用工具` 只放**每个工具一行的摘要**（`SkillDispatcher.toolCatalog()`），
 * 不再注入逐参数的全量描述——参数由 function-calling 的 `tools` JSON Schema 随请求下发，
 * 文本里重复既冗余又会触发本地 4B 的「提示词冗长税」（设计文档 §4.1 实测 1）。
 * 同时新增**提示词预算门** `PROMPT_CORE_MAX_LINES`（DD-6，两档同源）。
 *
 * **未移植**（属 A1-3 / A1-5）：persona/identity **文件**读取（TS 侧身份仍内置 `DEFAULT_IDENTITY`）、
 * 用户画像、长期记忆注入、黑板/多 Agent 上下文、个性化学习块、前端地图、计划块——
 * 前者依赖工作区接线，后者分别依赖会话存储与业务接线。
 */

/** 默认身份 */
export const DEFAULT_IDENTITY =
  '你是「墨白编辑器」内置的游戏策划 AI 助手，负责协助用户管理游戏数据表与撰写策划书。'

/**
 * 提示词**核心区**（身份 + 规则，不含工具目录/记忆）行数上限（DD-6）。
 *
 * ⚠️ 两档**共用同一闸**，理由不同：本地档是**硬闸**（4B 读不完长提示词：>30 行 ⇒ 完全不用工具，
 * 见设计文档 §4.1 实测 1）；云端档是**优化项**（新模型有判断力、旧规则是过时的 casts）。
 */
export const PROMPT_CORE_MAX_LINES = 30

/** 执行规则 */
export const AGENT_RULES = [
  '1. 使用提供的工具完成任务，优先并行调用独立工具',
  '2. 工具失败后反思参数, 不要重复相同错误',
  '3. 不确定数据时先查询再操作',
  '4. 结果太短时主动补充查询验证'
].join('\n')

/** 提示词预算检查结果（不抛异常，供断言与观测） */
export interface PromptBudgetResult {
  ok: boolean
  /** 非空行数 */
  lines: number
  maxLines: number
}

/**
 * 统计提示词的非空行数（DD-6 计量口径：忽略空行，逐块拼接后统一计数）。
 */
export function countPromptLines(prompts: string[]): number {
  return prompts
    .join('\n')
    .split('\n')
    .filter((line) => line.trim() !== '').length
}

/**
 * 提示词预算检查（DD-6）：超过 `maxLines` 时 `ok=false`。
 * **返回结果而非抛异常**——调用方可据此发事件/降级，测试可据此断言。
 */
export function checkPromptBudget(
  prompts: string[],
  maxLines: number = PROMPT_CORE_MAX_LINES
): PromptBudgetResult {
  const lines = countPromptLines(prompts)
  return { ok: lines <= maxLines, lines, maxLines }
}

export interface BuildSystemPromptsOptions {
  /**
   * 能力目录文本（`SkillDispatcher.toolCatalog()`）——**渐进披露的紧凑一行摘要**，
   * 不含参数明细（参数由 function-calling 的 `tools` schema 下发，见 DD-6 / §4.1）。
   */
  capabilityCatalog: string
  /** 自定义身份；缺省用 `DEFAULT_IDENTITY` */
  identity?: string
  /** 追加的上下文块（如当前策划书、当前数据类型），按顺序拼接 */
  extraBlocks?: string[]
}

/**
 * 组装系统提示词（返回多条，按顺序注入）：
 * `[身份, 规则 + 能力目录 + 额外上下文]`
 */
export function buildSystemPrompts(options: BuildSystemPromptsOptions): string[] {
  const blocks = [`## 规则\n${AGENT_RULES}`]
  if (options.capabilityCatalog.trim() !== '') {
    blocks.push(`## 可用工具\n${options.capabilityCatalog.trim()}`)
  }
  for (const extra of options.extraBlocks ?? []) {
    if (extra.trim() !== '') blocks.push(extra.trim())
  }
  return [options.identity ?? DEFAULT_IDENTITY, blocks.join('\n\n')]
}
