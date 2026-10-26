/**
 * LLM 服务商配置 —— 定义层（与 llmConfig.ts 的求值/读写逻辑分离）：
 * LlmProvider / LlmTier / LlmSetupState / StoredLlmConfig 等类型、
 * LLM_PROVIDER_PRESETS 服务商预设（**`models[0]` 即默认模型**，见各段注释）、
 * LLM_PROVIDER_ORDER、各项取值上下限常量、DEFAULT_LLM_CONFIG、
 * LLM_MESSAGES（AI 中文文案唯一落点）、M0 四态引导文案常量。
 *
 * 纯数据 / 常量 / 类型，无 IO 与求值逻辑；逻辑层 llmConfig.ts 导入此处常量并
 * `export *` 再导出 ⇒ 外部 import 站点零改动，依赖方向单向（逻辑 → 定义）。
 *
 * ⚠️ 安全硬约束（详见 llmConfig.ts 文件头说明）：API Key **不落** localStorage，
 * 本结构刻意**不含 apiKey** 字段。将来加字段必须同批改
 * `shared/schemas.ts::llmConfigSchema`（zod `object()` 会剥掉未知键，
 * 不同步会造成「前端看着已生效、主进程收到的 config 里没有该字段」的静默丢失）。
 */

/** 已登记的服务商 key（对齐 `api_config:35` `MODEL_PRESETS` 的 6 个键） */
/**
 * 服务商。`custom` = **任意 OpenAI 兼容端点**（自建网关 / 中转 / 第三方聚合等）：
 * 走与 OpenAI 相同的 `POST {baseUrl}/chat/completions`，接口地址与模型名都由用户自填，
 * 没有预设模型列表。其它 5 家是内置预设（切服务商会自动带入预设地址与首个模型）。
 */
export type LlmProvider = 'ollama' | 'openai' | 'doubao' | 'qwen' | 'claude' | 'deepseek' | 'custom'

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
  /** 服务商展示名（与 旧版 菜单文案一致） */
  label: string
  /** 默认接口地址（空串表示「由用户填写」） */
  baseUrl: string
  /** 预置模型清单（对齐 旧版 的 `models`） */
  models: readonly string[]
  /**
   * 是否需要 API Key。Ollama 是本地服务不需要（对齐 旧版 `test_connection`：
   * `if provider != "Ollama" and not api_key: 警告`）。
   */
  requiresApiKey: boolean
}

/**
 * 服务商预设（逐条对齐 旧版 `api_config:35-100` 的 `MODEL_PRESETS`）。
 *
 * 注：key 用小写英文（`ollama`/`openai`/...）而不用 旧版 的中文标签
 * （`"Ollama"`/`"OpenAI"`/`"豆包"`/...）—— **因为 label 要显示给用户、key 是持久化契约**，
 * 两者混用（拿中文当存储值）会在改文案时静默丢用户配置。
 */
