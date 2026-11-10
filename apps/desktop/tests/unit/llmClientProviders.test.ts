import { describe, expect, it } from 'vitest'

import { LlmClient } from '../../src/main/llm/client'
import {
  DEFAULT_LLM_CONFIG,
  generateTimeoutMs,
  LLM_GENERATE_TIMEOUT_MS,
  type StoredLlmConfig
} from '@mobai/shared/config/llm'

/**
 * LlmClient 的**协议分流**测试。
 *
 * 重点锁三件事（都是「宁缺勿错」底线）：
 * 1. Claude **不**被当成 OpenAI 兼容端点去发请求（发了必被拒）⇒ 明确报「暂未接入」。
 * 2. 未启用 API 时**不发请求**，直接给中文原因。
 * 3. Ollama 路径**不回归**（保持迁移前的探测逻辑与文案）。
 *
 * 本轮**不打真实网络**：`fetch` 被替换成记录调用的假实现。
 */

const cfg = (over: Partial<StoredLlmConfig> = {}): StoredLlmConfig => ({ ...DEFAULT_LLM_CONFIG, ...over })

describe('LlmClient：未启用 API 时不发请求', () => {
  it('enabled=false ⇒ generate 抛「未启用 API」中文原因', async () => {
    const client = new LlmClient()
    await expect(client.generate('s', 'p', { config: cfg({ enabled: false }) })).rejects.toThrow('未启用 API')
  })

  it('enabled=false 且选了 OpenAI 但没模型 ⇒ 仍先报「未启用」（顺序不颠倒）', async () => {
    const client = new LlmClient()
    await expect(
      client.generate('s', 'p', { config: cfg({ enabled: false, provider: 'openai', model: '' }) })
    ).rejects.toThrow('未启用 API')
  })
})

describe('LlmClient：Claude 明确报「暂未接入」而不是发注定失败的请求', () => {
  it('generate 抛中文原因，含「Claude」', async () => {
    const client = new LlmClient()
    await expect(
      client.generate('s', 'p', { config: cfg({ enabled: true, provider: 'claude', model: 'claude-3-opus-20240229' }) })
    ).rejects.toThrow(/Claude/)
  })

  it('status 报 available=false 并说明协议不兼容', async () => {
    const client = new LlmClient()
    const status = await client.status({ config: cfg({ enabled: true, provider: 'claude' }) })
    expect(status.available).toBe(false)
    expect(status.provider).toBe('claude')
    expect(status.message).toContain('不兼容')
  })

  it('status 仍把 Claude 的预置模型列出来（用户能看到有哪些可选项）', async () => {
    const client = new LlmClient()
    const status = await client.status({ config: cfg({ enabled: true, provider: 'claude' }) })
    expect(status.models.length).toBe(4)
    expect(status.models).toContain('claude-3-opus-20240229')
  })
})

