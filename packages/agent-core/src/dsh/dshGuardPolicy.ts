/**
 * dsh 守卫策略：把 `repeat-tool-reminder` 的提醒接进我们的工具流水线。
 *
 * 语义对齐 dsh：**只提醒、不否决**（插件返回 `additionalContexts`，不是 block）。
 * 我们把它折进 `SkillResult.message`——循环本来就会把 message 回灌给模型，
 * 所以提醒会紧跟在工具结果后面出现，不需要改循环或新增字段。
 *
 * 加载是**惰性 + 失败降级**的：dsh 的包只在第一次工具调用时 `import()`，
 * 加载失败只告警一次、提醒功能关闭，绝不影响工具本身执行。
 *
 * @module agent-core/dsh/dshGuardPolicy
 */

import { GENTLE_REMINDER, detailedReminder } from '@mobai/shared/agent/guard'
import type { ToolExecutionResult, ToolPolicy } from '@mobai/shared/agent/toolRuntime'
import type { DshCordisHost } from './cordisHost'

/**
 * 把 dsh 插件的**英文原文**映射回我们的中文文案。
 *
 * dsh 的 `repeat-tool-reminder` 把两条提醒硬编码成英文（没有 i18n 钩子），而本产品是
 * 中文优先。这里按**已固定版本**的两条已知格式做映射；匹配不到就原样返回（不吞内容）。
 * 用例直接断言真实插件输出，插件一旦改文案，测试会先红。
 * @param text - 插件返回的单条提醒
 */
export function localizeReminder(text: string): string {
  // 温和提醒（首个阈值）
  if (text.includes('You are repeating the exact same tool call')) return GENTLE_REMINDER
  // 详细提醒（后续阈值）：点名工具 + 连续次数 + 参数
  if (!text.startsWith('Repeated tool call detected:')) return text
  const tool = /- tool: (.+)/.exec(text)?.[1]?.trim()
  const count = Number(/- consecutive_calls: (\d+)/.exec(text)?.[1] ?? '0')
  const args = /- arguments: (.+)/.exec(text)?.[1]?.trim()
  if (tool === undefined || count <= 0 || args === undefined) return text
  return detailedReminder(tool, count, args)
}

let hostPromise: Promise<DshCordisHost | null> | null = null
let warned = false
/**
 * 会话键 → 稳定对象。
 *
 * dsh 用 `WeakMap` 以 `exec.agent` 为键记"连续重复"的链，**键必须是对象**；
 * 同时它必须按会话稳定，否则链永远从 1 开始、阈值永远触发不了。
 */
const agents = new Map<string, object>()

function agentFor(sessionKey: string): object {
  let agent = agents.get(sessionKey)
  if (agent === undefined) {
    agent = { id: sessionKey }
    agents.set(sessionKey, agent)
  }
  return agent
}

/** 惰性加载宿主；失败返回 null（并只告警一次） */
function host(): Promise<DshCordisHost | null> {
  hostPromise ??= import('./cordisHost')
    .then((module) => module.createDshCordisHost())
    .catch((error: unknown) => {
      if (!warned) {
        warned = true
        console.warn('[dsh] cordis 宿主加载失败，重复调用提醒降级为关闭：', error)
      }
      return null
    })
  return hostPromise
}

/**
 * 生成守卫策略（挂在 `ToolExecutionPipeline` 最外层）。
 * @returns 环绕策略
 */
export function createDshGuardPolicy(): ToolPolicy {
  return async (exec, next): Promise<ToolExecutionResult> => {
    const result = await next()
    // 失败结果不追加提醒：模型该看的是错误本身
    if (result.isError) return result

    const instance = await host()
    if (instance === null) return result

    const sessionKey = (exec.hostContext as { sessionId?: string } | undefined)?.sessionId ?? 'default'
    const reminders = await instance.postExecute({
      name: exec.name,
      arguments: exec.arguments,
      agent: agentFor(sessionKey)
    })
    if (reminders.length === 0) return result

    const text = reminders.map(localizeReminder).join('\n\n')
    const value = result.value
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return result
    const record = value as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    return {
      ...result,
      value: { ...record, message: message === '' ? text : `${message}\n\n${text}` }
    } as ToolExecutionResult
  }
}
