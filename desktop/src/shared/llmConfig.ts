import {
  defaultStorage,
  readJsonSetting,
  readSetting,
  writeJsonSetting,
  type StorageLike
} from './config/settingsStore'
import {
  FALLBACK_LLM_PROVIDER,
  LLM_PROVIDER_PRESETS,
  LLM_PROVIDER_ORDER,
  LLM_CONFIG_KEY,
  DEFAULT_LLM_CONFIG,
  LLM_TEMPERATURE_MIN,
  LLM_TEMPERATURE_MAX,
  LLM_MAX_TOKENS_MIN,
  LLM_MAX_TOKENS_MAX,
  LLM_TOP_P_MIN,
  LLM_TOP_P_MAX,
  LLM_NUM_CTX_MIN,
  LLM_NUM_CTX_MAX,
  LLM_REPEAT_PENALTY_MIN,
  LLM_REPEAT_PENALTY_MAX,
  LLM_TOP_K_MIN,
  LLM_TOP_K_MAX,
  LLM_SEED_MIN,
  LLM_SEED_MAX,
  LLM_MIROSTAT_MODE_MIN,
  LLM_MIROSTAT_MODE_MAX,
  LLM_MIROSTAT_TAU_MIN,
  LLM_MIROSTAT_TAU_MAX,
  LLM_MIROSTAT_ETA_MIN,
  LLM_MIROSTAT_ETA_MAX,
  LLM_NUM_GPU_MIN,
  LLM_NUM_GPU_MAX,
  LLM_MESSAGES,
  type LlmProvider,
  type StoredLlmConfig,
  type LlmTier,
  type LlmSetupState,
  type LlmSetupGuide
} from './config/llmConfigData'
export * from './config/llmConfigData'

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
    topP: clampNumber(raw.topP, LLM_TOP_P_MIN, LLM_TOP_P_MAX, DEFAULT_LLM_CONFIG.topP),
    numCtx: clampNumber(raw.numCtx, LLM_NUM_CTX_MIN, LLM_NUM_CTX_MAX, DEFAULT_LLM_CONFIG.numCtx),
    repeatPenalty: clampNumber(
      raw.repeatPenalty,
      LLM_REPEAT_PENALTY_MIN,
      LLM_REPEAT_PENALTY_MAX,
      DEFAULT_LLM_CONFIG.repeatPenalty
    ),
    topK: clampNumber(raw.topK, LLM_TOP_K_MIN, LLM_TOP_K_MAX, DEFAULT_LLM_CONFIG.topK),
    seed: clampNumber(raw.seed, LLM_SEED_MIN, LLM_SEED_MAX, DEFAULT_LLM_CONFIG.seed),
    mirostatMode: clampNumber(
      raw.mirostatMode,
      LLM_MIROSTAT_MODE_MIN,
      LLM_MIROSTAT_MODE_MAX,
      DEFAULT_LLM_CONFIG.mirostatMode
    ),
    mirostatTau: clampNumber(
      raw.mirostatTau,
      LLM_MIROSTAT_TAU_MIN,
      LLM_MIROSTAT_TAU_MAX,
      DEFAULT_LLM_CONFIG.mirostatTau
    ),
    mirostatEta: clampNumber(
      raw.mirostatEta,
      LLM_MIROSTAT_ETA_MIN,
      LLM_MIROSTAT_ETA_MAX,
      DEFAULT_LLM_CONFIG.mirostatEta
    ),
    stopWords: asString(raw.stopWords),
    numGpu: clampNumber(raw.numGpu, LLM_NUM_GPU_MIN, LLM_NUM_GPU_MAX, DEFAULT_LLM_CONFIG.numGpu),
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
    topP: clampNumber(config.topP, LLM_TOP_P_MIN, LLM_TOP_P_MAX, DEFAULT_LLM_CONFIG.topP),
    numCtx: clampNumber(config.numCtx, LLM_NUM_CTX_MIN, LLM_NUM_CTX_MAX, DEFAULT_LLM_CONFIG.numCtx),
    repeatPenalty: clampNumber(
      config.repeatPenalty,
      LLM_REPEAT_PENALTY_MIN,
      LLM_REPEAT_PENALTY_MAX,
      DEFAULT_LLM_CONFIG.repeatPenalty
    ),
    topK: clampNumber(config.topK, LLM_TOP_K_MIN, LLM_TOP_K_MAX, DEFAULT_LLM_CONFIG.topK),
    seed: clampNumber(config.seed, LLM_SEED_MIN, LLM_SEED_MAX, DEFAULT_LLM_CONFIG.seed),
    mirostatMode: clampNumber(
      config.mirostatMode,
      LLM_MIROSTAT_MODE_MIN,
      LLM_MIROSTAT_MODE_MAX,
      DEFAULT_LLM_CONFIG.mirostatMode
    ),
    mirostatTau: clampNumber(
      config.mirostatTau,
      LLM_MIROSTAT_TAU_MIN,
      LLM_MIROSTAT_TAU_MAX,
      DEFAULT_LLM_CONFIG.mirostatTau
    ),
    mirostatEta: clampNumber(
      config.mirostatEta,
      LLM_MIROSTAT_ETA_MIN,
      LLM_MIROSTAT_ETA_MAX,
      DEFAULT_LLM_CONFIG.mirostatEta
    ),
    stopWords: asString(config.stopWords),
    numGpu: clampNumber(config.numGpu, LLM_NUM_GPU_MIN, LLM_NUM_GPU_MAX, DEFAULT_LLM_CONFIG.numGpu),
    confidential: asBool(config.confidential, DEFAULT_LLM_CONFIG.confidential)
  }
}

