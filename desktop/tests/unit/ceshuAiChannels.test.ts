import { describe, expect, it } from 'vitest'

import { registerCeshuIpc } from '../../src/main/ipc/ceshuIpc'
import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../../src/main/ipc'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'
import {
  DATA_GEN_ERROR_EMPTY,
  DATA_GEN_ERROR_NO_TYPE,
  DATA_GEN_ERROR_UNPARSABLE
} from '../../src/shared/ceshu/ceshuDataGen'

/**
 * 策划书四路 AI 通道的**特征测试**（characterization test，W1 重构护栏）。
 *
 * ## 为什么先有它、再重构
 * `ceshu:aiGenerateChapter` / `aiGenerateField` / `aiGenerateData` / `aiReview` 承载了
 * 三处来之不易的约定 —— DD-17 预算确认门、DD-19 确定性质量门 + judge 降级、取消信号
 * 必须穿透（见 `agent/qualityJudge.ts` 的「取消 ≠ 失败」）。而重构前这四路的**编排行为
 * 零测试覆盖**（`agentProtocol.test.ts` 只测了 `llmConfirmReason` 纯函数）。
 *
 * 直接搬运 190 行带这些约定的代码，靠人眼比对是不可靠的。本文件先把**当前行为**钉成
 * 断言，W1 把编排搬进 `main/ai/` 之后这些断言必须**一字不改地继续通过** —— 任何一条
 * 变红都说明重构悄悄改了对外行为，应当回滚而不是改测试。
 *
 * ## 边界说明
 * - 只测 handler 层编排（是否调 LLM、调几次、返回什么、错误怎么走），不测提示词文案
 *   （那是 `shared/ceshuAi` 的职责，另有测试）。
 * - `runLlmJudge` 用模块级 `new LlmClient()`，不可注入；此处让 `llmCallOptions` 返回
 *   无 `config` 的对象，`runLlmJudge` 便按降级铁律直接返回 `null`（**不触网**），
 *   于是 `quality` 只剩确定性门的结论 —— 这正是「judge 失败不阻断正文」的实测形态。
 */

interface GenerateCall {
  system: string
  prompt: string
  options: Record<string, unknown>
}

const USAGE = { promptTokens: 11, completionTokens: 22, totalTokens: 33 }

interface HarnessOptions {
  doc?: ReturnType<typeof createDefaultCeshu>
  /** LLM 回复正文；给函数则可按调用次数定制 */
  reply?: string | ((call: GenerateCall, index: number) => string)
  isCloud?: boolean
  /** 让 generate 直接抛错（用于取消 / 失败路径） */
  generateError?: unknown
  types?: unknown[]
}

function createHarness(options: HarnessOptions = {}) {
  const doc = options.doc ?? createDefaultCeshu({ scope: 'full', name: '测试项目' })
  const calls: GenerateCall[] = []
  const handlers = new Map<string, (req: unknown, event: unknown) => unknown>()

  const handle = ((channel: string, _schema: unknown, handler: unknown) => {
    handlers.set(channel, handler as (req: unknown, event: unknown) => unknown)
  }) as unknown as IpcRegistrar

  const llmClient = {
    generate: async (system: string, prompt: string, callOptions: Record<string, unknown> = {}) => {
      const call: GenerateCall = { system, prompt, options: callOptions }
      const index = calls.length
      calls.push(call)
      if (options.generateError !== undefined) throw options.generateError
      const content =
        typeof options.reply === 'function' ? options.reply(call, index) : (options.reply ?? '{}')
      return { model: 'stub-model', content, usage: { ...USAGE } }
    }
  }

  const deps = {
    ceshuManager: { get: () => doc },
    typeSchemaStore: { getTypes: () => options.types ?? [] },
    dataService: { listAllItems: async () => [] },
    dataSync: { setCurrentCeshu: () => {}, syncSystemsToData: () => ({}), syncBoth: () => ({}) },
    llmClient
  } as unknown as IpcHandlerDeps

  const llm: LlmShared = {
    setConfigMirror: () => {},
    // 无 `config` ⇒ runLlmJudge 立刻降级为 null，测试不触网
    llmCallOptions: async () => ({}),
    isCloudCall: () => options.isCloud ?? false
  }

  registerCeshuIpc(deps, handle, llm)

  const invoke = async (channel: string, req: unknown): Promise<unknown> => {
    const handler = handlers.get(channel)
    if (handler === undefined) throw new Error(`未注册通道：${channel}`)
    return handler(req, { sender: { id: 7 } })
  }

  return { invoke, calls, doc, handlers }
}

