import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/**
 * 子智能体工具（Slice 19）：**标记技能**。
 *
 * 它的 `execute` 正常不会被调用——Brain 循环按工具名（默认 `tool.spawn_subagent`）**拦截**，
 * 改为递归跑一轮新的子循环，把子任务结果回灌。
 *
 * 注册它只为两件事：
 * 1. 能被 `runner.resolve` 解析（否则循环会当成「未知工具」）；
 * 2. 出现在工具面 / JSON Schema 里，让模型知道「可以派子智能体」。
 */
export function createSubAgentSkill(): SkillProtocol {
  return {
    id: 'tool.spawn_subagent',
    description:
      '把一个可独立完成的子任务交给子智能体处理：它会独立跑一轮（有自己的上下文），返回结果摘要。适合拆解大任务、并行调研。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: '交给子智能体的子任务描述（要具体、可独立完成）' }
      },
      required: ['task']
    },
    tags: ['agent', 'delegate'],
    execute: (): SkillResult => ({
      success: false,
      message: '子智能体应由 Brain 循环接管；若直接执行到这里，说明宿主未启用子智能体拦截（subAgentTool）。'
    })
  }
}
