import { describe, expect, it } from 'vitest'
import {
  JOB_OUTPUT_TAIL_CHARS,
  JobRegistry,
  formatJobLine
} from '../../src/shared/agent/jobs/jobRegistry'

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
