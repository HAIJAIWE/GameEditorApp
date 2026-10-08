import {
  defaultSettingsStorage,
  readJsonSetting,
  readSetting,
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

/**
 * 「非法 / 被篡改 / 旧版本残留的 provider」回落到的档位（M0 新增）。
 *
 * ## 为什么必须独立于 `DEFAULT_LLM_CONFIG.provider`
 * M0 把 `DEFAULT_LLM_CONFIG.provider` 改成了 `'deepseek'`（DD-0 云端优先）。
 * 若回落值继续引用 `DEFAULT_LLM_CONFIG.provider`，那么
 * `loadLlmConfig` / `sanitizeLlmConfig` 遇到非法 provider 时就会**静默回落成云端** ⇒
 * `isCloudProvider` 判成云端 ⇒ 真发请求 + 弹花费确认。而用户根本不知情
 * （他只是手改过 localStorage，或升级自一个残留字段的旧版本——**误伤而非攻击**）。
 *
 * 这与产品的保密底线直接冲突：**「回落」在任何路径下都必须落在最保守的一档**。
 * 故：默认档位（用户可见的初始选择）与回落档位（异常兜底）是**两件不同的事**，
 * 前者由产品裁定，后者由隐私底线钉死。
 */
export const FALLBACK_LLM_PROVIDER: LlmProvider = 'ollama'

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

/**
 * 下拉框用的服务商顺序。
 *
 * ## ⚠️ 这是产品决策（DD-0「云端优先」），**不是**迁移保真，勿改回
 *
 * 曾经的顺序是 `['ollama','openai','doubao','qwen','claude','deepseek']`，理由是
 * 「对齐 Python `api_config.py:35` `MODEL_PRESETS.keys()` 的声明顺序」。
 * M0 已按产品裁定**云端在前、`ollama` 落到末位**：本项目处理**未发布**的设计稿，
 * 本地 Ollama 的真实价值是**保密**（数据不出本机），不是「免费降级」——
 * 所以它是并列的第二档，不是打头的第一档。
 *
 * **后人请勿以「对齐迁移保真」为由改回**：那份 Python 顺序是 PyQt 时代的产物，
 * 与本产品的档位优先级无关（决策记录见 `docs/agent-framework-design.md` 的 D1）。
 *
 * ## 注意它**只决定下拉框的视觉顺序**
 * 真正决定「首次打开设置时选中谁」的是 `DEFAULT_LLM_CONFIG.provider`（见下）——
 * 两者都要改，只改 ORDER 不能实现「默认走云端」。
 */
export const LLM_PROVIDER_ORDER: readonly LlmProvider[] = [
  'deepseek',
  'openai',
  'doubao',
  'qwen',
  'claude',
  'ollama'
]

/** 温度上下限（对齐 PyQt `temp_spin.setRange(0.0, 2.0)` / `setSingleStep(0.1)`） */
export const LLM_TEMPERATURE_MIN = 0
export const LLM_TEMPERATURE_MAX = 2

/** 最大令牌上下限（对齐 PyQt `max_tokens_spin.setRange(1, 32000)`） */
export const LLM_MAX_TOKENS_MIN = 1
export const LLM_MAX_TOKENS_MAX = 32000

/**
 * 落 localStorage 的非敏感字段（**没有 apiKey**，见文件头安全说明）。
 *
 * ## ⚠️ 铁律留档：将来加字段**必须同批改 `shared/schemas.ts::llmConfigSchema`**
 *
 * 本结构会经 IPC 送到主进程，而 `llmConfigSchema` 是 zod 的 `object()`——
 * **zod 默认剥掉未知键**。所以只改这里不改 schema 的后果是：
 * 前端看着「设置已生效」，主进程收到的 `config` 里**根本没有那个字段**（静默吞掉），
 * 表现为「保存了但没用」，且没有任何报错可查。
 * v0.9 加 `confidential` 时已踩过此坑。
 *
 * 因此 M0 的全部改动都靠**新增导出 + 引用替换**完成，**零 interface 字段新增**。
 */
export interface StoredLlmConfig {
  /** 是否启用 LLM（对齐 PyQt `config.enabled`；为 false 时 AI 入口应提示先启用） */
  enabled: boolean
  provider: LlmProvider
  model: string
  /** 空串表示「用该服务商预设地址」 */
  baseUrl: string
  temperature: number
  maxTokens: number
  /**
   * 保密模式（DD-0b）。为 true 时**强制使用本地 Ollama**，禁止任何云端服务商，
   * 并向用户明确告知「数据不出本机」。与云端档在 UI 上**并列**（显式开关），不是隐藏设置。
   */
  confidential: boolean
}

/** 一次 LLM 调用的 token 用量（v0.6 M5：成本护栏的观测地基；client 层填充，shared 层复用） */
export interface LlmUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export const LLM_CONFIG_KEY = 'mb.llmConfig'

/**
 * 默认档位（M0 / DD-0：**云端优先**）。
 *
 * `provider` 取 `'deepseek'`：中文模型、国内直连、预置模型清单短（2 条），
 * 是新装用户最少踩坑的云端选择。本项目处理**未发布**的设计稿 ⇒ 本地 Ollama 的
 * 价值是**保密**（数据不出本机），不是「免费降级」，故它是并列第二档而非默认档。
 *
 * ⚠️ `provider` 与 `model` 是**两件事**：`model` 刻意留空串，由
 * `validateLlmConfig` 报「请先为『DeepSeek』选择或填写模型」——
 * 新用户必须显式选定模型才算配置完成（`llmSetupState` 会把他引导到 `misconfigured`）。
 * 这也是 `llmSetupGuide` 的 `never-configured` 文案必须写清 3 步的原因。
 */
export const DEFAULT_LLM_CONFIG: StoredLlmConfig = {
  enabled: false,
  provider: 'deepseek',
  model: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 1000,
  confidential: false
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
 * `provider` 非法时回落 `FALLBACK_LLM_PROVIDER`（= `'ollama'`，本地、无需 Key）
 * —— **刻意不用 `DEFAULT_LLM_CONFIG.provider`**：默认档位是云端（DD-0），
 * 拿它当异常兜底会让「配置写坏」静默变成「把设计稿发到云端」，违背保密底线。
 * 详见 `FALLBACK_LLM_PROVIDER` 的注释。
 */
export function loadLlmConfig(storage: StorageLike | null = defaultStorage()): StoredLlmConfig {
  if (storage === null) return { ...DEFAULT_LLM_CONFIG }
  /*
   * ⚠️ 「键缺失 / JSON 损坏」必须走 `hasStoredLlmConfig` 判定，**不能只看**下面那行
   * `readJsonSetting` 的结果。
   *
   * 原因：`readJsonSetting(key, {}, storage)` 在「键缺失」与「JSON 损坏」两种情况下
   * **都返回 fallback `{}`**，而 `{}` 是合法 object ⇒ `raw === null || typeof raw !== 'object'`
   * 判为 false ⇒ 会**掉进逐字段夹取分支**，此时 `raw.provider` 是 `undefined`，
   * 于是 provider 被 `FALLBACK_LLM_PROVIDER` 兜成 `'ollama'`。
   *
   * 后果：键缺失时返回的**不是** `DEFAULT_LLM_CONFIG`，而是一份「除 provider 外都等于
   * 默认值」的混合体。M0 之前两者恰好都等于 `'ollama'`，这个 bug 被掩盖了；
   * 一旦默认档位按 DD-0 改成云端，它立刻暴露为「新装用户打开设置看到的是本地 Ollama」
   * —— 也就是产品裁定的「云端优先」被静默推翻。故此处显式前置判定。
   */
  if (!hasStoredLlmConfig(storage)) return { ...DEFAULT_LLM_CONFIG }
  // 键存在且是合法 JSON 对象（storage 中途被清空等边缘情况仍逐字段夹一次兜底）
  const raw = readJsonSetting<Record<string, unknown>>(LLM_CONFIG_KEY, {}, storage)
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_LLM_CONFIG }
  return {
    enabled: asBool(raw.enabled, DEFAULT_LLM_CONFIG.enabled),
    provider: isLlmProvider(raw.provider) ? raw.provider : FALLBACK_LLM_PROVIDER,
    model: asString(raw.model),
    baseUrl: asString(raw.baseUrl),
    temperature: clampNumber(
      raw.temperature,
      LLM_TEMPERATURE_MIN,
      LLM_TEMPERATURE_MAX,
      DEFAULT_LLM_CONFIG.temperature
    ),
    maxTokens: clampNumber(raw.maxTokens, LLM_MAX_TOKENS_MIN, LLM_MAX_TOKENS_MAX, DEFAULT_LLM_CONFIG.maxTokens),
    confidential: asBool(raw.confidential, DEFAULT_LLM_CONFIG.confidential)
  }
}

/**
 * 写配置。**显式白名单挑选字段**（同 `imageGenConfig` 的做法）：
 * 即便调用方手里握着一个带 `apiKey` 的对象，也不会被写进 localStorage。
 */
export function saveLlmConfig(config: StoredLlmConfig, storage: StorageLike | null = defaultStorage()): boolean {
  return writeJsonSetting(LLM_CONFIG_KEY, sanitizeLlmConfig(config), storage)
}

/**
 * 剔除非法字段并夹紧范围；独立成函数便于单测直接锁「apiKey 绝不入库」。
 *
 * `provider` 非法时同样回落 `FALLBACK_LLM_PROVIDER`（见 `loadLlmConfig` 的同名说明）：
 * 这里是**写库前**的最后一道闸，非法值必须落在本地档而不是云端档。
 */
export function sanitizeLlmConfig(config: StoredLlmConfig): StoredLlmConfig {
  return {
    enabled: asBool(config.enabled, DEFAULT_LLM_CONFIG.enabled),
    provider: isLlmProvider(config.provider) ? config.provider : FALLBACK_LLM_PROVIDER,
    model: asString(config.model),
    baseUrl: asString(config.baseUrl),
    temperature: clampNumber(
      config.temperature,
      LLM_TEMPERATURE_MIN,
      LLM_TEMPERATURE_MAX,
      DEFAULT_LLM_CONFIG.temperature
    ),
    maxTokens: clampNumber(config.maxTokens, LLM_MAX_TOKENS_MIN, LLM_MAX_TOKENS_MAX, DEFAULT_LLM_CONFIG.maxTokens),
    confidential: asBool(config.confidential, DEFAULT_LLM_CONFIG.confidential)
  }
}

/**
 * 生效的服务商（DD-0b 保密模式）。保密模式下无视用户选择的 provider，
 * **强制回落本地 Ollama** —— 这是「数据不出本机」的硬保证，不是软提示。
 * 所有决定「走云端还是本地」的代码都必须用这个函数，不能直接读 `config.provider`。
 */
export function effectiveProvider(config: StoredLlmConfig): LlmProvider {
  if (config.confidential) return 'ollama'
  return config.provider
}

/** 是否走云端（DD-0b）：保密模式一律=false。 */
export function isCloudProvider(config: StoredLlmConfig): boolean {
  return !config.confidential && config.provider !== 'ollama'
}

/** 生效的接口地址：用户填了用用户的，否则用服务商预设（对齐 PyQt 选服务商即自动填） */
export function resolveLlmBaseUrl(config: StoredLlmConfig): string {
  const trimmed = config.baseUrl.trim()
  // ⚠️ DD-0b 保密模式：stored.baseUrl 可能是云端地址（如 api.deepseek.com），
  // 对本地 Ollama **毫无意义**，若沿用会让 Ollama 客户端去连云端域名 ⇒ 一律忽略。
  if (trimmed !== '' && !config.confidential) return trimmed
  return LLM_PROVIDER_PRESETS[effectiveProvider(config)].baseUrl
}

/**
 * AI 相关的中文文案**唯一落点**（M0）。
 *
 * 存在的理由：`main/llm/client.ts` 与 `main/agent/ollamaTransport.ts` 各自硬编码过
 * 同一批文案（`ollama pull qwen3:8b`、Claude 不兼容说明、Ollama 未启动…），
 * 改一处忘另一处就会出现「同一个错误在两个入口说法不同」。收敛到这里即可防漂移。
 *
 * 声明位置刻意放在 `validateLlmConfig` **之前**：文案是「因」，校验是「果」，
 * 且 `validateLlmConfig` 直接引用 `LLM_MESSAGES.disabled`（不复制字符串）。
 *
 * ## 两条前缀契约（有单测锁住，别随手改）
 * - `notConfigured` **不带**「未启用 API」前缀：用户从没配置过，
 *   说「你什么时候启用的」是错的。
 * - `disabled` 与 `cloudDisabled` **带**「未启用 API」前缀：用户确实做过那个动作；
 *   `llmClientProviders.test.ts` 用 `toContain('未启用 API')` 子串匹配，保留可让该断言不破。
 *
 * ## 内容纪律：只说用户**现在能做**的事
 * 例：`ollamaNoModel` 只写「执行 ollama pull qwen3:8b」，
 * **不写**「建议 7–8B」「4B 工具调用不可靠」—— 那是 M0.5（DD-1/DD-2）才有的能力，
 * 现在说了就是**占位文案**（承诺了尚不存在的能力）。
 *
 * `notConfigured` / `disabled` 会被拿去拼界面文案，**必须能独立成句、语义自洽**。
 */
export const LLM_MESSAGES = {
  notConfigured:
    '尚未配置 AI 服务：请到「设置 → AI 模型服务」选择服务商并填写 API Key；若你的设计稿不便上传云端，可一键启用「保密模式」，全部 AI 调用只在本机运行。',
  disabled: '未启用 API，请先到「设置 → AI 模型服务」勾选「启用 API」',
  claudeUnsupported:
    'Claude（Anthropic）使用 Anthropic Messages API，与 OpenAI 协议不兼容，本版暂未接入。请改用 OpenAI / 豆包 / Qwen / DeepSeek。',
  ollamaNoModel: '未检测到本地模型。请先在命令行执行 ollama pull qwen3:8b 拉取模型后重试。',
  cloudDisabled: (label: string) =>
    `未启用 API，请先到「设置 → AI 模型服务」勾选「启用 API」并为「${label}」选择或填写模型；若只想在本机处理，可改用 Ollama 或开启「保密模式」（数据不出本机）。`,
  ollamaNotRunning: (host: string) =>
    `未检测到本地 Ollama 服务。请先在命令行执行 ollama serve 启动（地址 ${host}），或确认该地址与设置中的接口地址一致。`
} as const

/**
 * 校验配置是否可用。返回中文原因（可直接展示），`null` 表示通过。
 * 规则对齐 PyQt `test_connection`（`api_config.py:643-650`）：非 Ollama 必须有 Key。
 */
export function validateLlmConfig(config: StoredLlmConfig): string | null {
  if (!config.enabled) return LLM_MESSAGES.disabled
  // 校验"实际会用到的"服务商：保密模式强制 ollama，不能拿 stored.provider 要求云端 Key/模型
  const preset = LLM_PROVIDER_PRESETS[effectiveProvider(config)]
  if (preset.requiresApiKey) {
    // Key 不在本结构里（走 safeStorage），这里只校验「该服务商是否需要 Key」这一事实，
    // 真正的 Key 存在性由主进程用 secretStore 判定，不在渲染层凭空猜。
    if (config.model.trim() === '') return `请先为「${preset.label}」选择或填写模型`
  }
  return null
}

// ============================================================================
// M0「默认档位纠正」（DD-0 云端优先）—— 四态判定 + 档位解析 + 文案常量
//
// ## 为什么要这一段
// M0 之前存在一条**静默回落**路径：`main/llm/client.ts:60` 有
// `const DEFAULT_STORED_CONFIG = { ...DEFAULT_LLM_CONFIG, enabled: true }`，
// 渲染层没推配置过来时客户端就**假定「已启用 + 本地 ollama」并直接干活**；
// 而渲染层**从不在启动时推配置**（只在用户改设置时推）⇒
// 新装用户只要没打开过设置面板，这条静默路径就是**默认行为**。
//
// 本段提供判定地基，让上层能区分四种状态，并给出**唯一落点**的中文文案。
// 上层（main / renderer）只允许调用本段导出的符号，**不得**自行拼档位或写死文案。
// ============================================================================

/**
 * AI 调用档位（M0）。
 *
 * - `cloud`：走云端服务商（按 token 计费、模型能力更强）
 * - `local`：走本机 Ollama（数据不出本机、零 API 费用）
 * - `unconfigured`：**根本没有配置**（`config === undefined`）——
 *   刻意与「配了但 enabled=false」分开：前者要**引导**，后者不该打扰。
 */
export type LlmTier = 'cloud' | 'local' | 'unconfigured'

/**
 * 解析生效档位。**这是档位判定的唯一真源**。
 *
 * 上层任何「这通电话走云端还是本地」的判断都必须调它，不得自行读 `config.provider`
 * （那会绕过保密模式的强制本地）。判定规则：
 * 1. `undefined` ⇒ `'unconfigured'`（没有任何配置可判）
 * 2. `confidential === true` ⇒ `'local'`（保密强制本地，**压过**用户选的 provider）
 * 3. `provider === 'ollama'` ⇒ `'local'`
 * 4. 其余 ⇒ `'cloud'`
 *
 * 与 `effectiveProvider` 的关系：2/3 两条等价于 `effectiveProvider(config) === 'ollama'`，
 * 这里显式展开是为了让「保密压过 provider」这条隐私规则在判定处**自证**，
 * 读代码的人不必先跳去 `effectiveProvider` 才知道优先级。
 *
 * 注：`isCloudProvider`（v0.9 成果）**保留不动** —— 它表达的是「配置意图」，
 * 渲染层 UI 仍在用它；两者语义相近但不是一回事，本函数才是「这通电话走哪」的答案。
 */
export function resolveLlmTier(config: StoredLlmConfig | undefined): LlmTier {
  if (config === undefined) return 'unconfigured'
  if (config.confidential === true) return 'local'
  if (config.provider === 'ollama') return 'local'
  return 'cloud'
}

/**
 * AI 配置的**四态**（M0）。这是「该不该给用户看引导」的唯一判据。
 *
 * | 态 | 含义 | 该做什么 |
 * |---|---|---|
 * | `never-configured` | 用户**从没配过**（含配置写坏 ⇒ 归到「未配置」以便自愈） | 给完整引导 + 一键保密 |
 * | `disabled` | 配过，但用户**主动关了** | 不打扰，只给一句纯提示 |
 * | `misconfigured` | 开着，但**配置不全**（如没选模型） | 说清缺什么，不给替代方案按钮 |
 * | `ready` | 可用 | 不显示任何引导 |
 */
export type LlmSetupState = 'never-configured' | 'disabled' | 'misconfigured' | 'ready'

/**
 * 判定四态。**顺序不可换**（`hasStored` 必须是第一判据）。
 *
 * ⚠️ 「配过没有」只由 `hasStored` 参数回答，**绝不**从 `config` 里推断
 * （如拿 `enabled === false` 当「没配过」）。混了会出现
 * 「用户从没配过，却被告知『你禁用了 API』」这类误导 —— 而用户根本没做过那个动作。
 *
 * 因此本函数**保持 `validateLlmConfig(config)` 单参签名不变**（有 6 处既有调用点），
 * `hasStored` 由调用方显式传入（渲染层用 `hasStoredLlmConfig()` 求真值，
 * 测试可注入构造值 ⇒ 依赖注入 = 可测）。
 */
export function llmSetupState(config: StoredLlmConfig, hasStored: boolean): LlmSetupState {
  if (hasStored === false) return 'never-configured'
  if (!config.enabled) return 'disabled'
  return validateLlmConfig(config) === null ? 'ready' : 'misconfigured'
}

/**
 * 四态对应的引导内容（M0）。渲染层**直接渲染这些文案**，不要自己拼。
 *
 * 字段含义：
 * - `showGuide`：是否显示引导块（标题 + 正文）
 * - `showEnableConfidential`：是否显示「一键保密」按钮（**只有 `never-configured` 给**）
 * - `hint`：不显示引导块时的**纯提示**（只有 `disabled` 用；无提示时为 `null`）
 */
export interface LlmSetupGuide {
  state: LlmSetupState
  showGuide: boolean
  showEnableConfidential: boolean
  title: string
  body: string
  hint: string | null
}

/** `never-configured` 的引导文案（写清 3 步，理由见 `llmSetupGuide` 内的注释） */
const GUIDE_NEVER_CONFIGURED_TITLE = '尚未配置 AI 服务'
const GUIDE_NEVER_CONFIGURED_BODY =
  '当前所有 AI 功能（策划书生成、数据批量生成、字段 AI）都不可用。请选择一种方式：\n' +
  '① 云端（推荐）：在下方选择服务商并填入 API Key，按 token 计费、模型能力更强。\n' +
  '② 保密模式：一键启用本地 Ollama，数据不出本机、零 API 费用，但需自备本地模型。\n' +
  '（无论选哪种，都需要先在上方「模型」栏选定一个模型。）'

/** `disabled` 的纯提示（不加大按钮、不引导改服务商 —— 用户是主动关的，别啰嗦） */
const GUIDE_DISABLED_HINT = 'AI 已关闭。需要恢复请勾选上方「启用 API」。'

/** `misconfigured` 的引导标题（正文由 `validateLlmConfig` 的具体原因填充） */
const GUIDE_MISCONFIGURED_TITLE = 'AI 配置还差一点'

/**
 * 生成引导内容。**只调 N1–N4 的结果，不自己重写 if 判档位**。
 *
 * ## 逐态的设计取舍
 * - `never-configured` ⇒ `showEnableConfidential: true`。这是**唯一**给「一键保密」的状态：
 *   用户还没有任何倾向，正是并排给出两个档位选择的时机。
 *   ⚠️ 正文**必须写清 3 步**：`DEFAULT_LLM_CONFIG.model = ''` ⇒ 用户只勾「启用 API」
 *   仍然跑不起来（`validateLlmConfig` 会报「请先为『DeepSeek』选择或填写模型」）。
 *   不写这一步，引导块本身就是**假引导**。
 * - `disabled` ⇒ 不显示引导块，但给 `hint`。用户是**主动关**的，大块引导等于说教。
 * - `misconfigured` ⇒ 显示引导块但**不给「一键保密」按钮**：原因已经明确
 *   （如「请先为『DeepSeek』选择或填写模型」），再给「改走本地」大按钮是噪声。
 * - `ready` ⇒ 什么都不显示。
 *
 * ⚠️ `hasStored` 是**入参**，本函数**内部不调** `hasStoredLlmConfig()`：
 * 那样依赖 storage 实例，测试就无法构造「配过但 enabled:false」这个关键用例
 * ⇒ 依赖注入 = 可测。
 */
export function llmSetupGuide(config: StoredLlmConfig, hasStored: boolean): LlmSetupGuide {
  const state = llmSetupState(config, hasStored)
  switch (state) {
    case 'never-configured':
      return {
        state,
        showGuide: true,
        showEnableConfidential: true,
        title: GUIDE_NEVER_CONFIGURED_TITLE,
        body: GUIDE_NEVER_CONFIGURED_BODY,
        hint: null
      }
    case 'disabled':
      return {
        state,
        showGuide: false,
        showEnableConfidential: false,
        title: '',
        body: '',
        hint: GUIDE_DISABLED_HINT
      }
    case 'misconfigured':
      return {
        state,
        showGuide: true,
        showEnableConfidential: false,
        title: GUIDE_MISCONFIGURED_TITLE,
        // 复用 validateLlmConfig 的原因（含服务商名），不另写一套措辞
        body: validateLlmConfig(config) ?? '',
        hint: null
      }
    case 'ready':
      return {
        state,
        showGuide: false,
        showEnableConfidential: false,
        title: '',
        body: '',
        hint: null
      }
  }
}

/**
 * 构造「一键保密」配置（M0）：在当前配置基础上切到本地档。
 *
 * - `model` **保留用户原值**：清掉会丢用户手填的数据；为空时上层会回落
 *   已拉取本地模型的第一个（见 `main/llm/client.ts` 的 Ollama 分支）。
 * - `baseUrl` **必须清空**：否则设置面板的「实际生效」会显示云端域名，误导用户
 *   （虽然 `resolveLlmBaseUrl` 保密时也会忽略它，但 UI 不该依赖那条规则的副作用）。
 * - **不写** `temperature` / `maxTokens`：沿用当前值，不引入意外变更。
 * - 不涉及 `apiKey`：本地不需要，且 Key 走 safeStorage、不在这个结构里。
 */
export function buildConfidentialConfig(current: StoredLlmConfig): StoredLlmConfig {
  return {
    ...current,
    enabled: true,
    confidential: true,
    provider: 'ollama',
    baseUrl: '',
    model: current.model
  }
}

/**
 * 用户**是否配置过** LLM（M0）。这是 `llmSetupState` 的 `hasStored` 实参来源。
 *
 * ## 为什么不能走 `loadLlmConfig` 判定
 * `loadLlmConfig` 内部用 `readJsonSetting(LLM_CONFIG_KEY, {}, storage)`，而
 * `readJsonSetting` 在「键缺失」与「JSON 损坏」两种情况**都返回 fallback `{}`**，
 * 调用方无法区分。若按「能否 load 出一个对象」来判：用户配置被写坏
 * （如 `'{这不是合法JSON'`）会被判成「用户主动关了 AI」⇒ **误导且永不引导修复**。
 * 故此处独立判定：读原始串 → `null` 即「没有」；否则 `JSON.parse` 包 try/catch。
 *
 * ## 判定口径
 * - `storage === null`（Node / 主进程 / 隐私模式）⇒ `false`（读不到 ≠ 配过）
 * - 原始串 `null`（键不存在）⇒ `false`
 * - 解析成功且结果 `typeof === 'object' && !== null` ⇒ `true`
 *   （宽松口径：数组也算数——它至少是用户写进去的合法 JSON，
 *   真正的「写坏了」由 `loadLlmConfig` 逐字段夹紧兜住）
 * - 解析抛错，或结果是标量（如 `'"abc"'` / `'123'` / `'null'`）⇒ `false`
 *
 * ⇒ **JSON 损坏归入「未配置」**（可引导、可自愈），而非「已关闭」（静默死锁）。
 *
 * @param storage 依赖注入：主进程无 localStorage、测试用内存 storage，都靠它
 */
export function hasStoredLlmConfig(storage: StorageLike | null = defaultStorage()): boolean {
  if (storage === null) return false
  const raw = readSetting(LLM_CONFIG_KEY, storage)
  if (raw === null) return false
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    // 损坏的 JSON = 未配置（给引导、可自愈），不是「已关闭」
    return false
  }
}