/**
 * 生效的服务商（DD-0b 保密模式）。保密模式下无视用户选择的 provider，
 * **强制回落本地 Ollama** —— 这是「数据不出本机」的硬保证，不是软提示。
 * 所有决定「走云端还是本地」的代码都必须用这个函数，不能直接读 `config.provider`。
 */
export function effectiveProvider(config: StoredLlmConfig): LlmProvider {
  // 本地档（DD-0b）：保留用户选的「本地 provider」——Ollama 原生，或自定义（OpenAI 兼容的
  // 本地端点，如 LM Studio / vLLM / llama.cpp / Ollama 的 /v1）。「不一定是 Ollama」，
  // 用户自己的机器上跑什么本地服务都能接。**只有云端 provider**（deepseek/openai/doubao/qwen/claude）
  // 在本地档仍回落 Ollama，避免把数据误发到第三方域名（数据不出本机的最后兜底）。
  if (config.confidential && config.provider !== 'ollama' && config.provider !== 'custom') return 'ollama'
  return config.provider
}

/** 是否走云端（DD-0b）：保密模式一律=false。 */
export function isCloudProvider(config: StoredLlmConfig): boolean {
  return !config.confidential && config.provider !== 'ollama'
}

/** 生效的接口地址：用户填了用用户的，否则用服务商预设（对齐 PyQt 选服务商即自动填） */
export function resolveLlmBaseUrl(config: StoredLlmConfig): string {
  const trimmed = config.baseUrl.trim()
  const provider = effectiveProvider(config)
  // Ollama 主机标准且可由环境变量（MB_OLLAMA_HOST）注入，地址固定派生（localhost:11434），
  // 不靠用户手填；其余（含本地**自定义** OpenAI 兼容端点）一律以用户填写的地址为准——
  // 这正是「本地可以是 Ollama 之外的其他服务」的落点。
  if (trimmed !== '' && provider !== 'ollama') return trimmed
  return LLM_PROVIDER_PRESETS[provider].baseUrl
}

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
  // 自定义（OpenAI 兼容）：无预设接口地址，必须由用户自填，否则请求会落到空 URL。
  if (effectiveProvider(config) === 'custom' && config.baseUrl.trim() === '') {
    return '自定义平台需要填写接口地址'
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

/** `never-configured` 的引导文案（写清 3 步，理由见 `llmSetupGuide` 内的注释） */
const GUIDE_NEVER_CONFIGURED_TITLE = '尚未配置 AI 服务'
const GUIDE_NEVER_CONFIGURED_BODY =
  '当前所有 AI 功能（策划书生成、数据批量生成、字段 AI）都不可用。请选择一种方式：\n' +
  '① 云端（推荐）：在下方选择服务商并填入 API Key，按 token 计费、模型能力更强。\n' +
  '② 本地：在「模型来源」切到本地 Ollama，数据不出本机、零 API 费用，但需自备本地模型。\n' +
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

