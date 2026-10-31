import { afterEach, describe, expect, it } from 'vitest'

import { OllamaChatTransport } from '../../src/main/agent/transport/ollamaTransport'
import { LLM_DEFAULT_NUM_CTX } from '../../src/shared/config/llm'

/**
 * M1 观测：Ollama 传输层的 token 用量回报。
 *
 * 为什么用「桩 fetch + 自造 NDJSON 流」而不是起真服务：本层要验的是**解析契约**
 * （最终 chunk 的 `prompt_eval_count` / `eval_count` 如何映射为 `usage`），
 * 起服务只会让用例变慢且不增加断言强度（真往返已由 e2e `agent-brain-chat.spec.ts` 覆盖）。
 */

/** 造一个只含 NDJSON 流体的 fetch Response 桩（够 OllamaChatTransport 消费即可） */
function ndjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`))
      controller.close()
    }
  })
  return { ok: true, status: 200, body, text: async () => '' } as unknown as Response
}

function stubFetch(response: Response): { calls: string[]; bodies: string[] } {
  const calls: string[] = []
  const bodies: string[] = []
  globalThis.fetch = (async (url: string, init?: { body?: unknown }) => {
    calls.push(String(url))
    if (typeof init?.body === 'string') bodies.push(init.body)
    return response
  }) as unknown as typeof fetch
  return { calls, bodies }
}

const originalFetch = globalThis.fetch

describe('OllamaChatTransport：M1 观测（token 用量 / 模型回报）', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('解析最终 chunk 的 prompt_eval_count / eval_count 为 usage，并回报 model', async () => {
    const { calls } = stubFetch(
      ndjsonResponse([
        JSON.stringify({ message: { role: 'assistant', content: '你好' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: '！' }, done: false }),
        JSON.stringify({
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 120,
          eval_count: 45
        })
      ])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'stub:latest' })
    const reply = await transport.complete({ messages: [], tools: [] })

    expect(reply.content).toBe('你好！')
    expect(reply.finishReason).toBe('stop')
    expect(reply.model).toBe('stub:latest')
    expect(reply.usage).toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165 })
    expect(calls[0]).toContain('/api/chat')
  })

  it('done chunk 缺 token 字段 → usage 为 undefined（不伪造零值，交给上层回落）', async () => {
    stubFetch(
      ndjsonResponse([
        JSON.stringify({ message: { role: 'assistant', content: 'hi' }, done: false }),
        JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' })
      ])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'stub:latest' })
    const reply = await transport.complete({ messages: [], tools: [] })
    expect(reply.usage).toBeUndefined()
  })

  it('tool_calls 与 usage 并存：两路信息都不丢', async () => {
    stubFetch(
      ndjsonResponse([
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'c1', function: { name: 'system.game_data', arguments: { action: 'list' } } }]
          },
          done: false
        }),
        JSON.stringify({
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'tool_calls',
          prompt_eval_count: 10,
          eval_count: 3
        })
      ])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'stub:latest' })
    const reply = await transport.complete({ messages: [], tools: [] })
    expect(reply.toolCalls).toEqual([{ id: 'c1', name: 'system.game_data', arguments: { action: 'list' } }])
    expect(reply.usage).toEqual({ promptTokens: 10, completionTokens: 3, totalTokens: 13 })
  })
})

describe('OllamaChatTransport：M0.5 显式下发 num_ctx（DD-1）', () => {
  it('缺省即下发 LLM_DEFAULT_NUM_CTX（16384，覆盖 Ollama 的 4096 默认）', async () => {
    const { bodies } = stubFetch(
      ndjsonResponse([JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'stub:latest' })
    await transport.complete({ messages: [], tools: [] })
    const body = JSON.parse(bodies[0] ?? '{}') as { options?: { num_ctx?: number } }
    expect(body.options?.num_ctx).toBe(LLM_DEFAULT_NUM_CTX)
    expect(LLM_DEFAULT_NUM_CTX).toBe(16_384)
  })

  it('numCtx 可覆盖：显式传入即用传入值（M0.5「可调」）', async () => {
    const { bodies } = stubFetch(
      ndjsonResponse([JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'stub:latest', numCtx: 8192 })
    await transport.complete({ messages: [], tools: [] })
    const body = JSON.parse(bodies[0] ?? '{}') as { options?: { num_ctx?: number } }
    expect(body.options?.num_ctx).toBe(8192)
  })
})


describe('OllamaChatTransport：图片 vision（按模型能力下发）', () => {
  it('视觉模型：images（data URL）转成裸 base64 下发', async () => {
    const { bodies } = stubFetch(
      ndjsonResponse([JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'llava:7b' })
    await transport.complete({
      messages: [{ role: 'user', content: '看图', images: ['data:image/png;base64,AAAA'] }],
      tools: []
    })
    const body = JSON.parse(bodies[0] ?? '{}') as { messages?: Array<{ images?: string[] }> }
    expect(body.messages?.[0]?.images).toEqual(['AAAA'])
  })

  it('非视觉模型：images 不下发（只保留文本）', async () => {
    const { bodies } = stubFetch(
      ndjsonResponse([JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'qwen3:8b' })
    await transport.complete({
      messages: [{ role: 'user', content: '看图', images: ['data:image/png;base64,AAAA'] }],
      tools: []
    })
    const body = JSON.parse(bodies[0] ?? '{}') as { messages?: Array<{ images?: string[] }> }
    expect(body.messages?.[0]?.images).toBeUndefined()
  })
})

describe('OllamaChatTransport：视觉设定覆盖（vision on/off）', () => {
  it("vision='on'：非视觉模型名也下发裸 base64", async () => {
    const { bodies } = stubFetch(
      ndjsonResponse([JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'my-own-vlm', vision: 'on' })
    await transport.complete({
      messages: [{ role: 'user', content: '看图', images: ['data:image/png;base64,AAAA'] }],
      tools: []
    })
    const body = JSON.parse(bodies[0] ?? '{}') as { messages?: Array<{ images?: string[] }> }
    expect(body.messages?.[0]?.images).toEqual(['AAAA'])
  })

  it("vision='off'：视觉模型名也丢弃 images", async () => {
    const { bodies } = stubFetch(
      ndjsonResponse([JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true, done_reason: 'stop' })])
    )
    const transport = new OllamaChatTransport({ host: 'http://127.0.0.1:9', model: 'llava:13b', vision: 'off' })
    await transport.complete({
      messages: [{ role: 'user', content: '看图', images: ['data:image/png;base64,AAAA'] }],
      tools: []
    })
    const body = JSON.parse(bodies[0] ?? '{}') as { messages?: Array<{ images?: string[] }> }
    expect(body.messages?.[0]?.images).toBeUndefined()
  })
})
