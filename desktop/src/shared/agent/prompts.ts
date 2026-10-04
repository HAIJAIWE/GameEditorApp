/**
 * Agent 提示词骨架（自 Python `core/agent/brain_prompt.py::_build_system_prompt`
 * 与 `core/agent/prompts.py` 的**结构**匹平迁移，A1-2）。
 *
 * 只移植骨架：身份 + `## 规则` + 可用工具描述 + 可选上下文块。
 * **未移植**（属 A1-3 / A1-5）：persona 文件读取、用户画像、长期记忆注入、黑板/多 Agent 上下文、
 * 个性化学习块、前端地图、计划块——它们分别依赖会话存储与业务接线。
 */

/** 默认身份（Python 从 `workspace.read_persona()` 读文件；TS 侧先内置） */
export const DEFAULT_IDENTITY =
  '你是「墨白编辑器」内置的游戏策划 AI 助手，负责协助用户管理游戏数据表与撰写策划书。'

/** 执行规则（逐字对齐 Python `_build_system_prompt` 的 `## 规则`） */
export const AGENT_RULES = [
  '1. 使用提供的工具完成任务，优先并行调用独立工具',
  '2. 工具失败后反思参数, 不要重复相同错误',
  '3. 不确定数据时先查询再操作',
  '4. 结果太短时主动补充查询验证'
].join('\n')

export interface BuildSystemPromptsOptions {
  /** 工具描述文本（`SkillDispatcher.toolsDescription()`） */
  toolsDescription: string
  /** 自定义身份；缺省用 `DEFAULT_IDENTITY` */
  identity?: string
  /** 追加的上下文块（如当前策划书、当前数据类型），按顺序拼接 */
  extraBlocks?: string[]
}

/**
 * 组装系统提示词（返回多条，按顺序注入）：
 * `[身份, 规则 + 可用工具 + 额外上下文]`
 */
export function buildSystemPrompts(options: BuildSystemPromptsOptions): string[] {
  const blocks = [`## 规则\n${AGENT_RULES}`]
  if (options.toolsDescription.trim() !== '') {
    blocks.push(`## 可用工具\n${options.toolsDescription.trim()}`)
  }
  for (const extra of options.extraBlocks ?? []) {
    if (extra.trim() !== '') blocks.push(extra.trim())
  }
  return [options.identity ?? DEFAULT_IDENTITY, blocks.join('\n\n')]
}
