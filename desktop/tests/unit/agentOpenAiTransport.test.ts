import { afterEach, describe, expect, it } from 'vitest'

import { resolveAgentTier, resolveAgentTransport } from '../../src/main/agent/agentTransport'
import { OllamaChatTransport } from '../../src/main/agent/ollamaTransport'
import { buildChatCompletionsUrl, OpenAiChatTransport } from '../../src/main/agent/openAiTransport'
import { DEFAULT_LLM_CONFIG, LLM_DEFAULT_NUM_CTX, type StoredLlmConfig } from '../../src/shared/llmConfig'

/**
 * M3 档位路由：云端传输层（OpenAI 兼容工具调用）+ 传输层解析。
 *
 * 为什么用「桩 fetch + 自造 JSON」：本层要验的是**协议契约**（`choices[0].message` 的
 * content / tool_calls / usage 如何映射为 `BrainLlmReply`）与**解析规则**（哪档选哪层），
 * 真往返由后续 e2e 覆盖（本沙箱无云端 Key，起真服务无意义）。
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload)
  } as unknown as Response
}

function stubFetch(response: Response): { calls: string[]; inits: Array<{ headers?: Record<string, string>; body?: unknown }> } {
  const calls: string[] = []
  const inits: Array<{ headers?: Record<string, string>; body?: unknown }> = []
  globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string>; body?: unknown }) => {
    calls.push(String(url))
    inits.push(init ?? {})
    return response
  }) as unknown as typeof fetch
  return { calls, inits }
}

const originalFetch = globalThis.fetch

function cloudConfig(overrides: Partial<StoredLlmConfig> = {}): StoredLlmConfig {
  return { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', model: 'deepseek-chat', ...overrides }
}

describe('OpenAiChatTransport：URL 拼接', () => {
  it('剥掉尾部斜杠后接 /chat/completions，且不重复追加 /v1', () => {
    expect(buildChatCompletionsUrl('https://api.deepseek.com/v1')).toBe(
      'https://api.deepseek.com/v1/chat/completions'
    )
    expect(buildChatCompletionsUrl('https://api.deepseek.com/v1/')).toBe(
      'https://api.deepseek.com/v1/chat/completions'
    )
    expect(buildChatCompletionsUrl('  https://x.example/v1///  ')).toBe(
      'https://x.example/v1/chat/completions'
    )
  })
})

describe('OpenAiChatTransport：请求与响应契约', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('解析 content + tool_calls（args 为 JSON 串）+ usage + finishReason，并一次性回调文本', async () => {
    const { calls, inits } = stubFetch(
      jsonResponse({
        choices: [
          {
            message: {
              content: '我先查一下数据',
              tool_calls: [
                { id: 'c1', function: { name: 'system.game_data', arguments: '{"action":"list"}' } }
              ]
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      })
    )

    const chunks: string[] = []
    const transport = new OpenAiChatTransport({
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-test'
    })
    const reply = await transport.complete({
      messages: [{ role: 'user', content: '有哪些数据表' }],
      tools: [{ name: 'system.game_data' }],
      onChunk: (text) => chunks.push(text)
    })

    expect(calls[0]).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(inits[0]?.headers?.['Authorization']).toBe('Bearer sk-test')
    const body = JSON.parse(String(inits[0]?.body)) as {
      model?: string
      stream?: boolean
      tools?: unknown[]
    }
    expect(body.model).toBe('deepseek-chat')
    expect(body.stream).toBe(false)
    expect(body.tools).toHaveLength(1)

    expect(reply.content).toBe('我先查一下数据')
    expect(reply.toolCalls).toEqual([
      { id: 'c1', name: 'system.game_data', arguments: { action: 'list' } }
    ])
    expect(reply.finishReason).toBe('tool_calls')
    expect(reply.model).toBe('deepseek-chat')
    expect(reply.usage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 })
    expect(chunks).toEqual(['我先查一下数据'])
  })

  it('缺 finish_reason 且无工具调用 → 回落 stop；缺 usage → undefined（不伪造零值）', async () => {
    stubFetch(jsonResponse({ choices: [{ message: { content: '好的' } }] }))
    const transport = new OpenAiChatTransport({ baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' })
    const reply = await transport.complete({ messages: [], tools: [] })
    expect(reply.finishReason).toBe('stop')
    expect(reply.usage).toBeUndefined()
  })

  it('无 API Key 时不带 Authorization 头', async () => {
    const { inits } = stubFetch(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    const transport = new OpenAiChatTransport({ baseUrl: 'https://x/v1', model: 'm', apiKey: '' })
    await transport.complete({ messages: [], tools: [] })
    expect(inits[0]?.headers?.['Authorization']).toBeUndefined()
  })

  it('HTTP 非 2xx → 抛出带状态码的可读错误', async () => {
    stubFetch(jsonResponse({ error: 'boom' }, 401))
    const transport = new OpenAiChatTransport({ baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' })
    await expect(transport.complete({ messages: [], tools: [] })).rejects.toThrow(/HTTP 401/)
  })

  it('响应体 error.message → 抛出该中文/服务端原因', async () => {
    stubFetch(jsonResponse({ error: { message: 'invalid api key' } }))
    const transport = new OpenAiChatTransport({ baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' })
    await expect(transport.complete({ messages: [], tools: [] })).rejects.toThrow(/invalid api key/)
  })

  it('缺 baseUrl / 缺 model → 抛出可执行指引（不空发请求）', async () => {
    await expect(
      new OpenAiChatTransport({ baseUrl: '  ', model: 'm', apiKey: 'k' }).complete({ messages: [], tools: [] })
    ).rejects.toThrow(/接口地址/)
    await expect(
      new OpenAiChatTransport({ baseUrl: 'https://x/v1', model: '', apiKey: 'k' }).complete({
        messages: [],
        tools: []
      })
    ).rejects.toThrow(/模型/)
  })
})

describe('M3 档位解析与传输层选择', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('resolveAgentTier：未配置/保密/ollama → local；云端服务商 → cloud', () => {
    expect(resolveAgentTier(undefined)).toBe('local')
    expect(resolveAgentTier(cloudConfig({ confidential: true }))).toBe('local')
    expect(resolveAgentTier(cloudConfig({ provider: 'ollama' }))).toBe('local')
    expect(resolveAgentTier(cloudConfig())).toBe('cloud')
  })

  it('云端档 → OpenAiChatTransport，并打到服务商预设地址', async () => {
    const { calls } = stubFetch(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    const transport = resolveAgentTransport(cloudConfig(), 'sk-x')
    expect(transport).toBeInstanceOf(OpenAiChatTransport)
    await transport.complete({ messages: [], tools: [] })
    expect(calls[0]).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('本地/未配置档 → OllamaChatTransport（num_ctx 由配置下发）', () => {
    expect(resolveAgentTransport(undefined, '')).toBeInstanceOf(OllamaChatTransport)
    expect(resolveAgentTransport(cloudConfig({ provider: 'ollama' }), '')).toBeInstanceOf(OllamaChatTransport)
    expect(resolveAgentTransport(cloudConfig({ confidential: true }), '')).toBeInstanceOf(OllamaChatTransport)
    // 本地档的默认 num_ctx 由 llmConfig 单点决定（DD-1），此处确认常量未被并发改动
    expect(LLM_DEFAULT_NUM_CTX).toBe(16_384)
  })

  it('claude 档 → 不误当 OpenAI 兼容端点，调用即抛出「协议不兼容」中文原因', async () => {
    const transport = resolveAgentTransport(cloudConfig({ provider: 'claude' }), 'sk-x')
    expect(transport).not.toBeInstanceOf(OpenAiChatTransport)
    await expect(transport.complete({ messages: [], tools: [] })).rejects.toThrow(/Claude/)
  })
})
