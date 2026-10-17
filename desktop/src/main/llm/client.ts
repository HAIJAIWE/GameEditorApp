import {
  DEFAULT_LLM_CONFIG,
  effectiveProvider,
  LLM_MESSAGES,
  LLM_PROVIDER_PRESETS,
  LLM_GENERATE_TIMEOUT_MS,
  LLM_REQUEST_TIMEOUT_MS,
  resolveLlmBaseUrl,
  TASK_CANCELLED_MESSAGE,
  validateLlmConfig,
  type LlmProvider,
  type LlmUsage,
  type StoredLlmConfig
} from '../../shared/config/llmConfig'
import { isAbortError } from '../../shared/abort'
import { sharedRateLimiter } from '../../shared/util/rateLimiter'

/**
 * LLM 客户端。
 *
 * ## 两种传输（刻意区分，不是「所有 provider 都走 ollama 协议」）
 * - **Ollama**：走原生 `/api/generate`（用 `ollama` SDK，行为与迁移前一致，**不回归**）。
 * - **其余 5 家**（OpenAI / 豆包 / Qwen / DeepSeek，以及 OpenAI 兼容端点）：
 *   走 OpenAI 兼容的 `POST {baseUrl}/chat/completions`。
 *   豆包 / Qwen / DeepSeek 的 base_url 都是 `.../v1` 或 `.../api/v3` 形态，
 *   按 OpenAI 规范拼 `/chat/completions` 即可。
 * - **Claude 特殊**：Anthropic 的 Messages API **不兼容** OpenAI 协议
 *   （`x-api-key` + `anthropic-version` 头 + `messages` 里 content 是数组），
 *   强行按 OpenAI 发会被服务端拒。本轮对 Claude **明确报「暂未接入」**，
 *   **不假装成功、也不发一个注定失败的请求**（项目铁律：宁缺勿错）。
 *
 * ## 配置来源
 * 从 `shared/llmConfig.ts` 的 `StoredLlmConfig` 读（localStorage，由设置面板写入），
 * API Key 由主进程 `SecretStore` 提供（`userData/secrets.enc`，**明文不进 localStorage**）。
 * 构造时注入 `configProvider` / `apiKeyProvider` 两个读取函数（依赖注入，
 * 便于单测注入假实现，也避免本模块直接依赖 Electron 存储）。
 *
 * ## 未配置时**在发请求之前**就失败（M0 / DD-0）
 * 渲染层从未配置时**不传** `options.config`（`config === undefined`）。此时：
 * - `generate()` 直接抛 `LLM_MESSAGES.notConfigured`（给出可执行指引），
 *   **不静默回落本地 Ollama、也不发任何网络请求**；
 * - `status()` 不抛错（供 UI 展示状态用），按 `DEFAULT_LLM_CONFIG` 的服务商
 *   判定可用性（默认档位是云端 DeepSeek，见 `DEFAULT_LLM_CONFIG`）。
 * 历史行为（未配置时探 Ollama）已随 M0 移除，理由见 `shared/llmConfig.ts` 末尾的说明。
 * - 环境变量 `MB_OLLAMA_HOST` / `MB_OLLAMA_MODEL` 仍是 Ollama 的**兜底**，
 *   优先级：设置面板 > 环境变量 > 默认值。
 */

export interface LlmStatus {
  available: boolean
  models: string[]
  message: string
  /** 当前生效的服务商（未传配置时回落 `DEFAULT_LLM_CONFIG`，即默认档位 DeepSeek） */
  provider?: LlmProvider
  /** 当前生效的模型（若能确定） */
  model?: string
}

/** 生效配置（由注入的读取函数提供） */
export interface LlmRuntimeConfig extends StoredLlmConfig {
  /** API Key（来自 safeStorage，**不落 localStorage**） */
  apiKey: string
}

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434'

/**
 * 合并「本次调用」的配置：调用方传入优先，缺失回落默认（+ Ollama 的环境变量兜底）。
 *
 * ⚠️ 未传配置时回落的是 `DEFAULT_LLM_CONFIG`（`enabled: false`），
 * **不是**一份「假定已启用」的伪造配置 —— M0 之前这里用的是
 * `{ ...DEFAULT_LLM_CONFIG, enabled: true }`，等于把「没配过」静默当成「配好了」，
 * 会绕过 `validateLlmConfig` 里 `if (!config.enabled)` 那道唯一的闸门。
 * 现在这个回落值只影响 `status()`（供 UI 展示）；`generate()` 有更靠前的
 * 「未配置」闸（见 `generate`），根本走不到这里。
 */
