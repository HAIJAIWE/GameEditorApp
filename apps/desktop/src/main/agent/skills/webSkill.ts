/**
 * `system.web_fetch` 内置技能（对齐 dsh `web-fetch-http` 的可用子集）。
 *
 * 让智能体**抓取网页正文**（查文档、查报错、查参考）。用 Node 全局 `fetch`，不引额外依赖。
 *
 * 安全取向：
 * - 风险 `NETWORK`（`TOOL_RISK_MAP['system.web_fetch']`）⇒ 走审批门。
 * - **SSRF 防护**：默认拒绝内网/本机地址（localhost、127/10/192.168、172.16-31、169.254、::1、.local），
 *   防止被诱导访问本机服务；测试可传 `allowPrivateHosts` 放开。
 * - 只支持 http/https；超时 + 响应体上限，避免挂死/撑爆上下文。
 * - HTML 默认剥成纯文本（去 script/style、解实体、压空白）；`raw: true` 才回原始 HTML。
 *
 * 说明：**搜索**需要外部 provider（API key），本版本不做；只做抓取。
 */

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** 默认超时（毫秒） */
export const WEB_FETCH_DEFAULT_TIMEOUT_MS = 15_000
/** 超时上限（毫秒） */
export const WEB_FETCH_MAX_TIMEOUT_MS = 60_000
/** 响应体读取上限（字节） */
export const WEB_FETCH_MAX_BYTES = 2_000_000
/** 回灌给模型的文本上限（字符） */
export const WEB_FETCH_MAX_CHARS = 200_000

export interface WebSkillOptions {
  /** 允许访问内网/本机地址（仅测试用；生产保持 false） */
  allowPrivateHosts?: boolean
  /** 注入 fetch（测试可替换）；缺省用全局 fetch */
  fetchImpl?: typeof fetch
}

const PRIVATE_PATTERNS: readonly RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/i,
  /^\[::1\]$/i,
  /\.local$/i,
  /\.localhost$/i
]

/** 判断主机名是否内网/本机（SSRF 防护） */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (PRIVATE_PATTERNS.some((pattern) => pattern.test(host))) return true
  const m = /^172\.(\d+)\./.exec(host)
  if (m !== null) {
    const second = Number(m[1])
    if (second >= 16 && second <= 31) return true
  }
  return false
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
}

/** HTML → 纯文本：去 script/style/注释、标签换空白、解常见实体、压空白 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+/g, ' ')
    .trim()
}

function clampTimeout(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return WEB_FETCH_DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(value), WEB_FETCH_MAX_TIMEOUT_MS)
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `web_fetch 失败：${message}`, error }
}

export function createWebSkill(options: WebSkillOptions = {}): SkillProtocol {
  const allowPrivate = options.allowPrivateHosts === true
  const doFetch = options.fetchImpl ?? fetch

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'fetch') {
      return fail(`未知 action: ${action}（当前仅支持 fetch；搜索需外部 provider）`, SKILL_ERRORS.BAD_ACTION)
    }
    const rawUrl = typeof params.url === 'string' ? params.url.trim() : ''
    if (rawUrl === '') return fail('缺少 url 参数', SKILL_ERRORS.BAD_ARG)

    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      return fail(`非法 URL：${rawUrl}`, SKILL_ERRORS.BAD_URL)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return fail(`只支持 http/https（收到 ${url.protocol}）`, SKILL_ERRORS.BAD_PROTOCOL)
    }
    if (!allowPrivate && isPrivateHost(url.hostname)) {
      return fail(`拒绝访问内网/本机地址：${url.hostname}（SSRF 防护）`, SKILL_ERRORS.BLOCKED)
    }

    const timeoutMs = clampTimeout(params.timeout_ms)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await doFetch(url.toString(), {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': 'mb-agent/1.0 (+desktop)' }
      })
      if (!response.ok) {
        return fail(`HTTP ${response.status} ${response.statusText}`.trim(), SKILL_ERRORS.HTTP)
      }
      const contentType = response.headers.get('content-type') ?? ''
      const buffer = Buffer.from(await response.arrayBuffer())
      const truncated = buffer.byteLength > WEB_FETCH_MAX_BYTES
      const body = buffer.subarray(0, WEB_FETCH_MAX_BYTES).toString('utf8')
      const isHtml = /text\/html|application\/xhtml/i.test(contentType)
      const raw = params.raw === true
      let text = isHtml && !raw ? htmlToText(body) : body
      let capped = false
      if (text.length > WEB_FETCH_MAX_CHARS) {
        text = text.slice(0, WEB_FETCH_MAX_CHARS)
        capped = true
      }
      const notes: string[] = []
      if (truncated) notes.push(`响应体截断到 ${WEB_FETCH_MAX_BYTES} 字节`)
      if (capped) notes.push(`文本截断到 ${WEB_FETCH_MAX_CHARS} 字符`)
      return {
        success: true,
        message: notes.length > 0 ? `${text}\n\n（${notes.join('；')}）` : text,
        data: { url: url.toString(), status: response.status, contentType, chars: text.length }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (controller.signal.aborted) return fail(`请求超时（${timeoutMs}ms）`, SKILL_ERRORS.TIMEOUT)
      return fail(message, SKILL_ERRORS.FETCH)
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    id: 'system.web_fetch',
    description:
      '抓取网页正文（查文档/报错/参考）。默认把 HTML 剥成纯文本；raw=true 回原始 HTML。'
      + '仅支持 http/https，拒绝内网/本机地址；有超时与体积上限。搜索需外部 provider（本版不支持）。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['fetch'], description: '操作类型: fetch=抓取' },
        url: { type: 'string', description: '要抓取的 http/https URL' },
        raw: { type: 'boolean', description: 'true 时返回原始 HTML（默认剥成纯文本）' },
        timeout_ms: { type: 'integer', description: `超时毫秒（默认 ${WEB_FETCH_DEFAULT_TIMEOUT_MS}）` }
      },
      required: ['action', 'url']
    },
    tags: ['system', 'web'],
    execute: run
  }
}
