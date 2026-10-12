import { Ollama } from 'ollama'

import {
  DEFAULT_LLM_CONFIG,
  effectiveProvider,
  LLM_MESSAGES,
  LLM_PROVIDER_PRESETS,
  resolveLlmBaseUrl,
  validateLlmConfig,
  type LlmProvider,
  type LlmUsage,
  type StoredLlmConfig
} from '../../shared/config/llmConfig'

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
}

/** 某 provider 是否走 OpenAI 兼容协议 */
function isOpenAiCompatible(provider: LlmProvider): boolean {
  return provider !== 'ollama' && provider !== 'claude'
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
      const client = new Ollama({ host })
      const list = await client.list()
      const models = list.models.map((model) => model.name).sort()
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

    if (isOpenAiCompatible(config.provider)) {
      return this.generateOpenAiCompatible(config, system, prompt)
    }

    const status = await this.status(options)
    if (!status.available) {
      throw new Error(status.message)
    }
    const preferred = config.model.trim() !== '' ? config.model : (process.env['MB_OLLAMA_MODEL'] ?? '')
    // 无 `?? ''` 兜底：`status.available === true` 蕴含 `models.length > 0`（见 status 的两个分支），
    // 所以 `status.models[0]` 一定存在；`noUncheckedIndexedAccess` 未开，类型就是 `string`。
    const model = preferred !== '' ? preferred : status.models[0]
    try {
      const client = new Ollama({ host: toOllamaHost(config.baseUrl) })
      const response = await client.generate({
        model,
        system,
        prompt,
        options: { temperature: config.temperature }
      })
      // Ollama 在 generate 响应上带 token 计数（`prompt_eval_count` / `eval_count`），
      // 但 SDK 的 TS 类型未暴露 ⇒ 取下钻后的字段（v0.6 M5）。
      const counts = response as unknown as { prompt_eval_count?: number; eval_count?: number }
      const promptTokens = counts.prompt_eval_count ?? 0
      const completionTokens = counts.eval_count ?? 0
      return {
        model,
        content: response.response ?? '',
        usage:
          promptTokens > 0 || completionTokens > 0
            ? { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
            : undefined
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`AI 调用失败：${detail.slice(0, 120)}`, { cause: error })
    }
  }

  /** OpenAI 兼容协议（OpenAI / 豆包 / Qwen / DeepSeek） */
  private async generateOpenAiCompatible(
    config: LlmRuntimeConfig,
    system: string,
    prompt: string
  ): Promise<{ model: string; content: string; usage?: LlmUsage }> {
    const preset = LLM_PROVIDER_PRESETS[config.provider]
    if (config.model.trim() === '') {
      throw new Error(`请先为「${preset.label}」选择或填写模型`)
    }
    const baseUrl = resolveLlmBaseUrl(config).replace(/\/+$/, '')
    const url = `${baseUrl}/chat/completions`

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: false
        })
      })
    } catch (error) {
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
