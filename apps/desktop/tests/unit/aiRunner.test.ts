import { beforeEach, describe, expect, it } from 'vitest'

import { runAiTask } from '../../src/main/ai/runner'
import { TaskRegistry, taskRegistry } from '../../src/main/task/taskRegistry'
import { configureTaskTickets } from '@mobai/agent-core/ports'

/**
 * `runAiTask` 的编排契约（2026-11-10 新增）：
 *
 * 1. **单次调用的输出上限覆盖**：`spec.maxTokens` 必须透传到 `client.generate` 的第三参，
 *    落在 `callOpts` 之后（覆盖配置里的 1000）、`signal` 之前（取消信号仍由 harness 掌管）。
 *    没有这条，整章 / 整节的长篇生成会被推理型模型的思考过程吃光正文。
 * 2. **并发取消不串**：面板把一章拆成多个单元并发生成时，同一窗口会同时有 2-3 个在途请求；
 *    不带 `taskId` 时取消表的 `bySender` 只有一格，后登记的会覆盖前一笔 ⇒ 点「停止」停错人。
 * 3. **预算门只剩 bulk / count**：云端档 + 长提示词（预估 token 很大）不再要求确认。
 *
 * 只测「编排是否把参数交出去」，不测 LLM 协议与提示词文案（那归 `llmClient*` / `ceshu*`）。
 */

interface GenerateCall {
  system: string
  prompt: string
  options: Record<string, unknown>
}

interface HarnessOptions {
  /** 让 generate 挂住，用于构造「两个请求同时在途」 */
  gate?: Promise<void>
  reply?: string
  isCloud?: boolean
}

function createDeps(options: HarnessOptions = {}) {
  const calls: GenerateCall[] = []
  const client = {
    generate: async (system: string, prompt: string, callOptions: Record<string, unknown> = {}) => {
      calls.push({ system, prompt, options: callOptions })
      if (options.gate !== undefined) await options.gate
      return {
        model: 'stub-model',
        content: options.reply ?? '正文',
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 }
      }
    }
  }
  // 无 `config` ⇒「未配置」，但预算门只看 bulk / count，isCloud 由用例控制
  const llm = { llmCallOptions: async () => ({}), isCloudCall: () => options.isCloud ?? false }
  return { deps: { llm, client }, calls }
}

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('runAiTask：maxTokens 覆盖透传', () => {
  it('spec.maxTokens ⇒ client.generate 第三参带 maxTokens（长篇生成一次给足上限）', async () => {
    const { deps, calls } = createDeps()
    await runAiTask(deps as never, {
      system: 'sys',
      prompt: 'p',
      budget: { taskType: 'chapter' },
      maxTokens: 16000,
      interpret: async (content) => content
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.options['maxTokens']).toBe(16000)
  })

  it('不传 maxTokens ⇒ 第三参不带该键（回落用户配置里的值，旧行为不变）', async () => {
    const { deps, calls } = createDeps()
    await runAiTask(deps as never, {
      system: 'sys',
      prompt: 'p',
      budget: { taskType: 'chapter' },
      interpret: async (content) => content
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.options).not.toHaveProperty('maxTokens')
  })
})

describe('runAiTask：并发取消靠 taskId 精确命中', () => {
  beforeEach(() => {
    configureTaskTickets(taskRegistry())
  })

  it('两个并发单元各带 taskId：取消其中一个只中断它自己（旧实现会串）', async () => {
    const registry = taskRegistry()
    let releaseA: (() => void) | undefined
    let releaseB: (() => void) | undefined
    const gateA = new Promise<void>((resolve) => (releaseA = resolve))
    const gateB = new Promise<void>((resolve) => (releaseB = resolve))

    const harnessA = createDeps({ gate: gateA })
    const harnessB = createDeps({ gate: gateB })
    const first = runAiTask(harnessA.deps as never, {
      system: 'sys',
      prompt: 'p',
      budget: { taskType: 'chapter' },
      senderId: 7,
      taskId: 'unit_a',
      interpret: async (content) => content
    })
    const second = runAiTask(harnessB.deps as never, {
      system: 'sys',
      prompt: 'p',
      budget: { taskType: 'chapter' },
      senderId: 7,
      taskId: 'unit_b',
      interpret: async (content) => content
    })

    // `llmCallOptions()` 是异步的 ⇒ 先取配置再登记取消表；让两个调用都跑到 `begin` 之后。
    await flush()
    // 两笔各占一个 byId 槽（旧实现 `begin(senderId)` 丢掉 taskId、只在 bySender 留一格）
    expect(registry.size).toBe(2)
    const signalA = harnessA.calls[0]?.options['signal'] as AbortSignal | undefined
    const signalB = harnessB.calls[0]?.options['signal'] as AbortSignal | undefined

    // 取消单元 A：只中断 A 的信号，B 不受影响
    expect(registry.cancel(7, 'unit_a')).toBe(true)
    expect(signalA?.aborted).toBe(true)
    expect(signalB?.aborted).toBe(false)
    // 取消不删表项（注销在 finally 里）⇒ 两笔都还在，但 B 仍能被按 id 精确取消
    expect(registry.cancel(7, 'unit_b')).toBe(true)
    expect(signalB?.aborted).toBe(true)

    releaseA?.()
    releaseB?.()
    await Promise.all([first, second])
    // finally 已注销：不会留陈旧 controller
    expect(registry.size).toBe(0)
  })

  it('不带 taskId 时沿用兜底语义（窗口当前活跃的一笔），行为与旧版一致', async () => {
    const registry = new TaskRegistry()
    configureTaskTickets(registry)
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => (release = resolve))

    const run = runAiTask(createDeps({ gate }).deps as never, {
      system: 'sys',
      prompt: 'p',
      budget: { taskType: 'chapter' },
      senderId: 11,
      interpret: async (content) => content
    })

    await flush()
    expect(registry.size).toBe(1)
    expect(registry.cancel(11)).toBe(true)
    release?.()
    await run
    expect(registry.size).toBe(0)
  })
})

describe('runAiTask：预算门只剩 bulk / count（2026-11-10 删除云端预算分支）', () => {
  it('云端 + 长提示词（预估 token 很大）⇒ 直接开跑，不再抛确认原因', async () => {
    const { deps, calls } = createDeps({ isCloud: true })
    const longPrompt = '长文档素材'.repeat(500)
    await expect(
      runAiTask(deps as never, {
        system: 'sys',
        prompt: longPrompt,
        budget: { taskType: 'chapter' },
        interpret: async (content) => content
      })
    ).resolves.toBeDefined()
    expect(calls).toHaveLength(1)
  })

  it('bulk 且未确认 ⇒ 仍抛「整篇 / 一键生成」原因，且不调用模型（该门必须保留）', async () => {
    const { deps, calls } = createDeps({ isCloud: true })
    await expect(
      runAiTask(deps as never, {
        system: 'sys',
        prompt: 'p',
        budget: { taskType: 'full', bulk: true },
        interpret: async (content) => content
      })
    ).rejects.toThrow('整篇 / 一键生成会连续多次调用云端模型')
    expect(calls).toHaveLength(0)
  })
})