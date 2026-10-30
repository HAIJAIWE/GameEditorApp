import { afterEach, describe, expect, it } from 'vitest'

import { resolveAgentTier, resolveAgentTransport } from '../../src/main/agent/transport/agentTransport'
import { OllamaChatTransport } from '../../src/main/agent/transport/ollamaTransport'
import { buildChatCompletionsUrl, OpenAiChatTransport } from '../../src/main/agent/transport/openAiTransport'
import { DEFAULT_LLM_CONFIG, LLM_DEFAULT_NUM_CTX, type StoredLlmConfig } from '../../src/shared/config/llm/llmConfig'

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
      tools: [{ type: 'function', function: { name: 'system.game_data' } }],
      onChunk: (text) => chunks.push(text)
    })

    expect(calls[0]).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(inits[0]?.headers?.['Authorization']).toBe('Bearer sk-test')
    const body = JSON.parse(String(inits[0]?.body)) as {
      model?: string
      stream?: boolean
      tools?: Array<{ type?: string; function?: { name?: string } }>
    }
    expect(body.model).toBe('deepseek-chat')
    // F9（2026-10-18）：云端档改为 SSE 流式，与本地 Ollama 的逐字 UX 对齐
    expect(body.stream).toBe(true)
    // 线格式透传守卫：传输层**不再包装**，进来什么样出去什么样。
    // （进线前已由 brainService 套好 `{type:'function', function:{…}}`；此处摊平即被端点回 400）
    expect(body.tools).toHaveLength(1)
    expect(body.tools?.[0]?.type).toBe('function')
    expect(body.tools?.[0]?.function?.name).toBe('system.game_data')

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

  it('无工具时**省略** tools 键（`tools: []` 会被部分严格端点判为非法）', async () => {
    const { inits } = stubFetch(jsonResponse({ choices: [{ message: { content: 'ok' } }] }))
    const transport = new OpenAiChatTransport({ baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' })
    await transport.complete({ messages: [], tools: [] })
    expect(JSON.parse(String(inits[0]?.body))).not.toHaveProperty('tools')
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

  // F7（2026-10-18）：未配置档不再伪装成 `local`，而是如实透传 `unconfigured`
  // （M0「不静默回落」要求观测层能区分「故意选本地」与「根本没配置」）。
  it('resolveAgentTier：未配置 → unconfigured；保密/ollama → local；云端服务商 → cloud', () => {
    expect(resolveAgentTier(undefined)).toBe('unconfigured')
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

describe('OpenAiChatTransport：视觉设定覆盖（vision on/off）', () => {
  function captureBody(): { bodies: unknown[] } {
    const bodies: unknown[] = []
    globalThis.fetch = (async (_url: string, init?: { body?: unknown }) => {
      bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body)
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    }) as unknown as typeof fetch
    return { bodies }
  }

  it("vision='on'：文本模型名也把图转成 content parts（image_url）", async () => {
    const { bodies } = captureBody()
    const transport = new OpenAiChatTransport({
      baseUrl: 'https://api.example.com/v1',
      model: 'my-own-vlm',
      apiKey: 'k',
      vision: 'on'
    })
    await transport.complete({
      messages: [{ role: 'user', content: '看图', images: ['data:image/png;base64,AAAA'] }],
      tools: []
    })
    const message = (bodies[0] as { messages: Array<{ content: unknown }> }).messages[0]
    expect(Array.isArray(message?.content)).toBe(true)
    expect(message?.content).toContainEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } })
  })

  it("vision='off'：视觉模型名也丢弃 images（不下发非协议字段）", async () => {
    const { bodies } = captureBody()
    const transport = new OpenAiChatTransport({
      baseUrl: 'https://api.example.com/v1',
      model: 'gpt-4o',
      apiKey: 'k',
      vision: 'off'
    })
    await transport.complete({
      messages: [{ role: 'user', content: '看图', images: ['data:image/png;base64,AAAA'] }],
      tools: []
    })
    const message = (bodies[0] as { messages: Array<{ content: unknown; images?: unknown }> }).messages[0]
    expect(message?.content).toBe('看图')
    expect(message?.images).toBeUndefined()
  })
})
