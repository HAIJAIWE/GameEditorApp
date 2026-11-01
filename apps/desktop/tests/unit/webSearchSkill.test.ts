import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createWebSearchSkill,
  decodeDdgUrl,
  parseDuckDuckGoHtml
} from '@mobai/agent-core/skills/webSearchSkill'

const RESULTS_HTML = `
<html><body>
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&amp;rut=1">Example <b>A</b></a>
  <a class="result__snippet" href="x">Snippet <b>one</b> here</a>
</div>
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Example B</a>
  <a class="result__snippet" href="y">Snippet two</a>
</div>
</body></html>`

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith('/empty')) {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><body>no results</body></html>')
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(RESULTS_HTML)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill(endpoint = `${base}/search`): (params: Record<string, unknown>) => Promise<R> {
  const s = createWebSearchSkill({ searchEndpoint: endpoint })
  return (params) => s.execute(params, {}) as Promise<R>
}

describe('decodeDdgUrl', () => {
  it('解 uddg 跳转；普通 URL 原样', () => {
    expect(decodeDdgUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa&rut=1')).toBe('https://example.com/a')
    expect(decodeDdgUrl('https://example.com/x')).toBe('https://example.com/x')
  })
})

describe('parseDuckDuckGoHtml', () => {
  it('解析标题/链接/摘要，limit 生效', () => {
    const all = parseDuckDuckGoHtml(RESULTS_HTML, 10)
    expect(all).toHaveLength(2)
    expect(all[0]).toEqual({ title: 'Example A', url: 'https://example.com/a', snippet: 'Snippet one here' })
    expect(parseDuckDuckGoHtml(RESULTS_HTML, 1)).toHaveLength(1)
  })
})

describe('system.web_search', () => {
  it('search 返回结果列表', async () => {
    const result = await skill()({ action: 'search', query: '游戏设计' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Example A')
    expect(result.message).toContain('https://example.com/a')
    expect(result.message).toContain('Snippet one here')
  })

  it('limit 限制条数', async () => {
    const result = await skill()({ action: 'search', query: 'x', limit: 1 })
    const results = (result.data as { results: unknown[] }).results
    expect(results).toHaveLength(1)
  })

  it('无结果时明确提示', async () => {
    const result = await skill(`${base}/empty`)({ action: 'search', query: 'zzz' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('未找到')
  })

  it('缺 query / 坏 action', async () => {
    expect((await skill()({ action: 'search' })).error).toBe('EBADARG')
    expect((await skill()({ action: 'frob', query: 'x' })).error).toBe('EBADACTION')
  })
})
