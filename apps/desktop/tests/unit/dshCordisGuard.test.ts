/**
 * dsh 插件**进程内**运行验证（cordis 宿主）。
 *
 * 背景：dsh 的插件是 cordis 插件，官方接入（CLI/ACP/SDK）全都另起进程。
 * 本用例证明：只要给它一个真 `Context`，插件代码可以在**我们自己的进程**里跑，
 * 并在我们的 `ToolExecutionPipeline` 上生效。
 *
 * 断言的是 dsh `repeat-tool-reminder` 的原文提醒（英文，插件内硬编码），
 * 用来区分"我们的 `repeatCall`"和"dsh 的实现"。
 */

import { describe, expect, it } from 'vitest'

import type { SkillProtocol } from '@mobai/shared/agent/config'
import { SkillDispatcher } from '@mobai/agent-core/execution/dispatcher'

/** 一个纯回显技能（无副作用，便于连续调用） */
function echoSkill(): SkillProtocol {
  return {
    id: 'demo.echo',
    description: 'echo back',
    version: '0.1.0',
    parametersSchema: { type: 'object', properties: { text: { type: 'string' } } },
    execute: (params) => ({ success: true, message: `echo:${String(params.text ?? '')}` })
  }
}

describe('dsh 插件进程内运行（cordis 宿主）', () => {
  it('第 3 次相同调用收到 dsh repeat-tool-reminder 的提醒', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(echoSkill())
    // 独立 sessionId：链键按会话隔离，避免与其它用例串
    const ctx = { sessionId: 'dsh-guard-test-basic' }

    const first = await dispatcher.execute('demo.echo', { text: 'x' }, ctx)
    const second = await dispatcher.execute('demo.echo', { text: 'x' }, ctx)
    const third = await dispatcher.execute('demo.echo', { text: 'x' }, ctx)

    expect(first.message).toBe('echo:x')
    expect(second.message).toBe('echo:x')
    // dsh 的 GENTLE_REMINDER 原文
    expect(third.message).toContain('repeating the exact same tool call')
    expect(third.success).toBe(true)
  })

  it('参数变化会重置链（检测的是连续重复，不是累计重复）', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(echoSkill())
    const ctx = { sessionId: 'dsh-guard-test-reset' }

    await dispatcher.execute('demo.echo', { text: 'a' }, ctx)
    await dispatcher.execute('demo.echo', { text: 'a' }, ctx)
    await dispatcher.execute('demo.echo', { text: 'a' }, ctx)
    const changed = await dispatcher.execute('demo.echo', { text: 'b' }, ctx)

    expect(changed.message).toBe('echo:b')
  })
})
