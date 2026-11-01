import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createWebSkill, htmlToText, isPrivateHost } from '@mobai/agent-core/skills/webSkill'

let server: Server
let base = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<html><body><h1>Hi</h1><script>evil()</script><p>World &amp; more</p></body></html>')
      return
    }
    if (req.url === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"a":1}')
      return
    }
    res.writeHead(404)
    res.end('nope')
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

function skill(allowPrivateHosts = true) {
  const s = createWebSkill({ allowPrivateHosts })
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

describe('isPrivateHost / htmlToText', () => {
  it('识别内网与本机', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('10.1.2.3')).toBe(true)
    expect(isPrivateHost('192.168.1.1')).toBe(true)
    expect(isPrivateHost('172.16.0.1')).toBe(true)
    expect(isPrivateHost('172.31.255.1')).toBe(true)
    expect(isPrivateHost('172.32.0.1')).toBe(false)
    expect(isPrivateHost('example.com')).toBe(false)
  })

  it('HTML 去标签/脚本、解实体', () => {
    const text = htmlToText('<p>a &amp; b</p><script>x()</script><style>.a{}</style>')
    expect(text).toBe('a & b')
  })
})

describe('system.web_fetch', () => {
  it('抓 HTML 默认剥成纯文本（去 script）', async () => {
    const result = await skill()({ action: 'fetch', url: `${base}/html` })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Hi')
    expect(result.message).toContain('World & more')
    expect(result.message).not.toContain('evil')
    expect(result.message).not.toContain('<h1>')
  })

  it('raw:true 返回原始 HTML', async () => {
    const result = await skill()({ action: 'fetch', url: `${base}/html`, raw: true })
    expect(result.success).toBe(true)
    expect(result.message).toContain('<h1>')
  })

  it('JSON 原样返回', async () => {
    const result = await skill()({ action: 'fetch', url: `${base}/json` })
    expect(result.success).toBe(true)
    expect(result.message).toBe('{"a":1}')
  })

  it('非 2xx → EHTTP', async () => {
    const result = await skill()({ action: 'fetch', url: `${base}/missing` })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EHTTP')
  })

  it('默认拒绝内网地址（SSRF）', async () => {
    const result = await skill(false)({ action: 'fetch', url: `${base}/html` })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBLOCKED')
  })

  it('非 http/https → EBADPROTOCOL', async () => {
    const result = await skill()({ action: 'fetch', url: 'ftp://example.com/x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADPROTOCOL')
  })

  it('搜索不支持 → EBADACTION', async () => {
    const result = await skill()({ action: 'search', url: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADACTION')
  })
})
