import { buildImageRequest, checkImageConfig, extractImageUrl } from '../../shared/config/imageGen'
import type { ImageGenConfig } from '../../shared/config/imageGen'

/**
 * 图像生成主进程客户端（云 API 调用侧）。
 *
 * 移植自 旧版 `common/ai_client::generate_image` 的**请求发送与重试**部分
 * （请求构造/响应解析在 `shared/imageGen.ts`，此处只负责网络 I/O）。
 *
 * 与 旧版 的对应：
 * - `_request_with_retry(..., max_retries=2)` → `requestWithRetry`（同样最多重试 2 次，共 3 次尝试）
 * - `_acquire_rate_limit("image_gen", timeout=60)` → `acquireImageRateLimit`（**进程内近似**）
 *
 * 有意偏离：
 * - 旧版 用跨模块 `RateLimiter`（`common/rate_limiter`，token bucket，image_gen 桶
 *   rate=0.5/burst=2）；TS 侧无共享限流器，这里用**模块级最小间隔**近似（2s ≈ 0.5 QPS）。
 *   Electron 主进程单实例，该近似足够，且不引入跨模块耦合。
 */

export type ImageGenOutcome = { ok: true; url: string } | { ok: false; error: string }

/** 最小请求间隔（ms），对齐 旧版 image_gen 桶 rate=0.5/s */
const MIN_INTERVAL_MS = 2000
/** 最多重试次数→ 共 3 次尝试 */
const MAX_RETRIES = 2
/** 退避基数（ms）：第 n 次重试等待 BASE * 2^n */
const BACKOFF_BASE_MS = 500

let lastRequestAt = 0

/**
 * 进程内限流：保证两次生图请求间隔不小于 {@link MIN_INTERVAL_MS}。
 * 对齐 旧版 `_acquire_rate_limit("image_gen")` 的保护意图（防频繁请求被上游限流/计费）。
 */
export async function acquireImageRateLimit(): Promise<void> {
  const now = Date.now()
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now)
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  lastRequestAt = Date.now()
}

/** 仅供测试：重置限流状态，避免用例间互相等待 */
export function resetImageRateLimitForTest(): void {
  lastRequestAt = 0
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface RequestOptions {
  signal?: AbortSignal
}

/**
 * 带重试的 POST。任一次尝试成功（2xx）即返回该 Response；
 * 网络异常或非 2xx 时按指数退避重试，耗尽后抛出最后一次错误。
 *
 * 注意：非 2xx 不在此处抛错（交给调用方统一转成中文提示），
 * 只有**网络层异常**才重试 —— 对齐 旧版 只对异常重试的行为。
 */
async function requestWithRetry(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  opts: RequestOptions
): Promise<Response> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: opts.signal
      })
      if (response.ok) {
        return response
      }
      // 非 2xx：不重试，直接把响应交给调用方
      return response
    } catch (err) {
      // 调用方主动取消时不再重试
      if (err instanceof Error && err.name === 'AbortError') {
        throw err
      }
      lastError = err
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_BASE_MS * 2 ** attempt)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * 调用云端图像生成 API，返回图片 URL（不落盘；落盘见 `save.ts`）。
 *
 * 前置校验、请求构造、响应解析全部委托 `shared/imageGen.ts`（纯逻辑、可单测）。
 */
export async function generateImage(
  config: ImageGenConfig,
  prompt: string,
  opts: RequestOptions = {}
): Promise<ImageGenOutcome> {
  const pre = checkImageConfig(config)
  if (!pre.ok) {
    return { ok: false, error: pre.error }
  }

  const request = buildImageRequest(config, prompt)
  if ('error' in request) {
    return { ok: false, error: request.error }
  }

  await acquireImageRateLimit()

  let response: Response
  try {
    response = await requestWithRetry(request.url, request.headers, request.body, opts)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `图像生成网络错误: ${message}` }
  }

  if (!response.ok) {
    return { ok: false, error: `图像生成请求失败（HTTP ${response.status}）` }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `解析图像生成响应失败: ${message}` }
  }

  const url = extractImageUrl(payload, config.provider)
  if (url === null) {
    return { ok: false, error: '响应中未找到图像地址' }
  }
  return { ok: true, url }
}
