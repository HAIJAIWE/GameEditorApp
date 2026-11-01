import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTerminalSkill } from '@mobai/agent-core/skills/terminalSkill'

const FIXTURE = fileURLToPath(new URL('../fixtures/echoShell.mjs', import.meta.url))

let dir = ''
let stop: (() => Promise<void>) | null = null

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-term-'))
})

afterEach(async () => {
  if (stop !== null) await stop()
  stop = null
  if (dir !== '') await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill() {
  const s = createTerminalSkill({
    root: () => dir,
    shell: { command: process.execPath, args: [FIXTURE] }
  })
  stop = async () => {
    await s.execute({ action: 'stop' }, {})
  }
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

describe('system.terminal（持久 shell）', () => {
  it('start → send → read 拿到回显；会话持久', async () => {
    const run = skill()
    expect((await run({ action: 'start' })).success).toBe(true)

    await run({ action: 'send', input: 'hello' })
    const first = await run({ action: 'read', wait_ms: 500 })
    expect(first.success).toBe(true)
    expect(first.message).toContain('echo:hello')

    // 会话仍存活，再发一条
    await run({ action: 'send', input: 'again' })
    const second = await run({ action: 'read', wait_ms: 500 })
    expect(second.message).toContain('echo:again')
  })

  it('status 反映运行中', async () => {
    const run = skill()
    await run({ action: 'start' })
    const status = await run({ action: 'status' })
    expect(status.data).toEqual({ running: true })
  })

  it('未 start 就 send → ENOSESSION', async () => {
    const run = skill()
    const result = await run({ action: 'send', input: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOSESSION')
  })

  it('stop 后 read → ENOSESSION', async () => {
    const run = skill()
    await run({ action: 'start' })
    await run({ action: 'stop' })
    const result = await run({ action: 'read' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOSESSION')
  })

  it('未知 action → EBADACTION', async () => {
    const run = skill()
    const result = await run({ action: 'frob' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADACTION')
  })
})
