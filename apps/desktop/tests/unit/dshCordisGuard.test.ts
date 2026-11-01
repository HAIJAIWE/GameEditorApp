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
  it('第 3 次相同调用收到 dsh repeat-tool-reminder 的提醒（已本地化为中文）', async () => {
    const dispatcher = new SkillDispatcher({ dshGuard: true })
    dispatcher.register(echoSkill())
    // 独立 sessionId：链键按会话隔离，避免与其它用例串
    const ctx = { sessionId: 'dsh-guard-test-basic' }

    const first = await dispatcher.execute('demo.echo', { text: 'x' }, ctx)
    const second = await dispatcher.execute('demo.echo', { text: 'x' }, ctx)
    const third = await dispatcher.execute('demo.echo', { text: 'x' }, ctx)

    expect(first.message).toBe('echo:x')
    expect(second.message).toBe('echo:x')
    // dsh 原文是英文，策略层映射成我们的中文温和提醒
    expect(third.message).toContain('你正在用完全相同的参数重复调用同一个工具')
    expect(third.message).not.toContain('repeating the exact same tool call')
    expect(third.success).toBe(true)
  })

  it('第 5 次（后续阈值）给出中文详细提醒（点名工具 + 次数）', async () => {
    const dispatcher = new SkillDispatcher({ dshGuard: true })
    dispatcher.register(echoSkill())
    const ctx = { sessionId: 'dsh-guard-test-detailed' }

    for (let index = 0; index < 4; index += 1) {
      await dispatcher.execute('demo.echo', { text: 'y' }, ctx)
    }
    const fifth = await dispatcher.execute('demo.echo', { text: 'y' }, ctx)

    expect(fifth.message).toContain('检测到重复工具调用')
    expect(fifth.message).toContain('工具：demo.echo')
    expect(fifth.message).toContain('连续调用次数：5')
  })

  it('参数变化会重置链（检测的是连续重复，不是累计重复）', async () => {
    const dispatcher = new SkillDispatcher({ dshGuard: true })
    dispatcher.register(echoSkill())
    const ctx = { sessionId: 'dsh-guard-test-reset' }

    await dispatcher.execute('demo.echo', { text: 'a' }, ctx)
    await dispatcher.execute('demo.echo', { text: 'a' }, ctx)
    await dispatcher.execute('demo.echo', { text: 'a' }, ctx)
    const changed = await dispatcher.execute('demo.echo', { text: 'b' }, ctx)

    expect(changed.message).toBe('echo:b')
  })

  it('默认不启用 dsh 守卫（循环里已有 RepeatCallGuard，双开会重复提醒）', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(echoSkill())
    const ctx = { sessionId: 'dsh-guard-default-off' }

    await dispatcher.execute('demo.echo', { text: 'z' }, ctx)
    await dispatcher.execute('demo.echo', { text: 'z' }, ctx)
    const third = await dispatcher.execute('demo.echo', { text: 'z' }, ctx)

    expect(third.message).toBe('echo:z')
  })
})
