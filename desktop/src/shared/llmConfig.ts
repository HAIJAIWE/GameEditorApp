import {
  defaultSettingsStorage,
  readJsonSetting,
  writeJsonSetting,
  type StorageLike
} from './settingsStore'

/**
 * LLM 服务商配置（对齐 Python `src/ui/dialogs/api_config.py` 的「基础设置」页 +
 * `MODEL_PRESETS`）。
 *
 * ## 范围（有意收窄，只做真正被消费的部分）
 *
 * PyQt 那个对话框 686 行 / 4 个 tab，本轮**只迁「基础设置」**，因为只有它有真实消费者：
 * - ✅ **服务商 / API Key / 接口地址 / 模型 / 温度 / 最大令牌** ——
 *   `features/ai.py:43`（`get_config()` 后判 `config.enabled`、读 model/temperature）、
 *   `core/agent/intent.py:434`、`core/agent/skills/code_skill.py:270`、
 *   `ceshu_skill_generate.py:25` 都真读这些字段。
 * - ❌ **不迁「模型管理」tab 的自定义模型增删改**（`api_config.py:249-286` + `:478-547`）：
 *   它写的是 PyQt 自己的 `custom_models.json`（`_load_custom_models`/`_save_custom_models`），
 *   而 TS 侧的模型清单**来自 Ollama 运行时**（`llm/client.ts:33` `client.list()`），
 *   没有同一个消费者 ⇒ 照搬就是「能存但没人读」的假控件。
 * - ❌ **不迁「视觉模型」tab**：TS 侧无视觉模型消费者（无截图识别/UI 分析链路）。
 * - ❌ **不迁「模板设置」tab**：那其实是**技能生成模板偏好**（`skill_default_mode` 等），
 *   属于策划内容域而非 API 配置域，混进来是职责错位。
 *
 * ## 安全硬约束（同 E22/E25 的既定做法，**不得退步**）
 * **API Key 不落 localStorage**：非敏感字段存 `mb.llmConfig`，Key 由主进程用
 * Electron `safeStorage` 加密落盘（`userData/secrets.enc`，名见 `shared/secretNames.ts`
 * 的 `llmApiKey`）。理由与 `imageGenConfig.ts` 完全相同：localStorage 对渲染层全部
 * JS 可读，明文存 Key 等于把它交给任何注入的脚本。
 *
 * ## 与 PyQt 的差异
 * PyQt 的 `MODEL_PRESETS`（`api_config.py:35`）硬编码 6 家服务商的模型清单与 base_url。
 * 这里照抄那份清单（它是**真实可用的默认值**，不是臆测），但：
 * - 选中的 model 允许为空 ⇒ 交给 `llm/client.ts` 运行时探测（PyQt 也允许手填）。
 * - base_url 允许为空 ⇒ 回落该服务商的预设地址（PyQt 是选服务商就自动填）。
 */

/** 已登记的服务商 key（对齐 `api_config.py:35` `MODEL_PRESETS` 的 6 个键） */
export type LlmProvider = 'ollama' | 'openai' | 'doubao' | 'qwen' | 'claude' | 'deepseek'

export interface LlmProviderPreset {
  /** 服务商展示名（与 PyQt 菜单文案一致） */
  label: string
  /** 默认接口地址（空串表示「由用户填写」） */
  baseUrl: string
  /** 预置模型清单（对齐 PyQt 的 `models`） */
  models: readonly string[]
  /**
   * 是否需要 API Key。Ollama 是本地服务不需要（对齐 PyQt `test_connection`：
   * `if provider != "Ollama" and not api_key: 警告`）。
   */
  requiresApiKey: boolean
}

/**
 * 服务商预设（逐条对齐 Python `api_config.py:35-100` 的 `MODEL_PRESETS`）。
 *
 * 注：key 用小写英文（`ollama`/`openai`/...）而不用 PyQt 的中文标签
 * （`"Ollama"`/`"OpenAI"`/`"豆包"`/...）—— **因为 label 要显示给用户、key 是持久化契约**，
 * 两者混用（拿中文当存储值）会在改文案时静默丢用户配置。
 */
export const LLM_PROVIDER_PRESETS: Readonly<Record<LlmProvider, LlmProviderPreset>> = {
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5:7b', 'qwen2.5:14b', 'qwen3:8b', 'llama3.1:8b', 'mistral:7b', 'deepseek-r1:8b'],
    requiresApiKey: false
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o'],
    requiresApiKey: true
  },
  doubao: {
    label: '豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['ep-20250421182357-69kjm', 'doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k'],
    requiresApiKey: true
  },
  qwen: {
    label: 'Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long', 'qvq-max-2025-03-25'],
    requiresApiKey: true
  },
  claude: {
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: [
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229',
      'claude-3-5-sonnet-20240620'
    ],
    requiresApiKey: true
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    requiresApiKey: true
  }
}

/** 下拉框用的服务商顺序（对齐 `MODEL_PRESETS.keys()` 的声明顺序） */
export const LLM_PROVIDER_ORDER: readonly LlmProvider[] = [
  'ollama',
  'openai',
  'doubao',
  'qwen',
  'claude',
  'deepseek'
]

/** 温度上下限（对齐 PyQt `temp_spin.setRange(0.0, 2.0)` / `setSingleStep(0.1)`） */
export const LLM_TEMPERATURE_MIN = 0
export const LLM_TEMPERATURE_MAX = 2

