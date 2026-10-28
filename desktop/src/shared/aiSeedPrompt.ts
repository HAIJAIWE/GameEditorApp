/**
 * 策划书首页「AI 入口卡」引导前缀组装。
 *
 * 对应 旧版 `ui/ceshu/home_view::_on_ai_send` 中的 `guided_text`：
 * 用户输入被包成三段式文本后投递给右侧 AI 面板——
 *   1. `[策划书生成] {用户输入}`（用户输入先 trim）
 *   2. 一个空行
 *   3. 括号引导段（要求 AI 先多轮提问，收集足够信息后再调用 `system.ceshu` 的 `ai_generate`）
 * 输入为空白时返回 `null`，调用方据此忽略本次发送。
 *
 * 为什么独立成 shared 模块：纯逻辑、零 React / 零 Electron 依赖，可在 Node 环境直接单测，
 * 同时供渲染层组件复用（渲染组件只负责交互，不硬编码文案细节）。
 */

/** 引导前缀首行前缀 */
export const AI_SEED_PREFIX = '[策划书生成] '

/** 括号引导段原文 */
export const AI_SEED_GUIDE =
  '（请以资深游戏主策划身份和我多轮对话：先问 3-5 个关键问题，' +
  '包括核心玩法、世界观、主要游戏系统、规模、付费模式等，' +
  '等我回答充分后再调用 system.ceshu 的 ai_generate 生成完整策划书。' +
  '不要一句话就直接生成。）'

/**
 * 组装投递给 AI 面板的引导前缀；输入为空白时返回 null（调用方据此忽略）。
 *
 * @param raw 用户在首页 AI 入口卡输入框中的原始文本（可能含首尾空白）
 * @returns 三段式引导文本；`raw.trim() === ''` 时为 `null`
 */
export function buildAiSeedPrompt(raw: string): string | null {
  const text = raw.trim()
  if (text === '') return null
  return `${AI_SEED_PREFIX}${text}\n\n${AI_SEED_GUIDE}`
}
