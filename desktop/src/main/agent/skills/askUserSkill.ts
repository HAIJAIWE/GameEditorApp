/**
 * `tool.ask_user` 内置技能（A1-5 补，对应 Python `core/agent/skills/ask_user_skill.py`）：
 * 参数/选项/方案不确定时向用户提问，避免 LLM 瞎猜。
 *
 * 与 Python 的区别：Python 走 `threading.Event` + 回调注册表的**阻塞式**弹窗
 * （`REQUIRES_MAIN_THREAD = True`）；TS 侧不阻塞线程——技能只声明
 * `interaction: { kind: 'question' }`，由 Brain 循环暂停并等渲染层回传答复，
 * 答复再作为工具结果回灌给 LLM。
 */

import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/protocol'

const ACTIONS = ['ask'] as const

export function createAskUserSkill(): SkillProtocol {
  function ask(params: Record<string, unknown>, _ctx: SkillExecutionContext): SkillResult {
    const question = typeof params.question === 'string' ? params.question.trim() : ''
    if (question === '') {
      return { success: false, error: '缺少 question 参数', message: '' }
    }
    const rawOptions = params.options
    const options = Array.isArray(rawOptions)
      ? rawOptions.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : []

    return {
      success: true,
      message: '',
      data: null,
      interaction: {
        kind: 'question',
        prompt: question,
        ...(options.length > 0 ? { options } : {})
      }
    }
  }

  function run(params: Record<string, unknown>, ctx: SkillExecutionContext): SkillResult {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'ask') {
      return { success: false, error: `未知动作: ${action}`, message: '' }
    }
    return ask(params, ctx)
  }

  return {
    id: 'tool.ask_user',
    description: '向用户提问: 当不确定参数/选项/方案时，询问用户（可给候选选项）。',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: '操作类型: ask=提问' },
        question: { type: 'string', description: '要问用户的问题' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '候选选项（留空表示自由文本回答）'
        }
      },
      required: ['action', 'question']
    },
    execute: run
  }
}
