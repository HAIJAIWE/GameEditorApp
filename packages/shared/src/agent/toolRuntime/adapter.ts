/**
 * 适配层：把既有的 `SkillProtocol` 包装成 dsh 形状的 `ToolDefinition`。
 *
 * 为什么用适配而不是重写 20+ 个技能：技能的业务逻辑不该为了换契约重写一遍；
 * 适配层负责"补上契约要求的三件事"——canonical 输出 schema、展示投影、执行器元数据
 * （`timeoutMs` / `isConcurrencySafe`），技能本身继续返回 `SkillResult`。
 *
 * canonical 值就是 `SkillResult` 本身（它本来就是 JSON 值），所以回放/日志与直播同源。
 *
 * @module agent/tools/adapter
 */

import { normalizeSkillResult, type SkillExecutionContext, type SkillProtocol, type SkillResult } from '../config'
import type { ToolDefinition } from './contracts'
import type { JsonSchemaNode } from './jsonSchema'
import type { JsonValue } from './jsonValue'

/**
 * `SkillResult` 的 canonical 输出契约。
 *
 * 只硬性要求 `success` + `message`（其余可选）——这与 `normalizeSkillResult` 的
 * 兜底口径一致：缺 `message` 的技能本来就会被归一成空串，这里不额外制造失败。
 */
export const SKILL_RESULT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {},
    error: { type: 'string' },
    images: { type: 'array', items: { type: 'string' } },
    interaction: { type: 'object' }
  },
  required: ['success', 'message']
}

/** 从 canonical 值里取模型可见文本：优先 message，其次 error */
function textOf(value: JsonValue): string {
  const result = value as unknown as SkillResult
  const message = typeof result.message === 'string' ? result.message : ''
  if (message !== '') return message
  return typeof result.error === 'string' ? result.error : ''
}

/**
 * 把一个技能包装成工具。
 * @param skill - 既有技能协议
 * @returns dsh 形状的工具定义
 */
export function toToolDefinition(skill: SkillProtocol): ToolDefinition {
  const title = skill.description.split('\n')[0] ?? skill.id
  const concurrencySafe = skill.isConcurrencySafe
  return {
    name: skill.id,
    description: skill.description,
    parameters: skill.parametersSchema,
    output: {
      schema: SKILL_RESULT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: textOf(value) }]
    },
    // 先归一：技能可能只返回 `{message, interaction}` 或直接返回字符串/undefined，
    // `normalizeSkillResult` 兜底成合法 `SkillResult`，canonical 值因此必然满足 schema。
    execute: async (args, exec) =>
      normalizeSkillResult(
        await skill.execute(
          args as Record<string, unknown>,
          (exec.hostContext as SkillExecutionContext | undefined) ?? {}
        )
      ),
    ...(skill.timeoutMs !== undefined ? { timeoutMs: skill.timeoutMs } : {}),
    ...(concurrencySafe !== undefined
      ? { isConcurrencySafe: (args: unknown) => concurrencySafe(args as Record<string, unknown>) }
      : {}),
    presentCall: () => ({ title }),
    presentResult: (_args, result) => ({
      title,
      detail: result.content.map((block) => block.text).join('\n')
    })
  }
}
