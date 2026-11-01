import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBrowserSkill, isOpenableUrl } from '@mobai/agent-core/skills/browserSkill'

type R = { success: boolean; message: string; error?: string; data?: unknown }

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-browser-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

function make() {
  const opened: string[] = []
  const loaded: string[] = []
  const evaled: Array<{ url: string; code: string }> = []
  const shots: string[] = []
  const skill = createBrowserSkill({
    root: () => dir,
    openExternal: async (url) => {
      opened.push(url)
    },
    loadPage: async (url) => {
      loaded.push(url)
      return { title: 'T', text: 'body text', html: '<html/>' }
    },
    evalPage: async (url, code) => {
      evaled.push({ url, code })
      return { ok: 1 }
    },
    screenshotPage: async (_url, path) => {
      shots.push(path)
    }
  })
  return { opened, loaded, evaled, shots, run: (p: Record<string, unknown>): Promise<R> => skill.execute(p, {}) as Promise<R> }
}

describe('isOpenableUrl', () => {
  it('仅 http/https', () => {
    expect(isOpenableUrl('https://example.com')).toBe(true)
    expect(isOpenableUrl('http://localhost:3000')).toBe(true)
    expect(isOpenableUrl('ftp://example.com')).toBe(false)
    expect(isOpenableUrl('not a url')).toBe(false)
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('system.browser', () => {
  it('open 交给 openExternal', async () => {
    const { run, opened } = make()
    const result = await run({ action: 'open', url: 'https://example.com' })
    expect(result.success).toBe(true)
    expect(opened).toEqual(['https://example.com'])
  })

  it('read 返回标题+正文', async () => {
    const { run, loaded } = make()
    const result = await run({ action: 'read', url: 'https://example.com' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('# T')
    expect(result.message).toContain('body text')
    expect(loaded).toEqual(['https://example.com'])
  })

  it('eval 在页面执行 JS 并返回结果', async () => {
    const { run, evaled } = make()
    const result = await run({ action: 'eval', url: 'https://example.com', code: '1+1' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('{"ok":1}')
    expect(evaled[0]).toEqual({ url: 'https://example.com', code: '1+1' })
  })

  it('screenshot 写入 .mb-shots', async () => {
    const { run, shots } = make()
    const result = await run({ action: 'screenshot', url: 'https://example.com' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('.mb-shots/')
    expect(shots[0]?.endsWith('.png')).toBe(true)
  })

  it('eval 缺 code / 非 http / 缺 url / 坏 action', async () => {
    const { run } = make()
    expect((await run({ action: 'eval', url: 'https://x' })).error).toBe('EBADARG')
    expect((await run({ action: 'open', url: 'ftp://x' })).error).toBe('EBADURL')
    expect((await run({ action: 'open' })).error).toBe('EBADARG')
    expect((await run({ action: 'frob', url: 'https://x' })).error).toBe('EBADACTION')
  })
})