/** 把某章所有字段填成非空，用于构造「无空字段」场景 */
function fillChapter(doc: ReturnType<typeof createDefaultCeshu>, chapter: 'meta'): void {
  const target = doc[chapter] as unknown as Record<string, unknown>
  for (const key of Object.keys(target)) target[key] = '已填写'
}

describe('ceshu:aiGenerateChapter（整章 / 一键生成）', () => {
  it('onlyEmpty 且无空字段时短路：不调用 LLM，返回空结果', async () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    fillChapter(doc, 'meta')
    const harness = createHarness({ doc })

    const result = await harness.invoke('ceshu:aiGenerateChapter', {
      id: 'x',
      chapter: 'meta',
      onlyEmpty: true
    })

    expect(harness.calls).toHaveLength(0)
    expect(result).toEqual({ model: '', fields: {}, rawText: '' })
  })

  it('云端整篇未确认：抛确认原因且不调用 LLM（DD-17）', async () => {
    const harness = createHarness({ isCloud: true })

    await expect(
      harness.invoke('ceshu:aiGenerateChapter', {
        id: 'x',
        chapter: 'meta',
        fullGenerate: { draft: {} }
      })
    ).rejects.toThrow('整篇 / 一键生成会连续多次调用云端模型')
    expect(harness.calls).toHaveLength(0)
  })

  it('已确认后正常生成：透传 model / fields / rawText / usage', async () => {
    const reply = JSON.stringify({ game_name: '星海' })
    const harness = createHarness({ isCloud: true, reply })

    const result = (await harness.invoke('ceshu:aiGenerateChapter', {
      id: 'x',
      chapter: 'meta',
      confirmed: true,
      fullGenerate: { draft: {} }
    })) as Record<string, unknown>

    expect(harness.calls).toHaveLength(1)
    expect(result['model']).toBe('stub-model')
    expect(result['rawText']).toBe(reply)
    expect(result['fields']).toEqual({ game_name: '星海' })
    expect(result['usage']).toEqual(USAGE)
    // 确定性质量门始终有结论（judge 降级为 null 也不影响）
    expect(result['quality']).toBeDefined()
  })

  it('取消（AbortError）向上抛，不被吞成「成功」', async () => {
    const abort = new DOMException('已停止', 'AbortError')
    const harness = createHarness({ generateError: abort })

    await expect(
      harness.invoke('ceshu:aiGenerateChapter', { id: 'x', chapter: 'meta' })
    ).rejects.toBe(abort)
  })

  it('章节名非法时直接抛错，不调用 LLM', async () => {
    const harness = createHarness()

    await expect(
      harness.invoke('ceshu:aiGenerateChapter', { id: 'x', chapter: '不存在的章节' })
    ).rejects.toThrow('未知章节')
    expect(harness.calls).toHaveLength(0)
  })
})

describe('ceshu:aiGenerateField（单字段定向生成）', () => {
  it('空字符串归一为 {}，不把空值回填进表单', async () => {
    const harness = createHarness({ reply: JSON.stringify({ game_name: '' }) })

    const result = (await harness.invoke('ceshu:aiGenerateField', {
      id: 'x',
      chapter: 'meta',
      field: 'game_name'
    })) as Record<string, unknown>

    expect(result['fields']).toEqual({})
    expect(result['model']).toBe('stub-model')
    expect(result['usage']).toEqual(USAGE)
  })

  it('非空值原样回填，且只回填目标字段', async () => {
    const harness = createHarness({
      reply: JSON.stringify({ game_name: '星海', game_type: '不应出现' })
    })

    const result = (await harness.invoke('ceshu:aiGenerateField', {
      id: 'x',
      chapter: 'meta',
      field: 'game_name'
    })) as Record<string, unknown>

    expect(result['fields']).toEqual({ game_name: '星海' })
  })

  it('字段不属于该章时抛错，不调用 LLM', async () => {
    const harness = createHarness()

    await expect(
      harness.invoke('ceshu:aiGenerateField', {
        id: 'x',
        chapter: 'meta',
        field: '绝对不存在的字段'
      })
    ).rejects.toThrow('不在')
    expect(harness.calls).toHaveLength(0)
  })
})

