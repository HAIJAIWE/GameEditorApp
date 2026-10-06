import { Ollama } from 'ollama'

import {
  DEFAULT_LLM_CONFIG,
  LLM_PROVIDER_PRESETS,
  resolveLlmBaseUrl,
  validateLlmConfig,
  type LlmProvider,
  type StoredLlmConfig
} from '../../shared/llmConfig'

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
 * ## 兼容性（不回归）
 * - 未配置（`enabled=false`）时，`status()` 仍按原逻辑探测本地 Ollama，
 *   `generate()` 仍报原来那句中文提示 —— 迁移前 E2E 依赖这些文案。
 * - 环境变量 `MB_OLLAMA_HOST` / `MB_OLLAMA_MODEL` 仍是 Ollama 的**兜底**，
 *   优先级：设置面板 > 环境变量 > 默认值。
 */

export interface LlmStatus {
  available: boolean
  models: string[]
  message: string
  /** 当前生效的服务商（未配置时回落 ollama） */
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

/** 未传入配置时的回落值（保持迁移前「只探 Ollama」的行为） */
const DEFAULT_STORED_CONFIG: StoredLlmConfig = { ...DEFAULT_LLM_CONFIG, enabled: true }

/** 合并「本次调用」的配置：调用方传入优先，缺失回落默认（+ Ollama 的环境变量兜底） */
function resolveConfig(options: LlmCallOptions): LlmRuntimeConfig {
  const stored = options.config ?? DEFAULT_STORED_CONFIG
  return {
    ...stored,
    apiKey: options.apiKey ?? '',
    /*
     * Ollama 主机：设置面板的 baseUrl 优先；它是 `http://host:11434/v1` 形态，
     * 而 ollama SDK 要的是 `http://host:11434`（不含 /v1）⇒ 这里剥掉尾部 /v1。
     * 环境变量兜底保留（迁移前的既有行为）。
     */
    baseUrl:
      stored.provider === 'ollama' && stored.baseUrl.trim() === ''
        ? (process.env['MB_OLLAMA_HOST'] ?? '')
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
  /** 渲染层传来的非敏感配置；缺省时按「未启用 Ollama」处理（保持迁移前行为） */
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
        message: 'Claude（Anthropic）走的是 Anthropic Messages API，与 OpenAI 协议不兼容，本版暂未接入'
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
          : `未启用 API，请先在设置中勾选「启用 API」并填写 ${preset.label} 的 API Key`
      }
    }

    // Ollama：保持原有探测逻辑与中文文案（迁移前 E2E 依赖）
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
          message: '未检测到本地模型，请先执行 ollama pull（如 ollama pull qwen3:8b）后重试'
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
        message: `未检测到本地 Ollama 服务，请先启动（ollama serve，地址 ${host}）后重试`
      }
    }
  }

  /** 调用 LLM 生成文本；失败抛中文错误（UI 直接展示） */
  async generate(
    system: string,
    prompt: string,
    options: LlmCallOptions = {}
  ): Promise<{ model: string; content: string }> {
    const config = resolveConfig(options)
    const invalid = validateLlmConfig(config)
    if (invalid !== null) throw new Error(invalid)

    if (config.provider === 'claude') {
      throw new Error('Claude（Anthropic）暂未接入，请改用 OpenAI / 豆包 / Qwen / DeepSeek 或 Ollama')
    }

    if (isOpenAiCompatible(config.provider)) {
      return this.generateOpenAiCompatible(config, system, prompt)
    }

    const status = await this.status(options)
    if (!status.available) {
      throw new Error(status.message)
    }
    const preferred = config.model.trim() !== '' ? config.model : (process.env['MB_OLLAMA_MODEL'] ?? '')
    const model = preferred !== '' ? preferred : status.models[0]
    if (!model) {
      throw new Error('未检测到可用模型，请先 ollama pull 拉取模型')
    }
    try {
      const client = new Ollama({ host: toOllamaHost(config.baseUrl) })
      const response = await client.generate({
        model,
        system,
        prompt,
        options: { temperature: config.temperature }
      })
      return { model, content: response.response ?? '' }
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
  ): Promise<{ model: string; content: string }> {
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
    }
    const content = payload.choices?.[0]?.message?.content ?? ''
    if (content === '') {
      throw new Error(`${preset.label} 返回了空内容（可能被内容策略拦截或模型名不正确）`)
    }
    return { model: config.model, content }
  }
}