export const LLM_PROVIDER_PRESETS: Readonly<Record<LlmProvider, LlmProviderPreset>> = {
  ollama: {
    label: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    /**
     * ⚠️ **`models[0]` 即「默认模型」**（`SettingsPanel::handleProviderChange` 选服务商时取
     * `preset.models[0]`）⇒ 顺序是产品决策，不是随便排的。
     * `qwen3:8b` 提到首位 = **落地 DD-2**（本地档默认模型由 `qwen2.5:7b` 抬到 `qwen3:8b`）：
     * Qwen3 的工具调用写在 chat template 里（Ollama `tools` API 直接可用），且 8B/Q4 塞得进 8GB 卡；
     * `qwen2.5:7b` 保留作旧世代回退。**`deepseek-r1:8b` 是推理模型、无工具调用**
     * ——在数字员工对话面会被 `agentTransport` 当普通模型用，故**不**置于首位。
     */
    models: ['qwen3:8b', 'qwen2.5:7b', 'qwen2.5:14b', 'llama3.1:8b', 'mistral:7b', 'deepseek-r1:8b'],
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
    /**
     * ⚠️ **`models[0]` 即「默认模型」**（同 ollama/deepseek 的约定：选服务商时取 `preset.models[0]`）。
     *
     * 旧值 `['qwen-turbo','qwen-plus','qwen-max','qwen-long','qvq-max-2025-03-25']` 有两处问题：
     * 1. 默认落在 **`qwen-turbo`** —— 整份清单里**最弱**的一档（turbo = 廉价快速档），
     *    数字员工是**多轮工具调用**场景，拿它当默认，表现必然像「模型不会用工具」；
     * 2. `qvq-max-2025-03-25` 是 QwQ/QVQ **旧预览 id**，属死配置。
     *
     * 现网清单与 Function Calling 支持范围以百炼官方文档为准（千问 Max：Qwen3.8-Max / Qwen3.7-Max /
     * Qwen3.6-Max / **Qwen3-Max** / Qwen-Max 系列；Plus / Flash / Turbo / Long 各自成系列）：
     * - `qwen3-max`（**`models[0]` = 默认**）：旗舰档，各项均支持 OpenAI 兼容 `tools`；
     * - `qwen3.8-max`：更新一代旗舰（想再强一档就换它 / 想省钱换 `qwen-plus`）；
     * - `qwen-plus` / `qwen3.5-flash`：均衡档 / 低成本档；
     * - `qwen-long`：长上下文档。
     */
    models: ['qwen3-max', 'qwen3.8-max', 'qwen-plus', 'qwen3.5-flash', 'qwen-long'],
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
    /**
     * ⚠️ **2026-07-24 起 `deepseek-chat` / `deepseek-reasoner` 两个 id 已停用**（请求直接失败），
     * `deepseek-coder` 更早已并入 chat ⇒ 旧的 `['deepseek-chat','deepseek-coder']` **是死配置**。
     * 现网可用 id 为 V4 两档（皆支持 OpenAI 兼容 `tools`）：
     * - `deepseek-v4-pro`（**`models[0]` = 默认**）：推理更强，适合多步 agent 规划；
     * - `deepseek-v4-flash`：为 agent / 工具调用优化的低成本档（换它只改这一行的顺序）。
     * `llmConfig.test.ts` 有守卫断言这两个停用 id **不再出现**（防有人以「迁移保真」改回）。
     */
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    requiresApiKey: true
  },
  /**
   * 自定义（OpenAI 兼容）：无预设地址、无预设模型，两项都由用户自填。
   * ⚠️ `models: []` 是**刻意**的——UI 据此不再用预设模型覆盖用户手填的模型名
   * （见 SettingsPanel::handleProviderChange）。
   */
  custom: {
    label: '自定义（OpenAI 兼容）',
    baseUrl: '',
    models: [],
    requiresApiKey: true
  }
}

/**
 * 下拉框用的服务商顺序。
 *
 * ## ⚠️ 这是产品决策（DD-0「云端优先」），**不是**迁移保真，勿改回
 *
 * 曾经的顺序是 `['ollama','openai','doubao','qwen','claude','deepseek']`，理由是
 * 「对齐 旧版 `api_config:35` `MODEL_PRESETS.keys()` 的声明顺序」。
 * M0 已按产品裁定**云端在前、`ollama` 落到末位**：本项目处理**未发布**的设计稿，
 * 本地 Ollama 的真实价值是**保密**（数据不出本机），不是「免费降级」——
 * 所以它是并列的第二档，不是打头的第一档。
 *
 * **后人请勿以「对齐迁移保真」为由改回**：那份 旧版 顺序是 旧版 时代的产物，
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
  'ollama',
  'custom'
]

/** 温度上下限（对齐 旧版 `temp_spin.setRange(0.0, 2.0)` / `setSingleStep(0.1)`） */
export const LLM_TEMPERATURE_MIN = 0
export const LLM_TEMPERATURE_MAX = 2

/** 最大令牌上下限（对齐 旧版 `max_tokens_spin.setRange(1, 32000)`） */
export const LLM_MAX_TOKENS_MIN = 1
export const LLM_MAX_TOKENS_MAX = 32000

