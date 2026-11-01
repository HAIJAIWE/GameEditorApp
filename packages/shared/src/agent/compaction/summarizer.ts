/**
 * LLM 上下文压缩摘要器（对齐 dsh `compaction-basic/summarizer`）。
 *
 * 取向：把「被压缩的旧消息」交给模型，生成一份**结构化 checkpoint**，
 * 让另一个模型/下一轮能无损失地接着干活。与 dsh 的差异：
 * - dsh 复用原会话 system prompt + 工具做前缀以命中 KV cache；我们是纯消息模型，
 *   直接把「被压缩区 + 摘要指令」发过去（成本可控，实现简单）；
 * - 指令用中文，章节面向「游戏策划/数据/代码编辑」场景。
 *
 * 失败语义：摘要为空或传输失败 → 抛错，由 `maybeResetContextAsync` 回落模板压缩。
 */

import type { BrainLlmTransport } from '../runtime'
import type { CompactSummarizer } from './compact'

/** 结构化 checkpoint 的章节（对齐 dsh 的 8 段结构） */
export const COMPACTION_INSTRUCTION = [
  '你现在是「上下文压缩引擎」。请把上面的对话压缩成一份结构化交接摘要，让另一个模型能在不损失关键信息的前提下继续这项工作。',
  '',
  '严格按下面的 Markdown 结构输出，保留每一节、按顺序；用简洁的要点（不要长段落）；某节为空就写「(无)」，不要省略任何一节。',
  '',
  '## 主要请求与意图',
  '- [用户最初及演进的目标；措辞重要处可原样引用]',
  '',
  '## 关键技术概念',
  '- [涉及的技术、框架、约定、设计模式]',
  '',
  '## 文件与代码',
  '- [精确路径：为什么重要、关键改动或片段]',
  '',
  '## 错误与修复',
  '- [错误：如何解决，以及相关用户反馈]',
  '',
  '## 待办事项',
  '- [用户明确要求但尚未完成的工作]',
  '',
  '## 当前进展',
  '- [此刻正在进行的具体工作]',
  '',
  '## 下一步',
  '- [与最近请求直接相关的下一个动作，或「(无)」]',
  '',
  '## 关键上下文',
  '- [决策及理由、约束、用户偏好、待解问题、继续所需的数据]',
  '',
  '规则：',
  '- 用简洁的中文工程语言；**精确保留**文件路径、命令、错误串、标识符、数值、函数签名与语法片段。',
  '- 忠实记录用户反馈与明确指令，尤其是纠正。',
  '- 不要提及「本次摘要请求」或「上下文被压缩」这件事。',
  '- 只输出摘要正文，不要调用任何工具、不要执行其他动作。'
].join('\n')

/**
 * 用注入的传输层创建一个压缩摘要器。
 * @param transport 与主循环同一个传输层（同模型/同档位）。
 * @returns 供 `RunBrainLoopOptions.compactSummarizer` 使用的摘要器。
 */
export function createCompactSummarizer(transport: BrainLlmTransport): CompactSummarizer {
  return async (input, signal) => {
    const reply = await transport.complete({
      messages: [...input.dropped, { role: 'user', content: COMPACTION_INSTRUCTION }],
      tools: [],
      signal
    })
    const text = reply.content.trim()
    if (text === '') throw new Error('压缩摘要为空')
    return text
  }
}
