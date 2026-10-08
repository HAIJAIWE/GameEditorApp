import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LLM_CONFIG,
  effectiveProvider,
  isCloudProvider,
  isLlmProvider,
  LLM_CONFIG_KEY,
  LLM_MAX_TOKENS_MAX,
  LLM_PROVIDER_ORDER,
  LLM_PROVIDER_PRESETS,
  LLM_TEMPERATURE_MAX,
  LLM_TEMPERATURE_MIN,
  loadLlmConfig,
  resolveLlmBaseUrl,
  sanitizeLlmConfig,
  saveLlmConfig,
  validateLlmConfig,
  type StoredLlmConfig
} from '../../src/shared/llmConfig'
import { SECRET_NAMES } from '../../src/shared/secretNames'
import type { StorageLike } from '../../src/shared/settingsStore'

/** 内存版 StorageLike（测试不碰真 localStorage）；`dump` 必须是 getter 才是实时快照 */
function memStorage(initial: Record<string, string> = {}): StorageLike & { dump: Record<string, string> } {
  const map = new Map(Object.entries(initial))
  return {
    get dump() {
      return Object.fromEntries(map)
    },
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k)
  }
}

describe('LLM_PROVIDER_PRESETS：逐条对齐 Python api_config.py:35-100', () => {
  it('6 个服务商齐全，且顺序与 PyQt MODEL_PRESETS 声明顺序一致', () => {
    expect([...LLM_PROVIDER_ORDER]).toEqual(['ollama', 'openai', 'doubao', 'qwen', 'claude', 'deepseek'])
  })

  it('各服务商的 baseUrl 与模型清单对齐 Python 真源', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.baseUrl).toBe('http://localhost:11434/v1')
    expect(LLM_PROVIDER_PRESETS.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(LLM_PROVIDER_PRESETS.doubao.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3')
    expect(LLM_PROVIDER_PRESETS.qwen.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
    expect(LLM_PROVIDER_PRESETS.claude.baseUrl).toBe('https://api.anthropic.com/v1')
    expect(LLM_PROVIDER_PRESETS.deepseek.baseUrl).toBe('https://api.deepseek.com/v1')
  })

  it('模型条数对齐 Python（Ollama 6 / OpenAI 4 / 豆包 4 / Qwen 5 / Claude 4 / DeepSeek 2）', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.models).toHaveLength(6)
    expect(LLM_PROVIDER_PRESETS.openai.models).toHaveLength(4)
    expect(LLM_PROVIDER_PRESETS.doubao.models).toHaveLength(4)
    expect(LLM_PROVIDER_PRESETS.qwen.models).toHaveLength(5)
    expect(LLM_PROVIDER_PRESETS.claude.models).toHaveLength(4)
    expect(LLM_PROVIDER_PRESETS.deepseek.models).toHaveLength(2)
  })

  it('只有 Ollama 不需要 API Key（对齐 PyQt test_connection 的判断）', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.requiresApiKey).toBe(false)
    for (const p of LLM_PROVIDER_ORDER.filter((x) => x !== 'ollama')) {
      expect(LLM_PROVIDER_PRESETS[p].requiresApiKey).toBe(true)
    }
  })

  it('温度/令牌上下限对齐 PyQt 的 spinbox range', () => {
    expect(LLM_TEMPERATURE_MIN).toBe(0)
    expect(LLM_TEMPERATURE_MAX).toBe(2)
    expect(LLM_MAX_TOKENS_MAX).toBe(32000)
  })
})

describe('isLlmProvider', () => {
  it('接受 6 个合法 key，拒绝其他', () => {
    for (const p of LLM_PROVIDER_ORDER) expect(isLlmProvider(p)).toBe(true)
    expect(isLlmProvider('Ollama')).toBe(false) // 中文标签不是存储值
    expect(isLlmProvider('')).toBe(false)
    expect(isLlmProvider(null)).toBe(false)
    expect(isLlmProvider(123)).toBe(false)
  })
})

