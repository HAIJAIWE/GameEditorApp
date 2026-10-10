import { describe, expect, it } from 'vitest'

import {
  buildConfidentialConfig,
  DEFAULT_LLM_CONFIG,
  effectiveProvider,
  FALLBACK_LLM_PROVIDER,
  hasStoredLlmConfig,
  isCloudProvider,
  isLlmProvider,
  LLM_CONFIG_KEY,
  LLM_DEFAULT_NUM_CTX,
  LLM_MAX_TOKENS_MAX,
  LLM_MESSAGES,
  LLM_PROVIDER_ORDER,
  LLM_PROVIDER_PRESETS,
  LLM_TEMPERATURE_MAX,
  LLM_TEMPERATURE_MIN,
  llmSetupGuide,
  llmSetupState,
  loadLlmConfig,
  resolveLlmBaseUrl,
  resolveLlmTier,
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

describe('LLM_PROVIDER_PRESETS：baseUrl 对齐 Python api_config.py:35-100，模型清单按现网校正', () => {
  it('7 个服务商齐全，且顺序是产品决策「云端在前、ollama 末位、custom 收尾」（DD-0）', () => {
    // ⚠️ 顺序**不是**「对齐 PyQt MODEL_PRESETS 声明顺序」，那是 M0 之前的状态。
    // 现为产品裁定的云端优先（勿以「迁移保真」为由改回，见 shared/llmConfig.ts 的注释）。
    expect([...LLM_PROVIDER_ORDER]).toEqual(['deepseek', 'openai', 'doubao', 'qwen', 'claude', 'ollama', 'custom'])
  })

  it('各服务商的 baseUrl 与模型清单对齐 Python 真源', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.baseUrl).toBe('http://localhost:11434/v1')
    expect(LLM_PROVIDER_PRESETS.openai.baseUrl).toBe('https://api.openai.com/v1')
    expect(LLM_PROVIDER_PRESETS.doubao.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3')
    expect(LLM_PROVIDER_PRESETS.qwen.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
    expect(LLM_PROVIDER_PRESETS.claude.baseUrl).toBe('https://api.anthropic.com/v1')
    expect(LLM_PROVIDER_PRESETS.deepseek.baseUrl).toBe('https://api.deepseek.com/v1')
  })

  it('模型条数保持（Ollama 6 / OpenAI 4 / 豆包 4 / Qwen 5 / Claude 4 / DeepSeek 2）', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.models).toHaveLength(6)
    expect(LLM_PROVIDER_PRESETS.openai.models).toHaveLength(4)
    expect(LLM_PROVIDER_PRESETS.doubao.models).toHaveLength(4)
    expect(LLM_PROVIDER_PRESETS.qwen.models).toHaveLength(5)
    expect(LLM_PROVIDER_PRESETS.claude.models).toHaveLength(4)
    expect(LLM_PROVIDER_PRESETS.deepseek.models).toHaveLength(2)
  })

  /**
   * ⚠️ `models[0]` 就是「默认模型」（`SettingsPanel::handleProviderChange` 取首位）——
   * 故以下两条既锁「默认选谁」，也防有人把已停用 id 以「迁移保真」改回来。
   */
  it('deepseek 默认模型是现网可用的更强档，且不再含已停用 id', () => {
    expect(LLM_PROVIDER_PRESETS.deepseek.models[0]).toBe('deepseek-v4-pro')
    // 2026-07-24 停用；deepseek-coder 更早已并入 chat
    for (const dead of ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder']) {
      expect(LLM_PROVIDER_PRESETS.deepseek.models).not.toContain(dead)
    }
  })

  it('ollama 默认模型是 qwen3:8b（DD-2），而非旧世代或推理模型', () => {
    expect(LLM_PROVIDER_PRESETS.ollama.models[0]).toBe('qwen3:8b')
    // 推理模型无工具调用，不该被当默认（否则数字员工对话面会踩空）
    expect(LLM_PROVIDER_PRESETS.ollama.models[0]).not.toContain('r1')
  })

  it('qwen 默认模型是 Max 旗舰档（不再是 qwen-turbo），且不含旧预览 id', () => {
    // 旧默认 qwen-turbo 是清单里最弱一档 ⇒ 多轮工具调用场景表现必然像「模型不会用工具」
    expect(LLM_PROVIDER_PRESETS.qwen.models[0]).toBe('qwen3-max')
    expect(LLM_PROVIDER_PRESETS.qwen.models).not.toContain('qvq-max-2025-03-25')
    // 首条必须是 Max 系列（防再被改回 turbo / 小档）
    expect(LLM_PROVIDER_PRESETS.qwen.models[0]).toContain('max')
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

  it('provider 非法时回落 FALLBACK_LLM_PROVIDER（本地、无需 Key）', () => {
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify({ ...DEFAULT_LLM_CONFIG, provider: '不存在的' }) })
    expect(loadLlmConfig(s).provider).toBe(FALLBACK_LLM_PROVIDER)
  })

  // ⚠️ 隐私底线（M0 必修）：默认档位已改成云端（'deepseek'），若回落值跟随
  // DEFAULT_LLM_CONFIG.provider，则「配置写坏 / 旧版本残留 / 用户手改 localStorage」
  // 会静默回落成**云端** ⇒ 真发请求 + 弹花费确认，而用户不知情。
  // 故锁死：非法 provider **永远**回落本地档，与 DEFAULT 档位解耦。
  it('非法 provider 永远回落本地档，不跟随 DEFAULT_LLM_CONFIG.provider 变化', () => {
    expect(FALLBACK_LLM_PROVIDER).toBe('ollama')
    // 当前默认档位确实是云端（DD-0）⇒ 两者不同，回落值才不是「恰好撞对」
    expect(DEFAULT_LLM_CONFIG.provider).not.toBe(FALLBACK_LLM_PROVIDER)
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify({ enabled: true, provider: 'evil-provider' }) })
    expect(loadLlmConfig(s).provider).toBe('ollama')
    expect(isCloudProvider(loadLlmConfig(s))).toBe(false) // 绝不判成云端
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
      topP: 1,
      numCtx: 8192,
      repeatPenalty: 1.2,
      topK: 50,
      seed: 42,
      mirostatMode: 0,
      mirostatTau: 5,
      mirostatEta: 0.1,
      stopWords: '',
      numGpu: -1,
      confidential: false
    }
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify(stored) })
    expect(loadLlmConfig(s)).toEqual(stored)
  })

  // ⚠️ 回归（M0 修掉的既有缺陷）：readJsonSetting 对「键缺失」与「JSON 损坏」
  // 都返回 fallback `{}`，而 `{}` 是合法 object ⇒ 旧代码的
  // `raw === null || typeof raw !== 'object'` 守卫**判不出来**，于是掉进
  // 逐字段夹取分支、provider 被 FALLBACK 兜成 'ollama'。
  // M0 之前默认值也是 'ollama'，两者相等 ⇒ bug 被完全掩盖；
  // 默认档位改成云端后立刻暴露为「新装用户打开设置看到本地 Ollama」，
  // 等于把产品裁定的「云端优先」静默推翻。此用例锁死修复。
  it('键缺失 / JSON 损坏 ⇒ 真的返回 DEFAULT_LLM_CONFIG（不是「除 provider 外都等于默认值」的混合体）', () => {
    for (const s of [memStorage(), memStorage({ [LLM_CONFIG_KEY]: '{这不是合法 JSON' })]) {
      const loaded = loadLlmConfig(s)
      expect(loaded).toEqual(DEFAULT_LLM_CONFIG)
      // 单点锁死 provider：新装用户必须落在云端默认档（DD-0）
      expect(loaded.provider).toBe('deepseek')
    }
  })

  it('confidential 字段能被读回', () => {
    const stored: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, confidential: true }
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify(stored) })
    expect(loadLlmConfig(s).confidential).toBe(true)
  })

  // M0.5 / DD-1：单点锁死 numCtx 默认值（防「有人改回 4096」这类静默回退，与 provider 锁定同一取向）
  it('numCtx 默认 = 16384（显式覆盖 Ollama 的 4096 默认）', () => {
    expect(LLM_DEFAULT_NUM_CTX).toBe(16_384)
    expect(DEFAULT_LLM_CONFIG.numCtx).toBe(LLM_DEFAULT_NUM_CTX)
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

  it('只写白名单里的 8 个字段，不夹带额外键', () => {
    const s = memStorage()
    const dirty = { ...DEFAULT_LLM_CONFIG, extra: 'x', nested: { a: 1 } } as unknown as StoredLlmConfig
    saveLlmConfig(dirty, s)
    const keys = Object.keys(JSON.parse(s.dump[LLM_CONFIG_KEY] ?? '{}')).sort()
    expect(keys).toEqual([
      'baseUrl',
      'confidential',
      'enabled',
      'maxTokens',
      'mirostatEta',
      'mirostatMode',
      'mirostatTau',
      'model',
      'numCtx',
      'numGpu',
      'provider',
      'repeatPenalty',
      'seed',
      'stopWords',
      'temperature',
      'topK',
      'topP'
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
      topP: 2,
      numCtx: 1,
      repeatPenalty: 99,
      topK: 999,
      seed: 5,
      mirostatMode: 9,
      mirostatTau: 99,
      mirostatEta: 99,
      stopWords: 'x',
      numGpu: 999,
      confidential: true
    }
    expect(sanitizeLlmConfig(dirty)).toEqual({
      enabled: true,
      provider: 'ollama',
      model: 'm',
      baseUrl: 'u',
      temperature: 0,
      maxTokens: 1,
      topP: 1,
      numCtx: 512,
      repeatPenalty: 2,
      topK: 100,
      seed: 5,
      mirostatMode: 2,
      mirostatTau: 10,
      mirostatEta: 1,
      stopWords: 'x',
      numGpu: 200,
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
  it('未启用 ⇒ 提示先启用（文案取自 LLM_MESSAGES.disabled，唯一落点）', () => {
    expect(validateLlmConfig({ ...DEFAULT_LLM_CONFIG, enabled: false })).toBe(LLM_MESSAGES.disabled)
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

// ============================================================================
// M0「默认档位纠正」（DD-0 云端优先）
// ============================================================================

describe('M0 默认档位：DEFAULT_LLM_CONFIG.provider 走云端', () => {
  it('默认服务商是 deepseek（中文模型、国内直连、预置清单短）', () => {
    expect(DEFAULT_LLM_CONFIG.provider).toBe('deepseek')
  })

  it('默认仍是 enabled:false（不静默启用，必须由用户显式打开）', () => {
    expect(DEFAULT_LLM_CONFIG.enabled).toBe(false)
  })

  it('默认 model 为空 ⇒ 只勾「启用 API」仍不算配好（引导必须写清这一步）', () => {
    expect(DEFAULT_LLM_CONFIG.model).toBe('')
    expect(validateLlmConfig({ ...DEFAULT_LLM_CONFIG, enabled: true })).toBe('请先为「DeepSeek」选择或填写模型')
  })
})

describe('M0 hasStoredLlmConfig：区分「没配过」与「配过」', () => {
  it('键缺失 ⇒ false', () => {
    expect(hasStoredLlmConfig(memStorage())).toBe(false)
  })

  it('storage 为 null（Node / 主进程 / 隐私模式）⇒ false，不抛', () => {
    expect(hasStoredLlmConfig(null)).toBe(false)
  })

  it('正常配置 ⇒ true', () => {
    const s = memStorage({ [LLM_CONFIG_KEY]: JSON.stringify({ ...DEFAULT_LLM_CONFIG, enabled: true }) })
    expect(hasStoredLlmConfig(s)).toBe(true)
  })

  // ⚠️ 关键口径：损坏的 JSON 归「未配置」而非「已关闭」——
  // 后者会让用户看到「你禁用了 API」，而他根本没做过那个动作，且永不引导修复。
  it('JSON 损坏 ⇒ false（归入「未配置」，可引导可自愈，不是「已关闭」）', () => {
    const s = memStorage({ [LLM_CONFIG_KEY]: '{这不是合法 JSON' })
    expect(hasStoredLlmConfig(s)).toBe(false)
  })

  it('存的是非对象标量 ⇒ false（不是有效配置）', () => {
    expect(hasStoredLlmConfig(memStorage({ [LLM_CONFIG_KEY]: '"just a string"' }))).toBe(false)
    expect(hasStoredLlmConfig(memStorage({ [LLM_CONFIG_KEY]: '123' }))).toBe(false)
    expect(hasStoredLlmConfig(memStorage({ [LLM_CONFIG_KEY]: 'null' }))).toBe(false)
  })

  it('走注入的 memory storage，不碰真 localStorage', () => {
    const s = memStorage()
    expect(hasStoredLlmConfig(s)).toBe(false)
    saveLlmConfig({ ...DEFAULT_LLM_CONFIG, enabled: true }, s)
    expect(hasStoredLlmConfig(s)).toBe(true)
  })

  // 交叉验证：loadLlmConfig 对「键缺失」与「JSON 损坏」返回同一个默认值，
  // 所以**无法**用它区分二者 —— 这正是 hasStoredLlmConfig 独立判定的理由。
  it('对照组：loadLlmConfig 分不清「缺失」与「损坏」，hasStoredLlmConfig 能分', () => {
    const missing = memStorage()
    const broken = memStorage({ [LLM_CONFIG_KEY]: '{这不是合法 JSON' })
    expect(loadLlmConfig(missing)).toEqual(loadLlmConfig(broken))
    // 两者 hasStored 都是 false（都归「未配置」）；区别在「无键」与「有坏键」，
    // 而 loadLlmConfig 视角下二者不可区分 —— 故不能拿它当 hasStored 的来源。
    expect(hasStoredLlmConfig(missing)).toBe(false)
    expect(hasStoredLlmConfig(broken)).toBe(false)
  })
})

describe('M0 resolveLlmTier：档位判定的唯一真源', () => {
  it('undefined ⇒ unconfigured（没有任何配置可判）', () => {
    expect(resolveLlmTier(undefined)).toBe('unconfigured')
  })

  it('云端服务商 ⇒ cloud', () => {
    expect(resolveLlmTier({ ...DEFAULT_LLM_CONFIG, provider: 'deepseek' })).toBe('cloud')
    expect(resolveLlmTier({ ...DEFAULT_LLM_CONFIG, provider: 'openai' })).toBe('cloud')
  })

  it('ollama ⇒ local', () => {
    expect(resolveLlmTier({ ...DEFAULT_LLM_CONFIG, provider: 'ollama' })).toBe('local')
  })

  // ⚠️ 隐私硬保证：保密模式压过用户选的云端 provider
  it('confidential:true + provider:deepseek ⇒ local（保密压过 provider）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, provider: 'deepseek', confidential: true }
    expect(resolveLlmTier(cfg)).toBe('local')
    // 与既有 effectiveProvider 判定一致（不重造档位逻辑）
    expect(effectiveProvider(cfg)).toBe('ollama')
  })

  it('与 effectiveProvider 对同一份配置永远给出一致结论', () => {
    for (const p of LLM_PROVIDER_ORDER) {
      for (const confidential of [false, true]) {
        const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, provider: p, confidential }
        // 本地档（confidential）也可以是「自定义 OpenAI 兼容端点」，引擎是 custom 而非 ollama，
        // 但档位仍是 local——故判据是「confidential 或 ollama」，而非 effectiveProvider == 'ollama'。
        const expected = cfg.confidential || cfg.provider === 'ollama' ? 'local' : 'cloud'
        expect(resolveLlmTier(cfg)).toBe(expected)
      }
    }
  })
})

describe('M0 llmSetupState：四态真值表', () => {
  const ready: StoredLlmConfig = {
    enabled: true,
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 1,
    numCtx: 4096,
    repeatPenalty: 1.1,
    topK: 40,
    seed: -1,
    mirostatMode: 0,
    mirostatTau: 5,
    mirostatEta: 0.1,
    stopWords: '',
    numGpu: -1,
    confidential: false
  }

  it('hasStored=false ⇒ never-configured（配没配过只由 hasStored 回答）', () => {
    // 即使 config 看起来完全可用，只要没有存储记录就是「从没配过」
    expect(llmSetupState(ready, false)).toBe('never-configured')
    expect(llmSetupState(DEFAULT_LLM_CONFIG, false)).toBe('never-configured')
  })

  it('hasStored=true 且 enabled=false ⇒ disabled（用户主动关了，不是没配过）', () => {
    expect(llmSetupState({ ...ready, enabled: false }, true)).toBe('disabled')
    // 关键用例：enabled:false 但确实配过 ⇒ 不能被误判成 never-configured
    expect(llmSetupState({ ...DEFAULT_LLM_CONFIG, enabled: false, provider: 'openai' }, true)).toBe('disabled')
  })

  it('hasStored=true 且 enabled=true 但校验不通过 ⇒ misconfigured', () => {
    expect(llmSetupState({ ...ready, model: '' }, true)).toBe('misconfigured')
  })

  it('hasStored=true 且 enabled=true 且校验通过 ⇒ ready', () => {
    expect(llmSetupState(ready, true)).toBe('ready')
  })

  it('保密模式下即便没选云端模型也算 ready（校验按 Ollama 走）', () => {
    const confidential: StoredLlmConfig = {
      ...ready,
      provider: 'deepseek',
      model: '',
      confidential: true
    }
    expect(llmSetupState(confidential, true)).toBe('ready')
  })
})

describe('M0 llmSetupGuide：引导内容与按钮可见性', () => {
  const ready: StoredLlmConfig = {
    enabled: true,
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 1000,
    topP: 1,
    numCtx: 4096,
    repeatPenalty: 1.1,
    topK: 40,
    seed: -1,
    mirostatMode: 0,
    mirostatTau: 5,
    mirostatEta: 0.1,
    stopWords: '',
    numGpu: -1,
    confidential: false
  }

  it('never-configured ⇒ 显示引导 + 给「一键保密」按钮', () => {
    const g = llmSetupGuide(DEFAULT_LLM_CONFIG, false)
    expect(g.state).toBe('never-configured')
    expect(g.showGuide).toBe(true)
    expect(g.showEnableConfidential).toBe(true)
    expect(g.title.length).toBeGreaterThan(0)
    expect(g.body.length).toBeGreaterThan(0)
    expect(g.hint).toBeNull()
  })

  // ⚠️ 防「假引导」：DEFAULT_LLM_CONFIG.model 为空，用户只勾「启用 API」仍跑不起来。
  // 正文不写清「要先选模型」，这个引导块就是骗人的。
  it('never-configured 的正文写清了 3 步（含「先选模型」这一步）', () => {
    const { body } = llmSetupGuide(DEFAULT_LLM_CONFIG, false)
    expect(body).toContain('云端')
    expect(body).toContain('本地')
    expect(body).toContain('模型')
  })

  it('disabled ⇒ 不显示引导块，但给一句纯提示（不加大按钮、不引导改服务商）', () => {
    const g = llmSetupGuide({ ...ready, enabled: false }, true)
    expect(g.state).toBe('disabled')
    expect(g.showGuide).toBe(false)
    expect(g.showEnableConfidential).toBe(false)
    expect(g.hint).not.toBeNull()
    expect(g.hint).toContain('启用 API')
  })

  it('misconfigured ⇒ 显示引导但不给「一键保密」按钮（原因已明确，再给按钮是噪声）', () => {
    const g = llmSetupGuide({ ...ready, model: '' }, true)
    expect(g.state).toBe('misconfigured')
    expect(g.showGuide).toBe(true)
    expect(g.showEnableConfidential).toBe(false)
    // 正文复用 validateLlmConfig 的原因（含服务商名），不另写一套措辞
    expect(g.body).toBe('请先为「DeepSeek」选择或填写模型')
  })

  it('ready ⇒ 什么都不显示', () => {
    const g = llmSetupGuide(ready, true)
    expect(g.state).toBe('ready')
    expect(g.showGuide).toBe(false)
    expect(g.showEnableConfidential).toBe(false)
    expect(g.hint).toBeNull()
  })

  it('hasStored 是入参：同一个 config 配 hasStored=true/false 得到不同态（依赖注入 = 可测）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, enabled: false }
    expect(llmSetupGuide(cfg, false).state).toBe('never-configured')
    expect(llmSetupGuide(cfg, true).state).toBe('disabled')
  })
})

describe('M0 buildConfidentialConfig：一键切本地档', () => {
  it('model 保留用户原值（不清掉手填数据）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, provider: 'deepseek', model: 'deepseek-chat' }
    expect(buildConfidentialConfig(cfg).model).toBe('deepseek-chat')
  })

  it('model 为空时也保持空串（上层回落已拉取模型的第一个，不在这里瞎猜）', () => {
    expect(buildConfidentialConfig({ ...DEFAULT_LLM_CONFIG, model: '' }).model).toBe('')
  })

  it('baseUrl 清空（否则设置面板「实际生效」会显示云端域名，误导）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, baseUrl: 'https://api.deepseek.com/v1' }
    expect(buildConfidentialConfig(cfg).baseUrl).toBe('')
    // 清空后回落 Ollama 预设
    expect(resolveLlmBaseUrl(buildConfidentialConfig(cfg))).toBe('http://localhost:11434/v1')
  })

  it('temperature / maxTokens 沿用当前值（不引入意外变更）', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, temperature: 1.7, maxTokens: 8000 }
    const next = buildConfidentialConfig(cfg)
    expect(next.temperature).toBe(1.7)
    expect(next.maxTokens).toBe(8000)
  })

  it('切到 ollama + confidential + enabled，且不改动原对象', () => {
    const cfg: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, enabled: false, provider: 'deepseek' }
    const next = buildConfidentialConfig(cfg)
    expect(next.provider).toBe('ollama')
    expect(next.confidential).toBe(true)
    expect(next.enabled).toBe(true)
    expect(resolveLlmTier(next)).toBe('local')
    // 原对象不可变（UI state 复用同一引用时不能被就地改写）
    expect(cfg.provider).toBe('deepseek')
    expect(cfg.confidential).toBe(false)
  })

  it('不引入 apiKey 字段（Key 走 safeStorage，不在这个结构里）', () => {
    expect(Object.keys(buildConfidentialConfig(DEFAULT_LLM_CONFIG)).sort()).toEqual([
      'baseUrl',
      'confidential',
      'enabled',
      'maxTokens',
      'mirostatEta',
      'mirostatMode',
      'mirostatTau',
      'model',
      'numCtx',
      'numGpu',
      'provider',
      'repeatPenalty',
      'seed',
      'stopWords',
      'temperature',
      'topK',
      'topP'
    ])
  })
})

describe('M0 LLM_MESSAGES：文案契约', () => {
  it('notConfigured 不含「未启用 API」（用户从没配置过，说「你什么时候启用的」是错的）', () => {
    expect(LLM_MESSAGES.notConfigured).not.toContain('未启用 API')
    expect(LLM_MESSAGES.notConfigured).toContain('尚未配置')
  })

  it('disabled 与 cloudDisabled 都含「未启用 API」（锁住前缀契约）', () => {
    expect(LLM_MESSAGES.disabled).toContain('未启用 API')
    expect(LLM_MESSAGES.cloudDisabled('DeepSeek')).toContain('未启用 API')
  })

  it('cloudDisabled 把服务商名填进文案', () => {
    expect(LLM_MESSAGES.cloudDisabled('DeepSeek')).toContain('「DeepSeek」')
    expect(LLM_MESSAGES.cloudDisabled('豆包')).toContain('「豆包」')
  })

  it('ollamaNotRunning 把地址填进文案', () => {
    expect(LLM_MESSAGES.ollamaNotRunning('http://127.0.0.1:11434')).toContain('http://127.0.0.1:11434')
    expect(LLM_MESSAGES.ollamaNotRunning('http://127.0.0.1:11434')).toContain('ollama serve')
  })

  // ⚠️ 防占位文案：M0 还没有 DD-1/DD-2 的模型能力结论，
  // 现在写「建议 7–8B」「4B 工具调用不可靠」就是承诺尚不存在的能力。
  it('ollamaNoModel 只说能做的，不含 M0.5 才有的模型能力结论', () => {
    expect(LLM_MESSAGES.ollamaNoModel).toContain('ollama pull qwen3:8b')
    expect(LLM_MESSAGES.ollamaNoModel).not.toContain('7–8B')
    expect(LLM_MESSAGES.ollamaNoModel).not.toContain('4B')
    expect(LLM_MESSAGES.ollamaNoModel).not.toContain('建议 7')
  })

  it('claudeUnsupported 说清原因并给出可改用的服务商', () => {
    expect(LLM_MESSAGES.claudeUnsupported).toContain('Claude')
    expect(LLM_MESSAGES.claudeUnsupported).toContain('DeepSeek')
  })

  // 「独立成句」验的是**语义自洽**：不能以悬空的连词/介词结尾（如「…或者」）
  // 那种只有拼接进更长句子才读得通的片段。故断言「不以连接性词尾收尾」，
  // 而不是锁句号 —— 定稿文案里 disabled 收在「」上，改标点会破坏 UI 排版。
  it('notConfigured / disabled 语义自洽（不依赖拼接上下文）', () => {
    const dangling = ['或者', '或者。', '和', '与', '以及', '或', '但', '因为', '所以', '，', '、']
    for (const key of ['notConfigured', 'disabled'] as const) {
      const text = LLM_MESSAGES[key]
      expect(text.length).toBeGreaterThan(10)
      for (const tail of dangling) {
        expect(text.endsWith(tail)).toBe(false)
      }
    }
    // 两条都以明确的祈使动作收尾，能独立当界面提示展示
    expect(LLM_MESSAGES.notConfigured).toContain('请到')
    expect(LLM_MESSAGES.disabled).toContain('请先到')
  })
})
