import { describe, expect, it } from 'vitest'

import { LlmClient } from '../../src/main/llm/client'
import { DEFAULT_LLM_CONFIG, type StoredLlmConfig } from '../../src/shared/config/llm/llmConfig'

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