describe('loadLlmConfig：容错读取', () => {
  it('storage 为 null 时返回默认值，不抛', () => {
    expect(loadLlmConfig(null)).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('键缺失时返回默认值', () => {
    expect(loadLlmConfig(memStorage())).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('JSON 损坏时回落默认值，不抛异常', () => {
    const s = memStorage({ [LLM_CONFIG_KEY]: '{这不是合法 JSON' })
    expect(loadLlmConfig(s)).toEqual(DEFAULT_LLM_CONFIG)
  })

  it('provider 非法时回落 ollama（最安全：本地无需 Key）', () => {
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify({ ...DEFAULT_LLM_CONFIG, provider: '不存在的' }) })
    expect(loadLlmConfig(s).provider).toBe('ollama')
  })

  it('字段类型不对时逐字段回落（enabled 非布尔 / temperature 非数字）', () => {
    const s = memStorage({
      [LLM_CONFIG_KEY]: JSON.stringify({
        enabled: 'yes',
        provider: 'openai',
        model: 123,
        baseUrl: null,
        temperature: 'hot',
        maxTokens: {}
      })
    })
    const cfg = loadLlmConfig(s)
    expect(cfg.enabled).toBe(DEFAULT_LLM_CONFIG.enabled)
    expect(cfg.provider).toBe('openai') // 合法值保留
    expect(cfg.model).toBe('')
    expect(cfg.baseUrl).toBe('')
    expect(cfg.temperature).toBe(DEFAULT_LLM_CONFIG.temperature)
    expect(cfg.maxTokens).toBe(DEFAULT_LLM_CONFIG.maxTokens)
  })

  it('超范围的 temperature / maxTokens 被夹紧（不产生非法值）', () => {
    const s = memStorage({
      [LLM_CONFIG_KEY]: JSON.stringify({ ...DEFAULT_LLM_CONFIG, temperature: 99, maxTokens: 10 ** 9 })
    })
    const cfg = loadLlmConfig(s)
    expect(cfg.temperature).toBe(LLM_TEMPERATURE_MAX)
    expect(cfg.maxTokens).toBe(LLM_MAX_TOKENS_MAX)
  })

  it('正常配置能原样读回', () => {
    const stored: StoredLlmConfig = {
      enabled: true,
      provider: 'deepseek',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      temperature: 1.2,
      maxTokens: 4000,
      confidential: false
    }
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify(stored) })
    expect(loadLlmConfig(s)).toEqual(stored)
  })

  it('confidential 字段能被读回', () => {
    const stored: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, confidential: true }
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify(stored) })
    expect(loadLlmConfig(s).confidential).toBe(true)
  })
})

describe('saveLlmConfig：安全硬约束 —— apiKey 绝不入库', () => {
  it('写入的 JSON 里没有 apiKey 字段', () => {
    const s = memStorage()
    // 故意多传一个 apiKey（模拟调用方手里握有敏感值）
    const dirty = { ...DEFAULT_LLM_CONFIG, provider: 'openai', apiKey: 'sk-绝不能落盘' } as unknown as StoredLlmConfig
    saveLlmConfig(dirty, s)
    const raw = s.dump[LLM_CONFIG_KEY] ?? ''
    expect(raw).not.toContain('apiKey')
    expect(raw).not.toContain('sk-绝不能落盘')
  })

  it('读回来也没有 apiKey（往返不泄漏）', () => {
    const s = memStorage()
    const dirty = { ...DEFAULT_LLM_CONFIG, apiKey: 'sk-leak' } as unknown as StoredLlmConfig
    saveLlmConfig(dirty, s)
    const loaded = loadLlmConfig(s) as unknown as Record<string, unknown>
    expect(loaded.apiKey).toBeUndefined()
  })

  it('只写白名单里的 7 个字段，不夹带额外键', () => {
    const s = memStorage()
    const dirty = { ...DEFAULT_LLM_CONFIG, extra: 'x', nested: { a: 1 } } as unknown as StoredLlmConfig
    saveLlmConfig(dirty, s)
    const keys = Object.keys(JSON.parse(s.dump[LLM_CONFIG_KEY] ?? '{}')).sort()
    expect(keys).toEqual([
      'baseUrl',
      'confidential',
      'enabled',
      'maxTokens',
      'model',
      'provider',
      'temperature'
    ])
  })

  it('sanitizeLlmConfig 剔除非法 provider 并夹紧范围', () => {
    const dirty = {
      enabled: true,
      provider: 'evil' as never,
      model: 'm',
      baseUrl: 'u',
      temperature: -5,
      maxTokens: 0,
      confidential: true
    }
    expect(sanitizeLlmConfig(dirty)).toEqual({
      enabled: true,
      provider: 'ollama',
      model: 'm',
      baseUrl: 'u',
      temperature: LLM_TEMPERATURE_MIN,
      maxTokens: 1,
      confidential: true
    })
  })

  it('存的是 mb. 前缀的设置键（能进 exportSettings/resetAllSettings 枚举）', () => {
    expect(LLM_CONFIG_KEY).toBe('mb.llmConfig')
  })

  it('Key 走的是独立的 secret 名（不在 mb. 设置键空间里）', () => {
    expect(SECRET_NAMES.llmApiKey).toBe('llm.apiKey')
    expect(SECRET_NAMES.llmApiKey.startsWith('mb.')).toBe(false)
  })
})

