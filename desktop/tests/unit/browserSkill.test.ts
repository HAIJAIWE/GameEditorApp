import { describe, expect, it } from 'vitest'

import { createBrowserSkill, isOpenableUrl } from '../../src/main/agent/skills/browserSkill'

type R = { success: boolean; message: string; error?: string }

function make() {
  const opened: string[] = []
  const skill = createBrowserSkill({
    openExternal: async (url) => {
      opened.push(url)
    }
  })
  return { opened, run: (p: Record<string, unknown>): Promise<R> => skill.execute(p, {}) as Promise<R> }
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

  it('非 http/https → EBADURL', async () => {
    const { run } = make()
    expect((await run({ action: 'open', url: 'ftp://x' })).error).toBe('EBADURL')
  })

  it('缺 url → EBADARG；坏 action → EBADACTION', async () => {
    const { run } = make()
    expect((await run({ action: 'open' })).error).toBe('EBADARG')
    expect((await run({ action: 'frob', url: 'https://x' })).error).toBe('EBADACTION')
  })
})
