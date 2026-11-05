import { describe, expect, it } from 'vitest'
import {
  JOB_OUTPUT_TAIL_CHARS,
  JobRegistry,
  formatJobLine
} from '@mobai/shared/agent/jobs/jobRegistry'

describe('JobRegistry（对齐 dsh jobs 注册表 seam）', () => {
  it('register → running，list 可见', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: '生成第 1 章' })
    const list = reg.list()
    expect(list).toHaveLength(1)
    expect(list[0]?.status).toBe('running')
    expect(reg.runningCount()).toBe(1)
  })

  it('append 输出为有界尾部', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    reg.append('sub_1', 'a'.repeat(JOB_OUTPUT_TAIL_CHARS + 500))
    const job = reg.get('sub_1')
    expect(job?.output.length).toBe(JOB_OUTPUT_TAIL_CHARS)
    // 尾部保留：最后一次 append 的文本在末尾
    reg.append('sub_1', 'END')
    expect(reg.get('sub_1')?.output.endsWith('END')).toBe(true)
  })

  it('settle 写终态、detail 与 finishedAt', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    reg.settle('sub_1', 'failed', '超时', 1000)
    const job = reg.get('sub_1')
    expect(job?.status).toBe('failed')
    expect(job?.detail).toBe('超时')
    expect(job?.finishedAt).toBe(1000)
  })

  it('终态不可再 settle / setProgress', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    reg.settle('sub_1', 'completed')
    reg.settle('sub_1', 'killed')
    expect(reg.get('sub_1')?.status).toBe('completed')
  })

  it('list 运行中优先', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'a', kind: 'subagent', label: 'A', now: 1 })
    reg.register({ id: 'b', kind: 'subagent', label: 'B', now: 2 })
    reg.settle('a', 'completed')
    reg.register({ id: 'c', kind: 'subagent', label: 'C', now: 3 })
    const list = reg.list()
    expect(list[0]?.status).toBe('running')
    expect(list.map((j) => j.id)).toContain('a')
  })

  it('get 返回副本，外部改写不影响内部', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    const snapshot = reg.get('sub_1')
    if (snapshot !== null) snapshot.status = 'failed'
    expect(reg.get('sub_1')?.status).toBe('running')
  })

  it('formatJobLine 含状态与标签', () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: '生成第 1 章' })
    const line = formatJobLine(reg.get('sub_1')!)
    expect(line).toContain('运行中')
    expect(line).toContain('生成第 1 章')
  })
})

describe('JobRegistry.waitFor（job_output 的等待原语）', () => {
  it('已终态立即返回 settled，不挂起', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: 'x' })
    reg.settle('j1', 'completed')
    const outcome = await reg.waitFor('j1', { timeoutMs: 10_000 })
    expect(outcome.kind).toBe('settled')
    expect(outcome.job?.status).toBe('completed')
  })

  it('任务不存在 → missing', async () => {
    const reg = new JobRegistry()
    const outcome = await reg.waitFor('nope', { timeoutMs: 10_000 })
    expect(outcome).toEqual({ kind: 'missing', job: null })
  })

  it('settle 唤醒等待者，多个等待者同时收到', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: 'x' })
    const first = reg.waitFor('j1', { timeoutMs: 10_000 })
    const second = reg.waitFor('j1', { timeoutMs: 10_000 })
    reg.append('j1', '子任务结果')
    reg.settle('j1', 'completed')
    const [a, b] = await Promise.all([first, second])
    expect(a.kind).toBe('settled')
    expect(b.kind).toBe('settled')
    expect(a.job?.output).toBe('子任务结果')
  })

  it('超时返回 timeout + 当下 running 快照', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: 'x' })
    const outcome = await reg.waitFor('j1', { timeoutMs: 5 })
    expect(outcome.kind).toBe('timeout')
    expect(outcome.job?.status).toBe('running')
  })

  it('abort 立刻打断等待', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: 'x' })
    const controller = new AbortController()
    const pending = reg.waitFor('j1', { timeoutMs: 10_000, signal: controller.signal })
    controller.abort()
    expect((await pending).kind).toBe('aborted')
  })

  it('已经 abort 的 signal 直接返回 aborted', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: 'x' })
    const controller = new AbortController()
    controller.abort()
    const outcome = await reg.waitFor('j1', { timeoutMs: 10_000, signal: controller.signal })
    expect(outcome.kind).toBe('aborted')
  })

  it('等待期间 clear → missing（不会挂到超时）', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: 'x' })
    const pending = reg.waitFor('j1', { timeoutMs: 10_000 })
    reg.clear()
    expect(await pending).toEqual({ kind: 'missing', job: null })
  })
})