describe('ceshu:aiGenerateData（批量数据生成）', () => {
  it('未指定任何数据类型时抛错', async () => {
    const harness = createHarness()

    await expect(
      harness.invoke('ceshu:aiGenerateData', {
        id: 'x',
        dataTypes: [],
        count: 5,
        instruction: ''
      })
    ).rejects.toThrow(DATA_GEN_ERROR_NO_TYPE)
    expect(harness.calls).toHaveLength(0)
  })

  it('回复不可解析为 JSON 对象时抛错', async () => {
    const harness = createHarness({ reply: '这不是 JSON' })

    await expect(
      harness.invoke('ceshu:aiGenerateData', {
        id: 'x',
        dataTypes: ['item'],
        count: 5,
        instruction: ''
      })
    ).rejects.toThrow(DATA_GEN_ERROR_UNPARSABLE)
  })

  it('解析成功但候选为空时抛错', async () => {
    const harness = createHarness({ reply: JSON.stringify({ item: [] }) })

    await expect(
      harness.invoke('ceshu:aiGenerateData', {
        id: 'x',
        dataTypes: ['item'],
        count: 5,
        instruction: ''
      })
    ).rejects.toThrow(DATA_GEN_ERROR_EMPTY)
  })

  it('正常生成：候选剥掉 id、计数正确、带 quality 与 usage', async () => {
    const harness = createHarness({
      reply: JSON.stringify({ item: [{ id: 'llm-1', name: '长剑', rarity: 3 }] })
    })

    const result = (await harness.invoke('ceshu:aiGenerateData', {
      id: 'x',
      dataTypes: ['item'],
      count: 5,
      instruction: ''
    })) as Record<string, unknown>

    expect(result['candidates']).toEqual({ item: [{ name: '长剑', rarity: 3 }] })
    expect(result['total']).toBe(1)
    expect(result['model']).toBe('stub-model')
    expect(result['usage']).toEqual(USAGE)
    expect(result['quality']).toBeDefined()
    expect(typeof result['summary']).toBe('string')
  })

  it('批量条数超阈值且未确认时抛确认原因，不调用 LLM（DD-17）', async () => {
    const harness = createHarness({ isCloud: true })

    await expect(
      harness.invoke('ceshu:aiGenerateData', {
        id: 'x',
        dataTypes: ['item'],
        count: 12,
        instruction: ''
      })
    ).rejects.toThrow('批量生成 12 条')
    expect(harness.calls).toHaveLength(0)
  })
})

describe('ceshu:aiReview（成稿反审）', () => {
  it('解析反审清单并回填 progressTotal / validationCount / usage / 品类', async () => {
    const reply = JSON.stringify({
      findings: [{ key: 'numeric', level: 'blocker', evidence: '总血量算不通' }],
      overall: '有 1 项阻塞',
      suggestions: ['补齐波次数值']
    })
    const harness = createHarness({ reply })

    const result = (await harness.invoke('ceshu:aiReview', { id: 'x' })) as Record<string, unknown>

    expect(result['model']).toBe('stub-model')
    expect(result['rawText']).toBe(reply)
    expect(result['usage']).toEqual(USAGE)
    expect(result['overall']).toBe('有 1 项阻塞')
    expect(typeof result['progressTotal']).toBe('number')
    expect(typeof result['validationCount']).toBe('number')
    // finalizeReview 回填了品类与规则集标识（解析层拿不到文档）
    expect(typeof result['genreLabel']).toBe('string')
    expect(typeof result['rulesetId']).toBe('string')

    const findings = result['findings'] as Array<{ key: string; level: string }>
    expect(findings.find((item) => item.key === 'numeric')?.level).toBe('blocker')
  })

  it('LLM 调用失败时向上抛，不吞成空审阅结果', async () => {
    const failure = new Error('网络不通')
    const harness = createHarness({ generateError: failure })

    await expect(harness.invoke('ceshu:aiReview', { id: 'x' })).rejects.toBe(failure)
  })
})