function resolveConfig(options: LlmCallOptions): LlmRuntimeConfig {
  const stored = options.config ?? DEFAULT_LLM_CONFIG
  // DD-0b 保密模式：无视 stored.provider，强制本地 Ollama（数据不出本机硬保证）
  const effective = effectiveProvider(stored)
  return {
    ...stored,
    provider: effective,
    apiKey: options.apiKey ?? '',
    /*
     * Ollama 主机：设置面板的 baseUrl 优先；它是 `http://host:11434/v1` 形态，
     * 而 ollama SDK 要的是 `http://host:11434`（不含 /v1）⇒ 这里剥掉尾部 /v1。
     * 环境变量兜底保留（迁移前的既有行为）。
     *
     * ⚠️ DD-0b：保密模式下 stored.baseUrl 可能是**云端地址**（api.deepseek.com 等），
     * 拿它当 Ollama host 会去连云端域名 ⇒ 保密模式一律忽略 stored.baseUrl。
     */
    baseUrl:
      effective === 'ollama'
        ? stored.baseUrl.trim() === '' || stored.confidential
          ? (process.env['MB_OLLAMA_HOST'] ?? '')
          : stored.baseUrl
        : stored.baseUrl
  }
}

/** 剥掉 OpenAI 风格的 `/v1` 后缀，拿到 ollama SDK 需要的裸 host */
function toOllamaHost(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (trimmed === '') return process.env['MB_OLLAMA_HOST'] ?? DEFAULT_OLLAMA_HOST
  return trimmed.replace(/\/v1\/?$/, '')
}

/**
 * 读取「本次调用」的配置。
 *
 * ## 为什么不注入读取函数、也不读 localStorage
 * 主进程**没有 localStorage**（那是渲染进程的存储），而配置文件刻意存 localStorage
 * （与 `imageGenConfig` 同一套 `mb.` 设置体系）。所以沿用 E22 既定纪律
 * （见 `main/ipc.ts:618-621` 的注释）：
 * **渲染层每次请求带上非敏感配置 → 主进程注入从 safeStorage 解密出的 Key**。
 * 好处是渲染层**永不持有长期明文 Key**，即便被 XSS 也拿不到。
 */
export interface LlmCallOptions {
  /**
   * 渲染层传来的非敏感配置。
   *
   * ⚠️ `undefined` 的语义是「**用户从没配置过**」（`llmSetupState` 的
   * `never-configured`），刻意与「配了但 `enabled: false`」分开：
   * 前者要**引导去配置**（`generate()` 抛 `notConfigured`），
   * 后者只需一句纯提示（`validateLlmConfig` 报 `disabled`）。
   */
  config?: StoredLlmConfig
  /** 主进程从 safeStorage 解密出的 Key；缺省空串 */
  apiKey?: string
  /**
   * 调用方取消信号（来自 `task:cancel` 的登记表）。
   *
   * 与内置的生成超时**叠加**（`AbortSignal.any`）：任一方触发都会中断在途请求。
   * 两者语义不同 —— 超时是失败兜底（`TimeoutError`，报「请求超时，可重试」），
   * 取消是用户意图（`AbortError`，报 `TASK_CANCELLED_MESSAGE`，面板按「已停止」展示）。
   */
  signal?: AbortSignal
}

/** 某 provider 是否走 OpenAI 兼容协议 */
function isOpenAiCompatible(provider: LlmProvider): boolean {
  return provider !== 'ollama' && provider !== 'claude'
}

/**
 * `AbortSignal.timeout()` 触发的拒绝叫 `TimeoutError`，**不是** `AbortError`
 * （后者是主动 abort）。两者要分开：超时要提示「已中断、可重试」，
 * 主动取消则应当原样上抛给调用方处理。
 */
function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

/**
 * 把「调用方取消信号」与「内置生成超时」合成一个信号。
 * 任一方触发都会中断在途请求；二者的错误类型不同（`AbortError` / `TimeoutError`），
 * 由各分支的 catch 分开翻译。
 */
function withDeadline(caller: AbortSignal | undefined): AbortSignal {
  const deadline = AbortSignal.timeout(LLM_GENERATE_TIMEOUT_MS)
  return caller === undefined ? deadline : AbortSignal.any([deadline, caller])
}

/** 超时错误（失败兜底语义） */
function timeoutError(label: string): Error {
  return new Error(
    `${label} 请求超时（${Math.round(LLM_GENERATE_TIMEOUT_MS / 1000)} 秒未返回）：已中断本次请求，` +
      '请重试；若持续超时请检查网络或改用更快的模型'
  )
}

