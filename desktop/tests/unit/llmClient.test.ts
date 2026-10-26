import { describe, expect, it, vi } from 'vitest'

import { LlmClient } from '../../src/main/llm/client'
import {
  DEFAULT_LLM_CONFIG,
  hasStoredLlmConfig,
  LLM_MESSAGES,
  loadLlmConfig,
  TASK_CANCELLED_MESSAGE,
  type StoredLlmConfig
} from '../../src/shared/config/llmConfig'
import type { StorageLike } from '../../src/shared/config/settingsStore'

/** 内存 storage（模拟 localStorage）；空构造 = 新装用户 */
function memStorage(): StorageLike {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  }
}

describe('本地 LLM 客户端（ollama）', () => {
  it('服务不可达：状态探测返回可用性 false + 中文可操作提示；generate 抛出同一提示', async () => {
    process.env['MB_OLLAMA_HOST'] = 'http://127.0.0.1:1'
    // ⚠️ 必须**显式**传本地 ollama 配置（M0 起）。
    // 旧写法「不传 config」在 T01 之后不再是「本地档」：回落值是 `DEFAULT_LLM_CONFIG`
    // （provider=deepseek），会走 OpenAI 兼容分支纯本地判定 `available = enabled`，
    // 于是本用例测的就不再是「服务不可达」而是「默认档可用性」了（测试名会骗人）。
    const unreachable: StoredLlmConfig = {
      ...DEFAULT_LLM_CONFIG,
      enabled: true,
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:1'
    }
    try {
      const client = new LlmClient()
      const status = await client.status({ config: unreachable })
      expect(status.available).toBe(false)
      expect(status.models).toEqual([])
      expect(status.message).toContain('Ollama')
      expect(status.message).toContain('ollama serve')

      await expect(client.generate('system', 'prompt', { config: unreachable })).rejects.toThrow('Ollama')
    } finally {
      delete process.env['MB_OLLAMA_HOST']
    }
  })
})