/**
 * Top-P（核采样）上下限。`1` = 不启用（等价于只按温度采样），故默认值取 1。
 * 值域 0–1 与 OpenAI 规范一致。
 */
export const LLM_TOP_P_MIN = 0
export const LLM_TOP_P_MAX = 1

/**
 * 轻量探活（`GET /models` / 连接测试）的请求超时（毫秒）。
 * 超时后主进程抛中文「请求超时」错误，UI 直接展示。
 *
 * ⚠️ **不要**用它给真正的生成调用设上限 —— 见 `LLM_GENERATE_TIMEOUT_MS`。
 */
export const LLM_REQUEST_TIMEOUT_MS = 30_000

/**
 * 单次**生成**请求的兜底超时（毫秒）。与探活分开，是因为两者等待的东西完全不同：
 *
 * - 探活等的是一个几十字节的模型列表 ⇒ 30 秒都算宽容，快失败才是有用的信号。
 * - 生成等的是**完整文本**：请求是 `stream: false`，首次字节就是最后一次字节，
 *   耗时 ≈ 输出 token 数 / 上游速度。默认 `maxTokens = 1000`，慢档上游
 *   （10 tok/s 量级）就要 100 秒 ⇒ 套 30 秒会把**正常但不快**的生成误判成超时。
 *
 * 180 秒是**失败兜底**而非性能目标：正常生成远低于此，只有上游真的挂死才会命中；
 * 命中后给可重试的中文错误，避免「面板永久转圈、只能重启应用」。
 */
export const LLM_GENERATE_TIMEOUT_MS = 180_000

/**
 * 用户主动取消生成时的错误文案（`task:cancel` → abort → 这里）。
 *
 * 语义上**不是故障**：面板据此把状态显示成「已停止」而不是弹红色错误。
 * 放在 shared 是让主进程（抛）与渲染层（识别）用同一份字符串，避免文案漂移。
 */
export const TASK_CANCELLED_MESSAGE = '已取消本次生成'

/**
 * 本地模型（Ollama / 本地 OpenAI 兼容端点）高级采样参数上下限。
 *
 * 这些参数**只在「本地档」生效**：Ollama 原生支持全部；云端 OpenAI 兼容端点只认
 * 协议兼容的子集（temperature / top_p / max_tokens / stop / seed），
 * `num_ctx` / `repeat_penalty` / `top_k` / `mirostat*` / `num_gpu` 是 Ollama 专属
 * （发给云端 OpenAI/DeepSeek 等会被忽略或报错，故 client 层只对 Ollama 传这些字段）。
 */
export const LLM_NUM_CTX_MIN = 512
export const LLM_NUM_CTX_MAX = 128_000
/**
 * 本地档上下文窗口默认值（M0.5 / DD-1）。
 *
 * 刻意**覆盖** Ollama 的 4096 默认：4B 模型在 4K 窗口下约第 7 轮即截断，多轮工具任务跑不完。
 * 16384 是「够跑完一条多轮任务」与「8GB 卡装得下（模型 + KV cache）」的折中；用户可在设置里调。
 */