/** 用户配置的停止词（换行分隔）→ 各服务商接受的字符串数组 */
function stopSequences(config: LlmRuntimeConfig): string[] {
  return config.stopWords
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/** 用户主动取消（不是故障：面板按「已停止」展示，不该弹错误） */
function cancelledError(cause: unknown): Error {
  return new Error(TASK_CANCELLED_MESSAGE, { cause })
}

export class LlmClient {
  /** 探测服务与模型可用性（不抛错，供状态提示用） */
  async status(options: LlmCallOptions = {}): Promise<LlmStatus> {
    const config = resolveConfig(options)
    const preset = LLM_PROVIDER_PRESETS[config.provider]

    if (config.provider === 'claude') {
      return {
        available: false,
        models: [...preset.models],
        provider: 'claude',
        message: LLM_MESSAGES.claudeUnsupported
      }
    }

    if (isOpenAiCompatible(config.provider)) {
      return {
        available: config.enabled,
        models: [...preset.models],
        provider: config.provider,
        model: config.model,
        message: config.enabled
          ? `${preset.label} 已启用（模型 ${config.model === '' ? '未选择' : config.model}）`
          : LLM_MESSAGES.cloudDisabled(preset.label)
      }
    }

    // Ollama：探测逻辑与迁移前一致；中文文案统一取自 `LLM_MESSAGES`（唯一落点，防漂移）
    const host = toOllamaHost(config.baseUrl)
    try {
      /*
       * 改前这里用 `ollama` SDK 的 `client.list()`。换成 `fetch` 的理由有两个：
       * ① SDK 不接受 `AbortSignal`，探活/生成都**没有任何超时**（设置面板会一直转圈）；
       * ② 生成分支也一并换成 `fetch` 后，本文件不再依赖 SDK，HTTP 语义只有一套。
       * 端点与 SDK 等价：`GET /api/tags` → `{ models: [{ name }] }`。
       */
      const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = (await res.json()) as { models?: Array<{ name?: string }> }
      const models = (payload.models ?? [])
        .map((item) => item.name ?? '')
        .filter((name) => name !== '')
        .sort()
      if (models.length === 0) {
        return {
          available: false,
          models,
          provider: 'ollama',
          message: LLM_MESSAGES.ollamaNoModel
        }
      }
      return {
        available: true,
        models,
        provider: 'ollama',
        model: config.model || models[0],
        message: `本地模型 ${models.length} 个`
      }
    } catch {
      return {
        available: false,
        models: [],
        provider: 'ollama',
        message: LLM_MESSAGES.ollamaNotRunning(host)
      }
    }
  }

  /** 真实连通性探测（E63，对齐 Python `api_config.py` 的「测试连接」）。
   *  不抛错：成功/失败都返回 `{ ok, message }` 供 UI 直接展示。 */
  async testConnection(options: LlmCallOptions = {}): Promise<{ ok: boolean; message: string }> {
    const config = resolveConfig(options)
    if (options.config === undefined) {
      return { ok: false, message: LLM_MESSAGES.notConfigured }
    }
    if (config.provider === 'claude') {
      return { ok: false, message: LLM_MESSAGES.claudeUnsupported }
    }
    if (isOpenAiCompatible(config.provider)) {
      const preset = LLM_PROVIDER_PRESETS[config.provider]
      const baseUrl = resolveLlmBaseUrl(config).replace(/\/+$/, '')
      try {
        const res = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          // 探活等的是模型列表：快失败才有用（与生成用的 LLM_GENERATE_TIMEOUT_MS 分开）
          signal: AbortSignal.timeout(LLM_REQUEST_TIMEOUT_MS)
        })
        if (!res.ok) {
          return { ok: false, message: `${preset.label} 连接失败（HTTP ${res.status}）` }
        }
        return { ok: true, message: `${preset.label} 连接成功，服务可达` }
      } catch (error) {
        // 探活超时单独说清楚：让用户知道是「服务端没在 30 秒内应答」，而不是地址写错
        if (isTimeoutError(error)) {
          return {
            ok: false,
            message: `${preset.label} 连接超时（${Math.round(LLM_REQUEST_TIMEOUT_MS / 1000)} 秒未响应）：请检查网络或改用其他服务商`
          }
        }
        return {
          ok: false,
          message: `无法连接 ${preset.label}（${baseUrl}）：${error instanceof Error ? error.message : String(error)}`
        }
      }
    }
    // Ollama：status() 内部已对 /api/tags（list）做真实 ping
    const status = await this.status(options)
    return { ok: status.available, message: status.message }
  }

  /** 调用 LLM 生成文本；失败抛中文错误（UI 直接展示） */
  async generate(
    system: string,
    prompt: string,
    options: LlmCallOptions = {}
  ): Promise<{ model: string; content: string; usage?: LlmUsage }> {
    const config = resolveConfig(options)
    /*
     * 未配置闸（M0 / DD-0，**必须排在 status() 与任何 fetch 之前**）。
     *
     * ## 为什么要有这道闸（fail-closed 的物理保证）
     * `resolveConfig` 在 `config === undefined` 时回落 `DEFAULT_LLM_CONFIG`
     * （`enabled: false`），而 `validateLlmConfig` 会报 `disabled`（「未启用 API」）。
     * 但那句话说错了 —— 用户**从来没配过**，说「你什么时候启用的」是错的，
     * 也没告诉他现在该做什么。所以这里前置一道更贴切的闸：抛 `notConfigured`，
     * 文案里直接给出两条路（配云端 / 一键保密）。
     *
     * ## 为什么不靠 `validateLlmConfig` 一处兜住
     * 因为 `enabled: false` 有两种成因（从没配过 / 主动关了），**处理方式不同**：
     * 前者要引导、后者只需一句提示。合并成一个错误就必然对其中一半用户说错话。
     * 判据刻意用 `options.config === undefined`（渲染层推没推配置），
     * **不是**「provider 是不是 ollama」—— 后者会把「主动选了本地但没填配置」也误判成未配置。
     *
     * ## ⚠️ 本闸的正确性**依赖渲染层的一个约定**（跨层耦合，改动前先读这段）
     * 「`config === undefined`」要成立，前提是**渲染层只在用户真的配过时才推镜像**。
     * 该约定**已落地**：`renderer/src/llmBootstrap.ts::pushLlmConfigMirror()`（`:44`）
     * 有 `if (!hasStoredLlmConfig()) return Promise.resolve()` 守卫。
     *
     * 若那道守卫被删、改回无条件 `configure({ config: loadLlmConfig() })`：
     * `loadLlmConfig()` 永不返回 `undefined`（键缺失时给 `DEFAULT_LLM_CONFIG`），
     * ⇒ `llmConfigMirror` 启动后恒非 null ⇒ **本闸永久不可达、退化成死代码** ⇒
     * 新装用户收到 `LLM_MESSAGES.disabled`（「未启用 API」）—— 那正是
     * 「从没配过却被告知你禁用了 API」，与本段存在的理由相反。
     * 两端（`llmBootstrap.ts:18-34` 与此处）都写了这个耦合，改任一侧请同步另一侧。
     *
     * 本层**无法自行补救**：`undefined` 是「没有配置可判」的唯一载体，
     * 补上就得改 IPC 形状（在 `shared/schemas.ts` 加字段），代价远大于收益。
     * 故此处只做两件事：把依赖写明（后人不会误删本闸），并用单测锁死
     * 「`config === undefined` ⇒ `notConfigured` 且不发任何请求」
     * （见 `tests/unit/llmClient.test.ts` 的「未配置闸所依赖的跨层前提」组）。
     */
    if (options.config === undefined) throw new Error(LLM_MESSAGES.notConfigured)
    const invalid = validateLlmConfig(config)
    if (invalid !== null) throw new Error(invalid)

    if (config.provider === 'claude') {
      throw new Error(LLM_MESSAGES.claudeUnsupported)
    }

    // 进程级限流：所有出站 LLM 调用（OpenAI 兼容 / Ollama）统一在此取令牌，
    // 对齐 Python `common/rate_limiter.py` 的 `_acquire_rate_limit('llm', ...)`（E61）。
    // 放在校验闸门与 claude 拦截之后 —— 不为「未配置 / 非法 / claude 不支持」的请求浪费令牌。
    await sharedRateLimiter().acquire('llm')

    // 取消信号与内置生成超时叠加：任一方触发都中断在途请求（二者错误语义不同，见 catch）
    const signal = withDeadline(options.signal)

    if (isOpenAiCompatible(config.provider)) {
      return this.generateOpenAiCompatible(config, system, prompt, signal)
    }

    const status = await this.status(options)
    if (!status.available) {
      throw new Error(status.message)
    }
    const preferred = config.model.trim() !== '' ? config.model : (process.env['MB_OLLAMA_MODEL'] ?? '')
    // 无 `?? ''` 兜底：`status.available === true` 蕴含 `models.length > 0`（见 status 的两个分支），
    // 所以 `status.models[0]` 一定存在；`noUncheckedIndexedAccess` 未开，类型就是 `string`。
    const model = preferred !== '' ? preferred : status.models[0]
    return this.generateOllama(config, model, system, prompt, signal)
  }

  /**
   * 本地 Ollama 生成（`POST /api/generate`，非流式）。
   *
   * 改前用 `ollama` SDK：它不接受 `AbortSignal` ⇒ 本地档既没有超时、也无法被「停止」打断，
   * 与云端行为不对称（用户点了停止只有云端会停）。换成 `fetch` 后两条路径共享同一套
   * 取消 / 超时 / 错误归一逻辑。
   */
  private async generateOllama(
    config: LlmRuntimeConfig,
    model: string,
    system: string,
    prompt: string,
    signal: AbortSignal
  ): Promise<{ model: string; content: string; usage?: LlmUsage }> {
    const host = toOllamaHost(config.baseUrl)
    const stop = stopSequences(config)
    let response: Response
    try {
      response = await fetch(`${host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          system,
          prompt,
          stream: false,
          options: {
            temperature: config.temperature,
            // 停止词（改前只存不发，设置里的这一项等于没接线）
            ...(stop.length > 0 ? { stop } : {})
          }
        }),
        signal
      })
    } catch (error) {
      if (isTimeoutError(error)) throw timeoutError('本地 Ollama')
      if (isAbortError(error)) throw cancelledError(error)
      // 连不上 = 本地服务没起；与 `agentTransport` 共用同一文案常量，两处不漂移
      throw new Error(LLM_MESSAGES.ollamaNotRunning(host), { cause: error })
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const trimmed = detail.trim().replace(/\s+/g, ' ')
      throw new Error(
        trimmed === ''
          ? `AI 调用失败（HTTP ${response.status}）`
          : `AI 调用失败（HTTP ${response.status}）：${trimmed.slice(0, 120)}`
      )
    }

    const payload = (await response.json()) as {
      response?: string
      prompt_eval_count?: number
      eval_count?: number
    }
    const content = payload.response ?? ''
    if (content === '') {
      throw new Error('本地模型返回了空内容（可能模型名不正确或上下文被截断）')
    }
    const promptTokens = payload.prompt_eval_count ?? 0
    const completionTokens = payload.eval_count ?? 0
    return {
      model,
      content,
      usage:
        promptTokens > 0 || completionTokens > 0
          ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
          : undefined
    }
  }

  /** OpenAI 兼容协议（OpenAI / 豆包 / Qwen / DeepSeek） */
  private async generateOpenAiCompatible(
    config: LlmRuntimeConfig,
    system: string,
    prompt: string,
    signal: AbortSignal
  ): Promise<{ model: string; content: string; usage?: LlmUsage }> {
    const preset = LLM_PROVIDER_PRESETS[config.provider]
    if (config.model.trim() === '') {
      throw new Error(`请先为「${preset.label}」选择或填写模型`)
    }
    const baseUrl = resolveLlmBaseUrl(config).replace(/\/+$/, '')
    const url = `${baseUrl}/chat/completions`
    const stop = stopSequences(config)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        /*
         * 取消（`task:cancel`）与生成超时叠加后的信号。二者的错误语义不同，见下方 catch：
         * 超时是失败兜底，取消是用户意图 —— 混成一句话会让「我点了停止」显示成故障。
         */
        signal,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: false,
          // 停止词（改前只存不发，设置里这一项等于没接线）
          ...(stop.length > 0 ? { stop } : {})
        })
      })
    } catch (error) {
      // 超时 ≠ 连不上 ≠ 用户取消：三者文案必须分开，否则用户会去查网络或以为出了故障
      if (isTimeoutError(error)) throw timeoutError(preset.label)
      if (isAbortError(error)) throw cancelledError(error)
      throw new Error(`无法连接 ${preset.label}（${url}）：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`${preset.label} 调用失败（HTTP ${response.status}）：${detail.slice(0, 120)}`)
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const content = payload.choices?.[0]?.message?.content ?? ''
    if (content === '') {
      throw new Error(`${preset.label} 返回了空内容（可能被内容策略拦截或模型名不正确）`)
    }
    const u = payload.usage
    const usage: LlmUsage | undefined =
      u && (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0) > 0
        ? {
            promptTokens: u.prompt_tokens ?? 0,
            completionTokens: u.completion_tokens ?? 0,
            totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0)
          }
        : undefined
    return { model: config.model, content, usage }
  }
}