describe('LlmClient：未配置时在任何网络请求之前失败（M0 / DD-0）', () => {
  it('不传 config ⇒ generate 抛「尚未配置 AI 服务」，且状态文案与之一致（唯一落点）', async () => {
    const client = new LlmClient()
    await expect(client.generate('system', 'prompt')).rejects.toThrow(LLM_MESSAGES.notConfigured)
  })

  it('不传 config ⇒ 不产生任何网络请求（fetch 桩一旦被调用即抛错）', async () => {
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    // 用「一被调用就炸」的桩：只要未配置闸不是物理拦在请求之前，本用例必红。
    globalThis.fetch = (async (url: string) => {
      fetchCalls += 1
      throw new Error(`不应发出的请求：${url}`)
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(client.generate('system', 'prompt')).rejects.toThrow(LLM_MESSAGES.notConfigured)
      expect(fetchCalls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('未配置提示不泄漏任何云端地址（用户没配过，不该看到 DeepSeek/OpenAI 域名）', async () => {
    const client = new LlmClient()
    // ⚠️ 用 try/catch 而不是 `.catch()`：后者在「没抛错」时会静默通过，
    // 变成一条永远绿、什么都验不到的假用例。
    let message = ''
    try {
      await client.generate('system', 'prompt')
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).not.toBe('')
    expect(message).not.toContain('deepseek.com')
    expect(message).not.toContain('openai.com')
    expect(message).not.toContain('volces.com')
    expect(message).not.toContain('aliyuncs.com')
  })

    it('「未配置」与「配了但 enabled=false」是两种不同提示（前者要引导、后者只需一句提示）', async () => {
    const client = new LlmClient()
    // 从没配过 ⇒ 引导去配置
    await expect(client.generate('s', 'p')).rejects.toThrow(/尚未配置 AI 服务/)
    // 配了但主动关的 ⇒ 提「启用 API」（用户确实做过那个动作）
    await expect(
      client.generate('s', 'p', { config: { ...DEFAULT_LLM_CONFIG, enabled: false } })
    ).rejects.toThrow('未启用 API')
  })
})

/*
 * 「未配置」闸的**跨层契约**（回归锁）。
 *
 * ## 为什么这条要单独成组，而不是塞进上面某个用例
 * `client.ts` 的未配置闸判据是 `options.config === undefined`，它的成立**依赖渲染层**
 * `llmBootstrap.ts::pushLlmConfigMirror()` 只在 `hasStoredLlmConfig()` 为真时才推镜像。
 * 这个耦合横跨两个进程、两个仓库子目录，**没有任何类型能约束它** ⇒
 * 渲染层哪天把推送改成无条件的，主进程这边**编译通过、单测全绿**，只是闸门静默失效
 * （新装用户改收「未启用 API」，即「从没配过却被告知你禁用了 API」）。
 *
 * 那个 bug 就是这么组合出来的：渲染层加了无条件启动推送（各自都合理、都有理由），
 * 主进程的闸随之静默失效，而两边单测**各自全绿** —— 只有两者放一起才看得出错。
 * 所以下面这条用例的作用不是测 LlmClient，而是**把「loadLlmConfig 永不返回 undefined」
 * 这个前提显式钉住**：后人若想让闸门失效（改判据 / 改推送语义），会先撞到它，
 * 再读到 client.ts 里那段写了同一件事的注释。
 */
describe('LlmClient：未配置闸所依赖的跨层前提', () => {
  it('loadLlmConfig() 永不返回 undefined ⇒ 「推了镜像」等价于「用户配过」', async () => {
    const storage = memStorage()
    // 空 storage（= 新装用户）：hasStored 为 false，但 loadLlmConfig 照样给出对象
    expect(hasStoredLlmConfig(storage)).toBe(false)
    expect(loadLlmConfig(storage)).toBeDefined()

    // 因此渲染层若无条件推送，主进程就分不出「没配过」——
    // 闸门是否可达，完全取决于**推不推**，而不是推的内容。
    // 这就是 llmBootstrap 必须用 hasStoredLlmConfig() 守卫的原因。
    const mirrorIfPushed = loadLlmConfig(storage)
    expect(mirrorIfPushed === undefined).toBe(false)

    // 而一旦不推（镜像保持 null），本层立刻回到正确的 fail-closed 行为：
    const client = new LlmClient()
    await expect(client.generate('s', 'p')).rejects.toThrow(/尚未配置 AI 服务/)
  })
})

/*
 * E63：LlmClient.testConnection（真实连通性探测，对齐 旧版 api_config 的「测试连接」）。
 * 设计铁律：**不抛错**——所有成功/失败都转成 `{ ok, message }` 供 UI 直接展示。
 * 下面按「未配置 / claude / OpenAI 可达 / OpenAI HTTP 失败 / OpenAI 网络异常 / Ollama 可用 / Ollama 不可用」
 * 七个分支锁死行为，防止哪天有人把「探测」写成「发正式请求」或「抛错」。
 */
describe('LlmClient.testConnection（E63：真实连通性探测，不抛错）', () => {
  it('未传 config ⇒ 返回未配置提示（且不发生任何网络请求）', async () => {
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('不应发出的请求')
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.testConnection()
      expect(res.ok).toBe(false)
      expect(res.message).toContain(LLM_MESSAGES.notConfigured)
      expect(fetchCalls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('claude 服务商 ⇒ 返回「暂未接入」，不发请求', async () => {
    const originalFetch = globalThis.fetch
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls += 1
      throw new Error('不应发出的请求')
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.testConnection({
        config: { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'claude' },
        apiKey: 'x'
      })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('暂未接入')
      expect(fetchCalls).toBe(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('OpenAI 兼容（DeepSeek）可达 ⇒ ok:true 且文案含「连接成功」', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.testConnection({
        config: { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', baseUrl: 'http://fake.test/v1' }, apiKey: 'sk-test'
      })
      expect(res.ok).toBe(true)
      expect(res.message).toContain('连接成功')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('OpenAI 兼容（DeepSeek）HTTP 失败 ⇒ ok:false 且文案含状态码', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: false, status: 401 })) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.testConnection({
        config: { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', baseUrl: 'http://fake.test/v1' }, apiKey: 'sk-test'
      })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('连接失败')
      expect(res.message).toContain('HTTP 401')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('OpenAI 兼容（DeepSeek）网络异常 ⇒ ok:false 且文案含「无法连接」', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.testConnection({
        config: { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', baseUrl: 'http://fake.test/v1' }, apiKey: 'sk-test'
      })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('无法连接')
      expect(res.message).toContain('ECONNREFUSED')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('Ollama 可用（status 探测成功）⇒ ok:true 且文案取 status.message', async () => {
    const client = new LlmClient()
    const spy = vi.spyOn(client, 'status').mockResolvedValue({
      available: true,
      models: ['qwen3:8b'],
      message: '本地模型 1 个',
      provider: 'ollama'
    })
    try {
      const res = await client.testConnection({
        config: { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434' }
      })
      expect(res.ok).toBe(true)
      expect(res.message).toBe('本地模型 1 个')
    } finally {
      spy.mockRestore()
    }
  })

  it('Ollama 不可用（status 探测失败）⇒ ok:false 且文案取 status.message', async () => {
    const client = new LlmClient()
    const spy = vi.spyOn(client, 'status').mockResolvedValue({
      available: false,
      models: [],
      message: 'Ollama 未运行（ollama serve）',
      provider: 'ollama'
    })
    try {
      const res = await client.testConnection({
        config: { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'ollama', baseUrl: 'http://127.0.0.1:11434' }
      })
      expect(res.ok).toBe(false)
      expect(res.message).toBe('Ollama 未运行（ollama serve）')
    } finally {
      spy.mockRestore()
    }
  })
})

/*
 * 云端请求超时（`LLM_REQUEST_TIMEOUT_MS`）。
 *
 * 这个常量在 `llmConfigData.ts` 里写着「超时后主进程抛中文『请求超时』错误，UI 直接展示」，
 * 但**长期零引用** —— `fetch` 默认无限等待，服务端不回包时面板永久转圈。
 * 与 `SkillDispatcher.maxAllowedRisk` 同型的「看着像策略、实际零守卫」。
 * 这里锁两件事：signal 真的挂上去了 + 超时被翻译成可重试的中文错误（不是「连不上」）。
 */
describe('LlmClient.generate：云端请求挂超时信号', () => {
  const cloudConfig: StoredLlmConfig = {
    ...DEFAULT_LLM_CONFIG,
    enabled: true,
    provider: 'deepseek',
    baseUrl: 'http://fake.test/v1',
    model: 'deepseek-v4-pro'
  }

  it('fetch 收到 AbortSignal（信号缺失 = 永久等待，无论常量写多少秒）', async () => {
    const originalFetch = globalThis.fetch
    let received: RequestInit | undefined
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      received = init
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '好的' } }] })
      }
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const out = await client.generate('sys', 'user', { config: cloudConfig, apiKey: 'sk-test' })
      expect(out.content).toBe('好的')
      expect(received?.signal).toBeInstanceOf(AbortSignal)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('超时被翻译成「请求超时（180 秒未返回）」而不是「无法连接」', async () => {
    const originalFetch = globalThis.fetch
    const timeout = new Error('The operation was aborted due to timeout')
    timeout.name = 'TimeoutError'
    globalThis.fetch = (async () => {
      throw timeout
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const error = await client.generate('sys', 'user', { config: cloudConfig, apiKey: 'sk-test' }).catch(
        (failure: unknown) => failure
      )
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('请求超时（180 秒未返回）')
      expect((error as Error).message).toContain('请重试')
      // 两类错误不许合并：超时不是「连不上」，否则用户会去查网络/地址
      expect((error as Error).message).not.toContain('无法连接')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('真正的连接失败仍报「无法连接」（两类错误不许合并）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(client.generate('sys', 'user', { config: cloudConfig, apiKey: 'sk-test' })).rejects.toThrow(
        /无法连接/
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('探活用的是 30s 的另一个上限（快失败），且错误不抛而是返回 ok:false', async () => {
    const originalFetch = globalThis.fetch
    const timeout = new Error('timeout')
    timeout.name = 'TimeoutError'
    globalThis.fetch = (async () => {
      throw timeout
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      const res = await client.testConnection({ config: cloudConfig, apiKey: 'sk-test' })
      expect(res.ok).toBe(false)
      expect(res.message).toContain('连接超时（30 秒未响应）')
      expect(res.message).not.toContain('无法连接')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

/*
 * 本地 Ollama：改前走 `ollama` SDK（`client.generate` / `client.list`），而该 SDK
 * 不接受 `AbortSignal` ⇒ 本地档既没有超时、也无法被「停止」打断，与云端行为不对称。
 * 换 `fetch` 后两条路径共享同一套取消/超时/错误归一。
 */
describe('LlmClient：本地 Ollama 走 fetch（可取消）', () => {
  const localConfig: StoredLlmConfig = {
    ...DEFAULT_LLM_CONFIG,
    enabled: true,
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen3:8b'
  }

  const jsonOk = (body: unknown): Response =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  /** 装一个假 fetch：`/api/tags` 给模型列表，`/api/generate` 交给调用方决定 */
  function stubOllama(onGenerate: (init: RequestInit) => Promise<Response>): {
    calls: string[]
    restore: () => void
  } {
    const original = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push(String(url))
      if (String(url).endsWith('/api/tags')) return jsonOk({ models: [{ name: 'qwen3:8b' }] })
      return onGenerate(init)
    }) as unknown as typeof fetch
    return { calls, restore: () => (globalThis.fetch = original) }
  }

  it('打 /api/generate 且挂 AbortSignal，解析正文与 token 计数', async () => {
    let seen: RequestInit | undefined
    const stub = stubOllama(async (init) => {
      seen = init
      return jsonOk({ response: '写好了', prompt_eval_count: 10, eval_count: 20 })
    })
    try {
      const client = new LlmClient()
      const out = await client.generate('sys', 'user', { config: localConfig })
      expect(out.content).toBe('写好了')
      expect(out.model).toBe('qwen3:8b')
      expect(out.usage).toEqual({ promptTokens: 10, completionTokens: 20, totalTokens: 30 })
      expect(stub.calls.some((url) => url.endsWith('/api/generate'))).toBe(true)
      // 关键：信号真的挂上去了 —— 否则「停止」对本地档无效（改前就是如此）
      expect(seen?.signal).toBeInstanceOf(AbortSignal)
    } finally {
      stub.restore()
    }
  })

  it('本地：maxTokens 随请求下发为 options.num_predict（设置面板「最大令牌」对本地档生效）', async () => {
    let body: { options?: { num_predict?: number } } = {}
    const stub = stubOllama(async (init) => {
      body = JSON.parse(String(init.body)) as typeof body
      return jsonOk({ response: 'ok' })
    })
    try {
      const client = new LlmClient()
      await client.generate('sys', 'user', { config: { ...localConfig, maxTokens: 512 } })
      expect(body.options?.num_predict).toBe(512)
    } finally {
      stub.restore()
    }
  })

  it('调用方取消 → 抛「已取消本次生成」，不是「AI 调用失败」', async () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    const stub = stubOllama(async () => {
      throw abort
    })
    try {
      const client = new LlmClient()
      const error = await client.generate('sys', 'user', { config: localConfig }).catch((e: unknown) => e)
      expect((error as Error).message).toBe(TASK_CANCELLED_MESSAGE)
      expect((error as Error).message).not.toContain('AI 调用失败')
    } finally {
      stub.restore()
    }
  })

  it('超时同样被区分（不是取消、也不是连不上）', async () => {
    const timeout = new Error('timeout')
    timeout.name = 'TimeoutError'
    const stub = stubOllama(async () => {
      throw timeout
    })
    try {
      const client = new LlmClient()
      const error = await client.generate('sys', 'user', { config: localConfig }).catch((e: unknown) => e)
      expect((error as Error).message).toContain('请求超时（180 秒未返回）')
    } finally {
      stub.restore()
    }
  })

  it('本地服务没起（/api/tags 失败）→ 复用「未运行」文案，且不去打生成接口', async () => {
    const original = globalThis.fetch
    const calls: string[] = []
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url))
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await expect(client.generate('sys', 'user', { config: localConfig })).rejects.toThrow(
        /未检测到本地 Ollama 服务/
      )
      expect(calls.some((url) => url.endsWith('/api/generate'))).toBe(false)
    } finally {
      globalThis.fetch = original
    }
  })
})

/*
 * 停止词：`stopWords` 字段一直存在（schema / 设置归一都有），但改前**只存不发** ——
 * 文档写着「发送时按行拆分」，请求体里却从来没有它。这里把两端都钉住。
 */
describe('LlmClient：停止词随请求下发（改前只存不发）', () => {
  it('云端：换行分隔 → stop 数组（空行/空白行被丢掉）', async () => {
    const originalFetch = globalThis.fetch
    let body: Record<string, unknown> = {}
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
    }) as unknown as typeof fetch
    try {
      const client = new LlmClient()
      await client.generate('sys', 'user', {
        config: {
          ...DEFAULT_LLM_CONFIG,
          enabled: true,
          provider: 'deepseek',
          baseUrl: 'http://fake.test/v1',
          model: 'deepseek-v4-pro',
          stopWords: 'END\n###\n   \nDONE'
        },
        apiKey: 'sk-test'
      })
      expect(body['stop']).toEqual(['END', '###', 'DONE'])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('本地：同样下发到 options.stop；没有配置时不带这个键', async () => {
    const original = globalThis.fetch
    let body: { options?: { stop?: string[] } } = {}
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/api/tags')) {
        return { ok: true, status: 200, json: async () => ({ models: [{ name: 'qwen3:8b' }] }) }
      }
      body = JSON.parse(String(init.body)) as { options?: { stop?: string[] } }
      return { ok: true, status: 200, json: async () => ({ response: 'ok' }) }
    }) as unknown as typeof fetch
    const localConfig: StoredLlmConfig = {
      ...DEFAULT_LLM_CONFIG,
      enabled: true,
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      model: 'qwen3:8b'
    }
    try {
      const client = new LlmClient()
      await client.generate('s', 'u', { config: { ...localConfig, stopWords: 'END' } })
      expect(body.options?.stop).toEqual(['END'])
      await client.generate('s', 'u', { config: localConfig })
      expect(body.options).not.toHaveProperty('stop')
    } finally {
      globalThis.fetch = original
    }
  })
})
