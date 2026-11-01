import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTerminalSkill, type PtyHandle, type PtyLoader } from '@mobai/agent-core/skills/terminalSkill'

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

/**
 * 这些用例测的是**管道模式**（用 echoShell.mjs 夹具，跨平台可跑）。
 * 显式 `mode: 'pipe'`：不让"这台机器恰好装了 node-pty"影响结果。
 */
function skill() {
  const s = createTerminalSkill({
    root: () => dir,
    shell: { command: process.execPath, args: [FIXTURE] },
    mode: 'pipe'
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

  it('status 反映运行中（并如实回报是不是 PTY）', async () => {
    const run = skill()
    await run({ action: 'start' })
    const status = await run({ action: 'status' })
    expect(status.data).toMatchObject({ running: true, pty: false })
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

  it('管道模式下 resize → EUNSUPPORTED（不假装支持）', async () => {
    const run = skill()
    await run({ action: 'start' })
    expect((await run({ action: 'resize', cols: 100, rows: 20 })).error).toBe('EUNSUPPORTED')
  })
})

/**
 * PTY 路径：用假加载器测「有 node-pty 时的行为」。
 *
 * 真 `node-pty` 是 native 模块（需按 Electron ABI 重编），单测不能依赖它装没装；
 * 而"装没装"恰恰是这条分支的输入，所以必须能注入。
 */
function fakePty() {
  const writes: string[] = []
  const resizes: Array<[number, number]> = []
  let kills = 0
  let onData: ((chunk: string) => void) | null = null
  const handle: PtyHandle = {
    write: (data) => writes.push(data),
    resize: (cols, rows) => resizes.push([cols, rows]),
    kill: () => {
      kills += 1
    },
    onData: (handler) => {
      onData = handler
    },
    onExit: () => undefined
  }
  const loader: PtyLoader = { spawn: () => handle }
  return {
    loader,
    writes,
    resizes,
    kills: () => kills,
    emit: (chunk: string) => onData?.(chunk)
  }
}

describe('system.terminal（PTY 可用时）', () => {
  it('start 报 PTY 尺寸；send 走 pty.write；read 拿到 onData 推的字节', async () => {
    const fake = fakePty()
    const s = createTerminalSkill({ root: () => dir, shell: { command: 'bash', args: [] }, pty: () => fake.loader })
    const run = (p: Record<string, unknown>): Promise<R> => s.execute(p, {}) as Promise<R>

    const started = await run({ action: 'start' })
    expect(started.success).toBe(true)
    expect(started.message).toContain('PTY')
    expect((started.data as { pty: boolean }).pty).toBe(true)

    await run({ action: 'send', input: 'ls' })
    expect(fake.writes).toEqual(['ls\n'])

    fake.emit('a.txt\r\nb.txt\r\n')
    const read = await run({ action: 'read', wait_ms: 1 })
    expect(read.message).toContain('a.txt')
    expect((read.data as { pty: boolean }).pty).toBe(true)

    const status = await run({ action: 'status' })
    expect(status.message).toContain('PTY')

    await run({ action: 'stop' })
    expect(fake.kills()).toBe(1)
  })

  it('resize 透传给 PTY 并被钳制到合理范围', async () => {
    const fake = fakePty()
    const s = createTerminalSkill({ root: () => dir, shell: { command: 'bash', args: [] }, pty: () => fake.loader })
    await s.execute({ action: 'start' }, {})
    await s.execute({ action: 'resize', cols: 5000, rows: 1 }, {})
    expect(fake.resizes).toEqual([[400, 5]])
  })

  it('起 PTY 抛错 ⇒ 回落到管道模式（不把整个 start 弄失败）', async () => {
    const loader: PtyLoader = {
      spawn: () => {
        throw new Error('spawn failed')
      }
    }
    const s = createTerminalSkill({
      root: () => dir,
      shell: { command: process.execPath, args: [FIXTURE] },
      pty: () => loader
    })
    stop = async () => {
      await s.execute({ action: 'stop' }, {})
    }
    const started = (await s.execute({ action: 'start' }, {})) as R
    expect(started.success).toBe(true)
    expect(started.message).toContain('管道模式')
  })
})

describe('system.terminal（PTY 不可用时）', () => {
  it('mode=pty 且加载不到 ⇒ EUNSUPPORTED 并给出安装命令', async () => {
    const s = createTerminalSkill({ root: () => dir, pty: () => null, mode: 'pty' })
    const result = (await s.execute({ action: 'start' }, {})) as R
    expect(result.success).toBe(false)
    expect(result.error).toBe('EUNSUPPORTED')
    expect(result.message).toContain('node-pty')
    expect(result.message).toContain('electron-rebuild')
  })

  it('mode=auto 且加载不到 ⇒ 回落管道，并在文案里说明没有 PTY', async () => {
    const s = createTerminalSkill({
      root: () => dir,
      shell: { command: process.execPath, args: [FIXTURE] },
      pty: () => null,
      mode: 'auto'
    })
    stop = async () => {
      await s.execute({ action: 'stop' }, {})
    }
    const result = (await s.execute({ action: 'start' }, {})) as R
    expect(result.success).toBe(true)
    expect(result.message).toContain('管道模式')
    expect((result.data as { pty: boolean }).pty).toBe(false)
  })
})
