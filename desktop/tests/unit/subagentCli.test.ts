import { describe, expect, it } from 'vitest'

import { createCliSubAgentProvider } from '../../src/main/agent/subagentCli'
import type { SubAgentTask } from '../../src/shared/agent/brain'

function makeTask(text: string, sandboxPolicy: SubAgentTask['sandboxPolicy'] = 'workspace-write'): SubAgentTask {
  return {
    task: text,
    depth: 1,
    signal: new AbortController().signal,
    inbox: { push: () => undefined, drain: () => [] },
    sandboxPolicy
  }
}

describe('CLI 子智能体 provider（Slice 31）', () => {
  it('arg 模式：任务作为最后一个参数，stdout 作为结果', async () => {
    const provider = createCliSubAgentProvider({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("收到:" + process.argv[process.argv.length - 1])']
    })
    const outcome = await provider.run(makeTask('hello'))
    expect(outcome.success).toBe(true)
    expect(outcome.text).toBe('收到:hello')
  })

  it('stdin 模式：任务走 stdin', async () => {
    const provider = createCliSubAgentProvider({
      command: process.execPath,
      args: [
        '-e',
        'let d="";process.stdin.on("data",c=>{d+=c});process.stdin.on("end",()=>process.stdout.write("IN:"+d))'
      ],
      inputMode: 'stdin'
    })
    const outcome = await provider.run(makeTask('来自stdin'))
    expect(outcome.success).toBe(true)
    expect(outcome.text).toBe('IN:来自stdin')
  })

  it('非零退出码 → success=false，回退 stderr', async () => {
    const provider = createCliSubAgentProvider({
      command: process.execPath,
      args: ['-e', 'process.stderr.write("boom");process.exit(2)']
    })
    const outcome = await provider.run(makeTask('x'))
    expect(outcome.success).toBe(false)
    expect(outcome.text).toContain('boom')
  })

  it('命令不存在 → 启动失败（success=false，不抛）', async () => {
    const provider = createCliSubAgentProvider({ command: 'mb-no-such-command-xyz' })
    const outcome = await provider.run(makeTask('x'))
    expect(outcome.success).toBe(false)
    expect(outcome.text).toContain('启动失败')
  })

  it('沙箱 read-only → 拒绝运行外部 CLI（不启动子进程）', async () => {
    const provider = createCliSubAgentProvider({
      command: process.execPath,
      args: ['-e', 'process.stdout.write("不该跑到这里")']
    })
    const outcome = await provider.run(makeTask('x', 'read-only'))
    expect(outcome.success).toBe(false)
    expect(outcome.text).toContain('read-only')
    expect(outcome.text).not.toContain('不该跑到这里')
  })
})
