/**
 * `system.web_search` 内置技能（对齐 dsh `web-search-*` 的**免 key** 子集）：
 * 抓 DuckDuckGo HTML 结果页并解析标题/链接/摘要。
 *
 * 为什么用 DuckDuckGo HTML：**不需要 API key**，`html.duckduckgo.com/html/?q=` 返回
 * 稳定的结果标记（`result__a` / `result__snippet`），适合桌面端开箱即用。
 * 需要更稳的结果时，可用 `searchEndpoint` 指向自建/商业 provider（测试亦用它指向本地 server）。
 *
 * 安全：固定外部 host（SSRF 面小）；风险 NETWORK（审批）；超时 + 结果条数上限。
 */

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { htmlToText } from './webSkill'

/** 默认搜索入口 */
export const DEFAULT_SEARCH_ENDPOINT = 'https://html.duckduckgo.com/html/'
/** 默认超时（毫秒） */
export const WEB_SEARCH_DEFAULT_TIMEOUT_MS = 15_000
/** 默认结果条数 */
export const WEB_SEARCH_DEFAULT_LIMIT = 5
/** 结果条数上限 */
export const WEB_SEARCH_MAX_LIMIT = 10

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchSkillOptions {
  /** 搜索入口（默认 DuckDuckGo HTML；测试可指向本地 server） */
  searchEndpoint?: string
  /** 注入 fetch（测试可替换） */
  fetchImpl?: typeof fetch
}

/** 解码 DuckDuckGo 的跳转链接（`//duckduckgo.com/l/?uddg=<encoded>` → 真实 URL） */
export function decodeDdgUrl(href: string): string {
  let url = href.trim()
  if (url.startsWith('//')) url = `https:${url}`
  try {
    const parsed = new URL(url)
    const target = parsed.searchParams.get('uddg')
    if (target !== null && target !== '') return target
    return parsed.toString()
  } catch {
    return href.trim()
  }
}

/** 解析 DuckDuckGo HTML 结果页（属性顺序无关；标题/摘要用 htmlToText 清洗） */
export function parseDuckDuckGoHtml(html: string, limit: number): WebSearchResult[] {
  const links: Array<{ url: string; title: string }> = []
  const snippets: string[] = []
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = anchorRe.exec(html)) !== null) {
    const attrs = match[1] ?? ''
    const inner = match[2] ?? ''
    if (/class="[^"]*result__a[^"]*"/i.test(attrs)) {
      const href = /href="([^"]*)"/i.exec(attrs)?.[1] ?? ''
      const title = htmlToText(inner)
      if (title !== '') links.push({ url: decodeDdgUrl(href), title })
    } else if (/class="[^"]*result__snippet[^"]*"/i.test(attrs)) {
      snippets.push(htmlToText(inner))
    }
  }
  const results: WebSearchResult[] = []
  for (let index = 0; index < links.length && results.length < limit; index += 1) {
    const link = links[index]
    if (link === undefined) continue
    results.push({ title: link.title, url: link.url, snippet: snippets[index] ?? '' })
  }
  return results
}

function clampLimit(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return WEB_SEARCH_DEFAULT_LIMIT
  return Math.min(Math.trunc(value), WEB_SEARCH_MAX_LIMIT)
}

function clampTimeout(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return WEB_SEARCH_DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(value), 60_000)
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `web_search 失败：${message}`, error }
}

export function createWebSearchSkill(options: WebSearchSkillOptions = {}): SkillProtocol {
  const endpoint = options.searchEndpoint ?? DEFAULT_SEARCH_ENDPOINT
  const doFetch = options.fetchImpl ?? fetch

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'search') return fail(`未知 action: ${action}（当前仅支持 search）`, 'EBADACTION')
    const query = typeof params.query === 'string' ? params.query.trim() : ''
    if (query === '') return fail('缺少 query', 'EBADARG')

    const limit = clampLimit(params.limit)
    const timeoutMs = clampTimeout(params.timeout_ms)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const separator = endpoint.includes('?') ? '&' : '?'
      const url = `${endpoint}${separator}q=${encodeURIComponent(query)}`
      const response = await doFetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          // 用常见浏览器 UA，避免被结果页当爬虫拦
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
        }
      })
      if (!response.ok) return fail(`HTTP ${response.status}`, 'EHTTP')
      const html = await response.text()
      const results = parseDuckDuckGoHtml(html, limit)
      if (results.length === 0) {
        return { success: true, message: `未找到「${query}」的结果（结果页结构可能变化）`, data: { results: [] } }
      }
      const lines = results.map(
        (item, index) => `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}`
      )
      return {
        success: true,
        message: `「${query}」找到 ${results.length} 条：\n${lines.join('\n')}`,
        data: { results }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (controller.signal.aborted) return fail(`搜索超时（${timeoutMs}ms）`, 'ETIMEDOUT')
      return fail(message, 'ESEARCH')
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    id: 'system.web_search',
    description:
      '网页搜索（DuckDuckGo HTML，免 key）：返回标题 / 链接 / 摘要。'
      + '需要更稳结果可配置自建 provider。仅搜索，抓正文用 system.web_fetch。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search'], description: '操作类型: search=搜索' },
        query: { type: 'string', description: '搜索词' },
        limit: { type: 'integer', description: `结果条数（默认 ${WEB_SEARCH_DEFAULT_LIMIT}，上限 ${WEB_SEARCH_MAX_LIMIT}）` },
        timeout_ms: { type: 'integer', description: `超时毫秒（默认 ${WEB_SEARCH_DEFAULT_TIMEOUT_MS}）` }
      },
      required: ['action', 'query']
    },
    tags: ['system', 'web'],
    execute: run
  }
}