describe('LlmClient：OpenAI 兼容协议（OpenAI/豆包/Qwen/DeepSeek）', () => {
  it('未选模型 ⇒ 抛中文原因，含服务商名，不发请求', async () => {
    const client = new LlmClient()
    await expect(
      client.generate('s', 'p', { config: cfg({ enabled: true, provider: 'qwen', model: '' }) })
    ).rejects.toThrow('请先为「Qwen」选择或填写模型')
  })

  it('选好模型后按 OpenAI 规范发到 {baseUrl}/chat/completions，并解析 choices[0]', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ choices: [{ message: { content: '生成的文本' } }] }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.generate('系统提示', '用户提示', {
        config: cfg({ enabled: true, provider: 'deepseek', model: 'deepseek-chat', baseUrl: '' }),
        apiKey: 'sk-test'
      })
      expect(res.content).toBe('生成的文本')
      expect(res.model).toBe('deepseek-chat')
      // 地址 = 预设 base_url + /chat/completions
      expect(calls[0]?.url).toBe('https://api.deepseek.com/v1/chat/completions')
      // Bearer 头带上了注入的 Key
      expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test')
      // 温度/最大令牌真的进了请求体（否则配置就是摆设）
      const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
      expect(body.temperature).toBe(DEFAULT_LLM_CONFIG.temperature)
      expect(body.max_tokens).toBe(DEFAULT_LLM_CONFIG.maxTokens)
      expect(body.stream).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('自定义 baseUrl 覆盖预设（末尾斜杠不产生双斜杠）', async () => {
    const calls: string[] = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      calls.push(url)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await client.generate('s', 'p', {
        config: cfg({ enabled: true, provider: 'openai', model: 'gpt-4o', baseUrl: 'https://my-proxy.com/v1/' })
      })
      expect(calls[0]).toBe('https://my-proxy.com/v1/chat/completions')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('HTTP 失败 ⇒ 抛中文原因含状态码与截断的服务端细节', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('鉴权失败：invalid api key', { status: 401 })) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(
        client.generate('s', 'p', { config: cfg({ enabled: true, provider: 'openai', model: 'gpt-4o' }) })
      ).rejects.toThrow(/HTTP 401/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('返回空 choices ⇒ 抛中文原因（不把空内容当成功）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(
        client.generate('s', 'p', { config: cfg({ enabled: true, provider: 'openai', model: 'gpt-4o' }) })
      ).rejects.toThrow(/空内容/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('网络不可达 ⇒ 抛「无法连接 X（url）」而不是裸 fetch 错误', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(
        client.generate('s', 'p', { config: cfg({ enabled: true, provider: 'doubao', model: 'doubao-pro-32k' }) })
      ).rejects.toThrow(/无法连接 豆包/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  /*
   * 2026-11-10 实测：本机网关对多单元并发直接回 429
   * （{"code":"user_model_rate_limited","message":"…请求频率超限…"}）。
   * 限流是临时状态不是配置错 —— 退避后重试，绝不能整章中止。
   */
  it('上游限流（HTTP 429）⇒ 退避后重试成功，不把临时限流当故障', async () => {
    const originalFetch = globalThis.fetch
    let n = 0
    globalThis.fetch = (async () => {
      n += 1
      if (n === 1) {
        return new Response(
          JSON.stringify({ error: { code: 'user_model_rate_limited', message: '您的模型请求频率超限，请稍后重试' } }),
          { status: 429 }
        )
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.generate('s', 'p', {
        config: cfg({
          enabled: true,
          provider: 'custom',
          model: 'group/never-stuck',
          baseUrl: 'http://127.0.0.1:3425'
        })
      })
      expect(res.content).toBe('ok')
      expect(n).toBe(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  }, 20_000)
})

describe('LlmClient：status 对 OpenAI 兼容端点不发网络请求', () => {
  it('已启用 ⇒ available=true 并回显服务商与模型（纯本地判断）', async () => {
    const client = new LlmClient()
    const status = await client.status({
      config: cfg({ enabled: true, provider: 'openai', model: 'gpt-4o' })
    })
    expect(status.available).toBe(true)
    expect(status.provider).toBe('openai')
    expect(status.model).toBe('gpt-4o')
  })

  it('未启用 ⇒ available=false 并提示先去设置勾选', async () => {
    const client = new LlmClient()
    const status = await client.status({ config: cfg({ enabled: false, provider: 'openai' }) })
    expect(status.available).toBe(false)
    expect(status.message).toContain('未启用 API')
  })
})

describe('LlmClient：未传配置时按默认服务商分支判定可用性（不静默回落本地）', () => {
  it('不传 options ⇒ 走默认服务商（云端 DeepSeek）分支，available 有明确布尔值', async () => {
    const client = new LlmClient()
    // ⚠️ 本用例的标题在 M0 之前是「保持迁移前行为（只探 Ollama）」——**那已成谎言**：
    // `DEFAULT_LLM_CONFIG.provider` 已是 `'deepseek'`（DD-0 云端优先），
    // 「不传配置」现在走 OpenAI 兼容分支（纯本地判定，不发网络），
    // 而**不是**去连 127.0.0.1:11434。断言当时仍能过 ⇒ 典型的「测试绿着、注释骗人」。
    //
    // 真正的「不传配置 ⇒ 失败」由 `llmClient.test.ts` 的未配置用例锁（generate 抛 notConfigured）。
    // 这里只锁 status：它按默认档位如实回报可用性，不该崩、不该返回 undefined。
    const status = await client.status()
    expect(typeof status.available).toBe('boolean')
    expect(status.message.length).toBeGreaterThan(0)
    // 默认档位是云端 ⇒ provider 回报默认服务商，且不产生任何网络请求（纯本地判断）
    expect(status.provider).toBe(DEFAULT_LLM_CONFIG.provider)
  })
})

describe('LlmClient：推理型模型被 max_tokens 截断时的兜底', () => {
  it('首次 finish_reason=length 且空正文 → 自动放大到 16000 重试并成功', async () => {
    const bodies: Array<{ max_tokens?: number }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { max_tokens?: number }
      bodies.push(body)
      const truncated = (body.max_tokens ?? 0) < 16000
      return new Response(
        JSON.stringify(
          truncated
            ? { choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: null }
            : { choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }
        ),
        { status: 200 }
      )
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.generate('s', 'p', {
        config: cfg({ enabled: true, provider: 'custom', baseUrl: 'http://127.0.0.1:1', model: 'm', maxTokens: 1000 }),
        apiKey: 'k'
      })
      expect(res.content).toBe('{"ok":true}')
      expect(bodies.length).toBe(2)
      expect(bodies[1]?.max_tokens).toBe(16000)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('两次都被截断 → 抛出「截断 / 最大令牌」的可操作错误（不再甩「模型名不正确」）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: '' }, finish_reason: 'length' }], usage: null }),
        { status: 200 }
      )) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(
        client.generate('s', 'p', {
          config: cfg({ enabled: true, provider: 'custom', baseUrl: 'http://127.0.0.1:1', model: 'm', maxTokens: 1000 }),
          apiKey: 'k'
        })
      ).rejects.toThrow(/截断|最大令牌/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('网关把「推理超预算」报成 502（empty reply / cut at its length）→ 放大 16000 重试成功', async () => {
    const bodies: Array<{ max_tokens?: number }> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { max_tokens?: number }
      bodies.push(body)
      if ((body.max_tokens ?? 0) < 16000) {
        return new Response(
          JSON.stringify({
            error: { message: 'WorkBuddy: an empty reply (the model answered nothing; try again) — cut at its length' }
          }),
          { status: 502 }
        )
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }),
        { status: 200 }
      )
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.generate('s', 'p', {
        config: cfg({ enabled: true, provider: 'custom', baseUrl: 'http://127.0.0.1:1', model: 'm', maxTokens: 1000 }),
        apiKey: 'k'
      })
      expect(res.content).toBe('{"ok":true}')
      expect(bodies.length).toBe(2)
      expect(bodies[1]?.max_tokens).toBe(16000)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('LlmClient：单次调用的 maxTokens 覆盖（2026-11-10）', () => {
  /**
   * 为什么需要这组用例：默认 `maxTokens = 1000` 会让推理型模型的正文被思考过程挤空。
   * 长篇生成（整章 / 整节）在 `LlmCallOptions.maxTokens` 传 16000 —— 它**只覆盖这一次**，
   * 不写回用户配置。合并点在 `resolveConfig`，故这里断言的是「真的进了请求体」。
   */
  const capture = async (options: { maxTokens?: number; stored?: number }): Promise<Array<Record<string, unknown>>> => {
    const bodies: Array<Record<string, unknown>> = []
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 })
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const stored = cfg({
        enabled: true,
        provider: 'custom',
        baseUrl: 'http://127.0.0.1:1',
        model: 'm',
        maxTokens: options.stored ?? 1000
      })
      await client.generate('s', 'p', {
        config: stored,
        apiKey: 'k',
        ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {})
      })
    } finally {
      globalThis.fetch = originalFetch
    }
    return bodies
  }

  it('覆盖生效：配置 1000 + 本次 16000 ⇒ 请求体 max_tokens = 16000', async () => {
    const bodies = await capture({ maxTokens: 16000, stored: 1000 })
    expect(bodies).toHaveLength(1)
    expect(bodies[0]?.['max_tokens']).toBe(16000)
  })

  it('不传覆盖 ⇒ 行为不变：请求体仍是配置里的 maxTokens', async () => {
    const bodies = await capture({ stored: 1000 })
    expect(bodies[0]?.['max_tokens']).toBe(1000)
  })

  it('非法覆盖一律静默回落配置值（0 / 40000 / 2.5），不当错误', async () => {
    for (const maxTokens of [0, 40_000, 2.5]) {
      const bodies = await capture({ maxTokens, stored: 1000 })
      expect(bodies, String(maxTokens)).toHaveLength(1)
      expect(bodies[0]?.['max_tokens'], String(maxTokens)).toBe(1000)
    }
  })
})

describe('生成超时随「最大令牌」自适应（推理型模型长章节不再被误判超时）', () => {
  it('默认 1000 token 保持 180 秒（原行为不回归）', () => {
    expect(generateTimeoutMs(1000)).toBe(LLM_GENERATE_TIMEOUT_MS)
    expect(generateTimeoutMs(DEFAULT_LLM_CONFIG.maxTokens)).toBe(180_000)
  })

  it('大预算按比例放宽，上限 600 秒；非法值回落默认', () => {
    expect(generateTimeoutMs(8000)).toBe(600_000)
    expect(generateTimeoutMs(4000)).toBe(400_000)
    expect(generateTimeoutMs(0)).toBe(180_000)
    expect(generateTimeoutMs(Number.NaN)).toBe(180_000)
  })

  it('超时文案显示本次实际秒数（8000 → 600 秒），不是永远 180 秒', async () => {
    const originalFetch = globalThis.fetch
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    globalThis.fetch = (async () => {
      throw timeout
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const error = await client
        .generate('s', 'p', {
          config: cfg({ enabled: true, provider: 'custom', baseUrl: 'http://127.0.0.1:1', model: 'm', maxTokens: 8000 }),
          apiKey: 'k'
        })
        .catch((failure: unknown) => failure)
      expect((error as Error).message).toContain('请求超时（600 秒未返回）')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