describe('resolveLlmBaseUrl：用户填了用用户的，否则用预设', () => {
  it('baseUrl 为空串 ⇒ 回落该服务商预设', () => {
    expect(resolveLlmBaseUrl({ ...DEFAULT_LLM_CONFIG, provider: 'openai', baseUrl: '' })).toBe(
      'https://api.openai.com/v1'
    )
  })

  it('baseUrl 有值 ⇒ 以用户为准（不覆盖）', () => {
    expect(
      resolveLlmBaseUrl({ ...DEFAULT_LLM_CONFIG, provider: 'openai', baseUrl: 'https://my-proxy/v1' })
    ).toBe('https://my-proxy/v1')
  })

  it('只有空格 ⇒ 视为空，回落预设', () => {
    expect(resolveLlmBaseUrl({ ...DEFAULT_LLM_CONFIG, provider: 'qwen', baseUrl: '   ' })).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    )
  })

  // ⚠️ DD-0b 回归：保密模式必须忽略云端 baseUrl，否则本地 Ollama 会被指向云端域名
  it('保密模式 ⇒ 忽略云端 baseUrl，回落 Ollama 预设（数据不出本机）', () => {
    const cfg: StoredLlmConfig = {
      ...DEFAULT_LLM_CONFIG,
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      confidential: true
    }
    expect(resolveLlmBaseUrl(cfg)).toBe('http://localhost:11434/v1')
  })
})

describe('validateLlmConfig：中文原因可直接展示', () => {
  it('未启用 ⇒ 提示先启用', () => {
    expect(validateLlmConfig({ ...DEFAULT_LLM_CONFIG, enabled: false })).toBe('未启用 API，请先在设置中勾选「启用 API」')
  })

  it('已启用的 Ollama ⇒ 通过（本地无需 Key 也无需选模型）', () => {
    expect(validateLlmConfig({ ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'ollama' })).toBeNull()
  })

  it('非 Ollama 且未选模型 ⇒ 提示选模型，原因含服务商名', () => {
    const msg = validateLlmConfig({
      ...DEFAULT_LLM_CONFIG,
      enabled: true,
      provider: 'deepseek',
      model: ''
    })
    expect(msg).toBe('请先为「DeepSeek」选择或填写模型')
  })

  it('非 Ollama 且选了模型 ⇒ 通过', () => {
    expect(
      validateLlmConfig({ ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', model: 'deepseek-chat' })
    ).toBeNull()
  })
})

describe('DD-0b 保密模式：effectiveProvider / isCloudProvider', () => {
  it('非保密 + Ollama ⇒ 本地', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, provider: 'ollama', confidential: false }
    expect(effectiveProvider(cfg)).toBe('ollama')
    expect(isCloudProvider(cfg)).toBe(false)
  })

  it('非保密 + 云端 ⇒ 走云端', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, provider: 'deepseek', confidential: false }
    expect(effectiveProvider(cfg)).toBe('deepseek')
    expect(isCloudProvider(cfg)).toBe(true)
  })

  it('保密模式无视服务商，强制本地 Ollama（数据不出本机硬保证）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, provider: 'deepseek', confidential: true }
    expect(effectiveProvider(cfg)).toBe('ollama')
    expect(isCloudProvider(cfg)).toBe(false)
  })

  it('保密模式下校验按 Ollama 走（不要求云端 Key/模型）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', model: '', confidential: true }
    expect(validateLlmConfig(cfg)).toBeNull()
  })
})
