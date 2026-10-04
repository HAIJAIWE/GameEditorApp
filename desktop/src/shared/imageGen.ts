/**
 * imageGen.ts
 *
 * 图像生成（文生图）纯逻辑层。
 *
 * 本模块从 Python 源 `src/common/ai_client.py` 的 `generate_image(config, prompt)`
 * 移植而来，仅保留可单测的纯函数部分（配置解析、请求构造、响应解析）。
 * 实际的 HTTP 请求 / 限流 / 持久化由主代理的 IPC 接线负责。
 *
 * 严格对齐 Python 行为：
 * - 前置校验：未启用 / 未设置 API Key
 * - image 维度覆盖优先（model / apiKey / baseUrl）
 * - 各 provider 的请求体形状与响应解析路径
 */

export type ImageProvider = 'openai' | 'qwen' | 'doubao' | 'generic'

export interface ImageGenConfig {
  enabled: boolean
  provider: ImageProvider
  apiKey: string
  /** generic provider 用：自定义 base_url（不含 /images/generations 后缀） */
  baseUrl?: string
  /** 默认模型（豆包/generic 回退用） */
  model?: string
  /** 维度覆盖：仅取 image 维度 */
  modelOverrides?: { image?: { model?: string; apiKey?: string; baseUrl?: string } }
}

export interface ImageGenRequest {
  url: string
  headers: Record<string, string>
  body: unknown
}

export type ImageGenPrecheck =
  | { ok: true }
  | { ok: false; error: string }

/**
 * 前置校验：对齐 Python 的 `!config.enabled` 与 `!config.api_key` 检查。
 * api_key 取 image 维度覆盖优先（与 resolveImageConfig 一致）。
 */
export function checkImageConfig(config: ImageGenConfig): ImageGenPrecheck {
  if (!config.enabled) {
    return { ok: false, error: 'API未启用' }
  }
  const { apiKey } = resolveImageConfig(config)
  if (!apiKey) {
    return { ok: false, error: '未设置API Key' }
  }
  return { ok: true }
}

/**
 * 解析最终生效的 provider / apiKey / baseUrl / model。
 * 对齐 Python 的 `_resolve_model_overrides(config, "image")`：
 * image 维度覆盖优先于配置顶层字段。
 */
export function resolveImageConfig(config: ImageGenConfig): {
  provider: ImageProvider
  apiKey: string
  baseUrl: string
  model: string
} {
  const ov = config.modelOverrides?.image ?? {}
  const apiKey = ov.apiKey ?? config.apiKey
  const baseUrl = ov.baseUrl ?? config.baseUrl ?? ''
  const model = ov.model ?? config.model ?? ''
  return {
    provider: config.provider,
    apiKey,
    baseUrl,
    model
  }
}

/**
 * 构造文生图请求。
 * 返回 `{ error: string }`（前置不过 / 不支持的 provider）或 `ImageGenRequest`。
 */
export function buildImageRequest(
  config: ImageGenConfig,
  prompt: string
): ImageGenRequest | { error: string } {
  const precheck = checkImageConfig(config)
  if (!precheck.ok) {
    return { error: precheck.error }
  }

  const { provider, apiKey, baseUrl, model } = resolveImageConfig(config)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }

  switch (provider) {
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/images/generations',
        headers,
        body: {
          model: model || 'dall-e-3',
          prompt,
          n: 1,
          size: '1024x1024'
        }
      }
    case 'qwen':
      return {
        url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation',
        headers,
        body: {
          model: model || 'qwen-vl',
          input: { prompt },
          parameters: { size: '1024x1024' }
        }
      }
    case 'doubao':
      return {
        url: 'https://ark.cn-beijing.volces.com/api/v1/images/generations',
        headers,
        body: {
          model: model || config.model || '',
          prompt,
          n: 1,
          size: '1024x1024'
        }
      }
    case 'generic':
      if (!model || !baseUrl) {
        return { error: '不支持的provider: ' + provider }
      }
      return {
        url: baseUrl.replace(/\/+$/, '') + '/images/generations',
        headers,
        body: {
          model,
          prompt,
          n: 1,
          size: '1024x1024'
        }
      }
    default:
      return { error: '不支持的provider: ' + provider }
  }
}

/**
 * 从响应 JSON 中提取图像 URL。
 * 对齐各 provider 的响应结构：
 * - openai / doubao / generic：`data[0].url`（其次 `data[0].b64_json`）
 * - qwen(dashscope)：`output.results[0].url`
 *
 * 任何形状异常 / 缺字段都返回 null（不抛）。
 */
export function extractImageUrl(
  responseJson: unknown,
  provider: ImageProvider
): string | null {
  try {
    if (provider === 'qwen') {
      const arr = (responseJson as { output?: { results?: unknown[] } })?.output?.results
      if (Array.isArray(arr) && arr[0]) {
        const item = arr[0] as { url?: string }
        return item.url ?? null
      }
      return null
    }

    // openai / doubao / generic 共用 OpenAI 形状
    const arr = (responseJson as { data?: unknown[] })?.data
    if (Array.isArray(arr) && arr[0]) {
      const item = arr[0] as { url?: string; b64_json?: string }
      return item.url ?? item.b64_json ?? null
    }
    return null
  } catch {
    return null
  }
}