export const LLM_DEFAULT_NUM_CTX = 16_384
export const LLM_REPEAT_PENALTY_MIN = 1
export const LLM_REPEAT_PENALTY_MAX = 2
export const LLM_TOP_K_MIN = 0
export const LLM_TOP_K_MAX = 100
/** 随机种子：-1 表示每次随机（不可复现），与 Ollama 约定一致 */
export const LLM_SEED_MIN = -1
export const LLM_SEED_MAX = 2_147_483_647
export const LLM_MIROSTAT_MODE_MIN = 0
export const LLM_MIROSTAT_MODE_MAX = 2
export const LLM_MIROSTAT_TAU_MIN = 0
export const LLM_MIROSTAT_TAU_MAX = 10
export const LLM_MIROSTAT_ETA_MIN = 0
export const LLM_MIROSTAT_ETA_MAX = 1
/** GPU 层数：-1 表示全部上 GPU（Ollama 约定） */
export const LLM_NUM_GPU_MIN = -1
export const LLM_NUM_GPU_MAX = 200
/** 停止词序列（换行分隔）的最大长度 */
export const LLM_STOP_WORDS_MAX = 2000

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
  /** 是否启用 LLM（对齐 旧版 `config.enabled`；为 false 时 AI 入口应提示先启用） */
  enabled: boolean
  provider: LlmProvider
  model: string
  /** 空串表示「用该服务商预设地址」 */
  baseUrl: string
  temperature: number
  maxTokens: number
  /**
   * 核采样（top_p）。云端 / 自定义 / 本地 Ollama 均生效。值域 [LLM_TOP_P_MIN, LLM_TOP_P_MAX]。
   */
  topP: number
  /* ---- 本地模型高级采样参数（仅本地档生效；云端忽略，见各字段注释与 client.ts 的传输层分流） ---- */
  /** 上下文窗口大小（Ollama `num_ctx`）。默认 `LLM_DEFAULT_NUM_CTX`（16384，DD-1）。 */
  numCtx: number
  /** 重复惩罚（Ollama `repeat_penalty`）。1 = 不惩罚，越大越抑制重复。 */
  repeatPenalty: number
  /** 候选词 top-k 截断（Ollama `top_k`）。0 = 不截断。 */
  topK: number
  /** 随机种子（Ollama `seed`）。-1 = 每次随机（不可复现）。 */
  seed: number
  /** Mirostat 采样模式（Ollama `mirostat`）：0=关闭，1=Mirostat，2=Mirostat 2.0。 */
  mirostatMode: number
  /** Mirostat 目标熵（Ollama `mirostat_tau`）。 */
  mirostatTau: number
  /** Mirostat 学习率（Ollama `mirostat_eta`）。 */
  mirostatEta: number
  /** 停止词序列（Ollama `stop`），换行分隔；存储为字符串，发送时按行拆分。 */
  stopWords: string
  /** 上 GPU 的层数（Ollama `num_gpu`）。-1 = 全部上 GPU。 */
  numGpu: number
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
  topP: 1,
  // 本地模型高级采样参数默认值（对齐 Ollama 官方默认值，避免「不碰就等于服务端默认」的预期漂移）
  // ⚠️ numCtx 例外：M0.5 / DD-1 明确**不用** Ollama 默认的 4096，显式取 LLM_DEFAULT_NUM_CTX（16384）。
  numCtx: LLM_DEFAULT_NUM_CTX,
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
    '尚未配置 AI 服务：请到「设置 → AI 模型服务」选择服务商并填写 API Key；若你的设计稿不便上传云端，可在「模型来源」里切换到「本地」，全部 AI 调用只在本机运行。',
  disabled: '未启用 API，请先到「设置 → AI 模型服务」勾选「启用 API」',
  claudeUnsupported:
    'Claude（Anthropic）使用 Anthropic Messages API，与 OpenAI 协议不兼容，本版暂未接入。请改用 OpenAI / 豆包 / Qwen / DeepSeek。',
  ollamaNoModel: '未检测到本地模型。请先在命令行执行 ollama pull qwen3:8b 拉取模型后重试。',
  cloudDisabled: (label: string) =>
    `未启用 API，请先到「设置 → AI 模型服务」勾选「启用 API」并为「${label}」选择或填写模型；若只想在本机处理，可改用 Ollama 或在「模型来源」里切换到「本地」（数据不出本机）。`,
  ollamaNotRunning: (host: string) =>
    `未检测到本地 Ollama 服务。请先在命令行执行 ollama serve 启动（地址 ${host}），或确认该地址与设置中的接口地址一致。`,
  /**
   * 触发限流（E61）。对齐 旧版 `common/ai_client` 的三处文案
   * （"请求过于频繁，请稍后再试" / "流式请求过于频繁…" / "视觉请求过于频繁…"）。
   * 旧版 触发限流时**拒绝请求**，不是静默放行 —— 静默放行使限流形同虚设，故 TS 同样抛错。
   */
  rateLimited: 'AI 请求过于频繁，已触发限流保护。请稍候几秒后重试。'
} as const

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

