import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createShellSkill } from '../../src/main/agent/skills/shellSkill'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mb-shell-'))
})

afterEach(async () => {
  // Windows 上被杀的子进程可能短暂占用 cwd → EBUSY；重试等待其释放
  if (root !== '') await rm(root, { recursive: true, force: true, maxRetries: 40, retryDelay: 100 })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill(policy?: 'read-only' | 'workspace-write') {
  const s = createShellSkill({ root: () => root, ...(policy ? { policy } : {}) })
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

describe('system.shell（对齐 dsh shell）', () => {
  it('执行命令并返回 stdout 与退出码 0', async () => {
    const run = skill()
    const result = await run({ action: 'run', command: 'node -p "1+1"' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('退出码：0')
    expect(result.message).toContain('2')
  })

  it('非零退出：工具成功、退出码交回模型', async () => {
    const run = skill()
    const result = await run({ action: 'run', command: 'node -e "process.exit(3)"' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('退出码：3')
  })

  it('超时被终止', async () => {
    const run = skill()
    // 用短命子进程（800ms 自行退出）：exec 超时只杀 shell，孙进程会稍后自行结束，
    // 避免它长期占用 cwd 让清理撞 EBUSY。
    const result = await run({ action: 'run', command: 'node -e "setTimeout(()=>{}, 800)"', timeout_ms: 50 })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ETIMEDOUT')
  })

  it('read-only 沙箱拒绝执行', async () => {
    const run = skill('read-only')
    const result = await run({ action: 'run', command: 'node -p "1"' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('FS_SANDBOX_DENIED')
  })

  it('空命令拒绝', async () => {
    const run = skill()
    expect((await run({ action: 'run', command: '  ' })).success).toBe(false)
  })

  it('未知 action 拒绝', async () => {
    const run = skill()
    expect((await run({ action: 'frob' })).success).toBe(false)
  })
})
