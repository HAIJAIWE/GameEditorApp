/**
 * `tool.ask_user` 内置技能（对应 旧版 `core/agent/skills/ask_user_skill`）：
 * 参数/选项/方案不确定时向用户提问，避免 LLM 瞎猜。
 *
 * 与 旧版 的区别：旧版 走 `threading.Event` + 回调注册表的**阻塞式**弹窗
 * （`REQUIRES_MAIN_THREAD = True`）；TS 侧不阻塞线程——技能只声明 `interaction`，
 * 由 Brain 循环暂停并等渲染层回传答复，答复再作为工具结果回灌给 LLM。
 *
 * 两种用法：
 *  - 单问题：`question` + `options?: string[]`
 *  - 多问题（对齐 旧版）：`questions: [{ question|prompt, options?, multiSelect? }]`
 */

import type {
  SkillExecutionContext,
  SkillInteractionOption,
  SkillInteractionQuestion,
  SkillProtocol,
  SkillResult
} from '../../../shared/agent/protocol'

const ACTIONS = ['ask'] as const

/** 归一化候选项：接受字符串或 `{label, description}`（旧版 侧两种调用点都存在） */
export function normalizeOptions(raw: unknown): SkillInteractionOption[] {
  if (!Array.isArray(raw)) return []
  const options: SkillInteractionOption[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const label = item.trim()
      if (label !== '') options.push({ label })
      continue
    }
    if (item !== null && typeof item === 'object') {
      const record = item as Record<string, unknown>
      const label = typeof record.label === 'string' ? record.label.trim() : ''
      if (label === '') continue
      const description = typeof record.description === 'string' ? record.description.trim() : ''
      options.push({ label, ...(description !== '' ? { description } : {}) })
    }
  }
  return options
}

/** 归一化单个问题：`prompt` 与 旧版 的 `question` 键都接受 */
function normalizeQuestion(raw: unknown): SkillInteractionQuestion | null {
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const rawPrompt = typeof record.prompt === 'string' ? record.prompt : record.question
  const prompt = typeof rawPrompt === 'string' ? rawPrompt.trim() : ''
  if (prompt === '') return null

  const options = normalizeOptions(record.options)
  return {
    prompt,
    ...(options.length > 0 ? { options } : {}),
    ...(record.multiSelect === true ? { multiSelect: true } : {})
  }
}

/**
 * 注意：`JsonObjectSchema` 的类型约束很紧（属性值只允许 `{ type }`，不支持嵌套 properties/anyOf），
 * 故这里只声明 item 类型，两种可接受形态（字符串 / `{label, description}`）写在 description 里。
 * 该 schema 是给 LLM 的**提示**而非运行时校验，实际收窄由 `normalizeOptions` 完成。
 */
const OPTION_HINT =
  '候选选项：字符串，或 { label, description } 对象（两种都接受，详见 description）'

export function createAskUserSkill(): SkillProtocol {
  function ask(params: Record<string, unknown>): SkillResult {
    // 多问题形态（对齐 旧版 questions 数组）
    const rawQuestions = params.questions
    if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
      const questions = rawQuestions
        .map((item) => normalizeQuestion(item))
        .filter((item): item is SkillInteractionQuestion => item !== null)
      if (questions.length === 0) {
        return { success: false, error: 'questions 里没有有效问题（每项需有 question 或 prompt）', message: '' }
      }
      return {
        success: true,
        message: '',
        data: null,
        interaction: {
          kind: 'question',
          prompt: `请回答以下 ${questions.length} 个问题`,
          questions
        }
      }
    }

    // 单问题形态
    const question = typeof params.question === 'string' ? params.question.trim() : ''
    if (question === '') {
      return { success: false, error: '缺少 question 参数（或改用 questions 数组）', message: '' }
    }
    const options = normalizeOptions(params.options)
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

  function run(params: Record<string, unknown>, _ctx: SkillExecutionContext): SkillResult {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'ask') {
      return { success: false, error: `未知动作: ${action}`, message: '' }
    }
    return ask(params)
  }

  return {
    id: 'tool.ask_user',
    description: '向用户提问: 单问题用 question (+options)，多问题用 questions 数组（可带候选与多选）。',
    version: '1.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ACTIONS, description: '操作类型: ask=提问' },
        question: { type: 'string', description: '单个问题（未提供 questions 时使用）' },
        options: { type: 'array', description: `单问题候选选项。${OPTION_HINT}`, items: { type: 'string' } },
        questions: {
          type: 'array',
          description:
            '多问题列表；每项为 { question | prompt, options?: 候选选项数组, multiSelect?: 是否多选 }',
          items: { type: 'object' }
        }
      },
      required: ['action']
    },
    execute: run
  }
}
