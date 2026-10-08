import { describe, expect, it } from 'vitest'

import { LlmClient } from '../../src/main/llm/client'
import {
  DEFAULT_LLM_CONFIG,
  hasStoredLlmConfig,
  LLM_MESSAGES,
  loadLlmConfig,
  type StoredLlmConfig
} from '../../src/shared/llmConfig'
import type { StorageLike } from '../../src/shared/settingsStore'

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
