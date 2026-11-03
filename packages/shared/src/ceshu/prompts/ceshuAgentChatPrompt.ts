/**
 * 右栏「智能体」对话提示词**文本常量**（零 import，纯字符串）。
 *
 * 为什么单独放在这里而不是和上下文拼装逻辑一起：
 * `prompts/index.ts` 会被 `workflow → reference → fields` 这条链间接加载，
 * 若本模块 import `fields`/`model`，就会形成
 * `fields → reference → workflow → prompts → fields` 的循环，
 * 使 `fields` 尚未初始化时被读取（`fieldLabelOf` 变成 undefined）。
 * 因此这里只放**无依赖的字符串**，上下文拼装逻辑留在渲染层，
 * 由渲染层 import `fields`/`model`（它本来就依赖这些）。
 */

/** 上下文长度上限（字符）：超出后截断，避免把整份长文档塞进小模型 */
export const CESHU_AGENT_CONTEXT_LIMIT = 6000

/** 问答模式的系统提示词 */
export const CESHU_AGENT_SYSTEM_PROMPT =
  '你是资深游戏策划助手。基于用户提供的整份策划书上下文回答问题和给建议；不要编造上下文里没有的设定，不确定就直说。回答简洁、分点、可落地。'

/** 改文档模式的系统提示词：只输出 JSON 补丁 */
export const CESHU_AGENT_PATCH_SYSTEM_PROMPT =
  '你是游戏策划助手。用户要求修改策划书时，**只输出 JSON 补丁**，形如 {"章节key":{"字段key":值}}，只包含要改的字段；不要解释、不要代码块外文字。章节与字段 key 见上下文。'

/** 上下文首行前缀（`游戏：`） */
export const CESHU_AGENT_GAME_PREFIX = '游戏：'

/** 游戏名缺失时的占位 */
export const CESHU_AGENT_UNTITLED = '未命名'

/** 上下文超长时的截断后缀 */
export const CESHU_AGENT_TRUNCATED_SUFFIX = '…（已截断）'

/** 拼装用户提示词：上下文 + 问题 */
export function buildCeshuAgentPrompt(context: string, question: string): string {
  return `【策划书上下文】\n${context}\n\n【用户】\n${question}`
}