/** 最大令牌上下限（对齐 PyQt `max_tokens_spin.setRange(1, 32000)`） */
export const LLM_MAX_TOKENS_MIN = 1
export const LLM_MAX_TOKENS_MAX = 32000

/** 落 localStorage 的非敏感字段（**没有 apiKey**，见文件头安全说明） */
export interface StoredLlmConfig {
  /** 是否启用 LLM（对齐 PyQt `config.enabled`；为 false 时 AI 入口应提示先启用） */
  enabled: boolean
  provider: LlmProvider
  model: string
  /** 空串表示「用该服务商预设地址」 */
  baseUrl: string
  temperature: number
  maxTokens: number
}

/** 一次 LLM 调用的 token 用量（v0.6 M5：成本护栏的观测地基；client 层填充，shared 层复用） */
export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export const LLM_CONFIG_KEY = 'mb.llmConfig'

export const DEFAULT_LLM_CONFIG: StoredLlmConfig = {
  enabled: false,
  provider: 'ollama',
  model: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 1000
}

function defaultStorage(): StorageLike | null {
  return defaultSettingsStorage()
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === 'string' && (LLM_PROVIDER_ORDER as readonly string[]).includes(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

/**
 * 读配置。缺失 / JSON 损坏 / 字段类型不对 → 回落默认值（**不抛**，与 imageGenConfig 一致）。
 * `provider` 非法时回落 `ollama`（本地、无需 Key ⇒ 最安全的默认）。
 */
export function loadLlmConfig(storage: StorageLike | null = defaultStorage()): StoredLlmConfig {
  if (storage === null) return { ...DEFAULT_LLM_CONFIG }
  // 读不出来（缺失 / JSON 损坏）时先拿一份默认值，逐字段再夹一次
  const raw = readJsonSetting<Record<string, unknown>>(LLM_CONFIG_KEY, {}, storage)
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_LLM_CONFIG }
  return {
    enabled: asBool(raw.enabled, DEFAULT_LLM_CONFIG.enabled),
    provider: isLlmProvider(raw.provider) ? raw.provider : DEFAULT_LLM_CONFIG.provider,
    model: asString(raw.model),
    baseUrl: asString(raw.baseUrl),
    temperature: clampNumber(
      raw.temperature,
      LLM_TEMPERATURE_MIN,
      LLM_TEMPERATURE_MAX,
      DEFAULT_LLM_CONFIG.temperature
    ),
    maxTokens: clampNumber(raw.maxTokens, LLM_MAX_TOKENS_MIN, LLM_MAX_TOKENS_MAX, DEFAULT_LLM_CONFIG.maxTokens)
  }
}

/**
 * 写配置。**显式白名单挑选字段**（同 `imageGenConfig` 的做法）：
 * 即便调用方手里握着一个带 `apiKey` 的对象，也不会被写进 localStorage。
 */
export function saveLlmConfig(config: StoredLlmConfig, storage: StorageLike | null = defaultStorage()): boolean {
  return writeJsonSetting(LLM_CONFIG_KEY, sanitizeLlmConfig(config), storage)
}

/** 剔除非法字段并夹紧范围；独立成函数便于单测直接锁「apiKey 绝不入库」。 */
export function sanitizeLlmConfig(config: StoredLlmConfig): StoredLlmConfig {
  return {
    enabled: asBool(config.enabled, DEFAULT_LLM_CONFIG.enabled),
    provider: isLlmProvider(config.provider) ? config.provider : DEFAULT_LLM_CONFIG.provider,
    model: asString(config.model),
    baseUrl: asString(config.baseUrl),
    temperature: clampNumber(
      config.temperature,
      LLM_TEMPERATURE_MIN,
      LLM_TEMPERATURE_MAX,
      DEFAULT_LLM_CONFIG.temperature
    ),
    maxTokens: clampNumber(config.maxTokens, LLM_MAX_TOKENS_MIN, LLM_MAX_TOKENS_MAX, DEFAULT_LLM_CONFIG.maxTokens)
  }
}

/** 生效的接口地址：用户填了用用户的，否则用服务商预设（对齐 PyQt 选服务商即自动填） */
export function resolveLlmBaseUrl(config: StoredLlmConfig): string {
  const trimmed = config.baseUrl.trim()
  if (trimmed !== '') return trimmed
  return LLM_PROVIDER_PRESETS[config.provider].baseUrl
}

/**
 * 校验配置是否可用。返回中文原因（可直接展示），`null` 表示通过。
 * 规则对齐 PyQt `test_connection`（`api_config.py:643-650`）：非 Ollama 必须有 Key。
 */
export function validateLlmConfig(config: StoredLlmConfig): string | null {
  if (!config.enabled) return '未启用 API，请先在设置中勾选「启用 API」'
  const preset = LLM_PROVIDER_PRESETS[config.provider]
  if (preset.requiresApiKey) {
    // Key 不在本结构里（走 safeStorage），这里只校验「该服务商是否需要 Key」这一事实，
    // 真正的 Key 存在性由主进程用 secretStore 判定，不在渲染层凭空猜。
    if (config.model.trim() === '') return `请先为「${preset.label}」选择或填写模型`
  }
  return null
}
