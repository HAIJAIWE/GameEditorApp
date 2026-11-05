import { describe, expect, it, vi } from 'vitest'
import { createJobSkill } from '@mobai/agent-core/skills/jobSkill'
import { JobRegistry } from '@mobai/shared/agent/jobs/jobRegistry'

const skill = createJobSkill()

interface SkillResultLike {
  success: boolean
  message: string
  error?: string
  data?: unknown
}

function call(params: Record<string, unknown>, ctx: Record<string, unknown>): Promise<SkillResultLike> {
  return skill.execute(params, ctx) as Promise<SkillResultLike>
}

describe('system.job 技能（对齐 dsh tool-jobs）', () => {
  it('无注册表时拒绝', async () => {
    const result = await call({ action: 'list' }, {})
    expect(result.success).toBe(false)
  })

  it('空注册表 list → 没有后台任务', async () => {
    const reg = new JobRegistry()
    const result = await call({ action: 'list' }, { jobRegistry: reg })
    expect(result.success).toBe(true)
    expect(result.message).toContain('没有后台任务')
  })

  it('list 列出运行中任务', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: '生成第 1 章' })
    const result = await call({ action: 'list' }, { jobRegistry: reg })
    expect(result.success).toBe(true)
    expect(result.message).toContain('sub_1')
    expect(result.message).toContain('生成第 1 章')
  })

  it('status 返回详情与输出尾部', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    reg.append('sub_1', '进度输出')
    const result = await call({ action: 'status', id: 'sub_1' }, { jobRegistry: reg })
    expect(result.success).toBe(true)
    expect(result.message).toContain('进度输出')
  })

  it('status 未知 id 拒绝', async () => {
    const reg = new JobRegistry()
    const result = await call({ action: 'status', id: 'nope' }, { jobRegistry: reg })
    expect(result.success).toBe(false)
  })

  it('cancel 调用 jobCancel 并成功', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    const jobCancel = vi.fn(() => true)
    const result = await call({ action: 'cancel', id: 'sub_1' }, { jobRegistry: reg, jobCancel })
    expect(result.success).toBe(true)
    expect(jobCancel).toHaveBeenCalledWith('sub_1')
  })

  it('cancel 终态任务 → 提示无需取消', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'sub_1', kind: 'subagent', label: 'x' })
    reg.settle('sub_1', 'completed')
    const result = await call({ action: 'cancel', id: 'sub_1' }, { jobRegistry: reg })
    expect(result.success).toBe(true)
    expect(result.message).toContain('无需取消')
  })

  it('未知 action 拒绝', async () => {
    const reg = new JobRegistry()
    const result = await call({ action: 'frob' }, { jobRegistry: reg })
    expect(result.success).toBe(false)
  })
})

describe('system.job wait（阻塞等待，不轮询）', () => {
  it('任务已终态 → 立即返回结果与输出尾部', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: '写简介' })
    reg.append('j1', '子任务结果')
    reg.settle('j1', 'completed')
    const result = await call({ action: 'wait', id: 'j1' }, { jobRegistry: reg })
    expect(result.success).toBe(true)
    expect(result.message).toContain('已结束')
    expect(result.message).toContain('子任务结果')
  })

  it('等待期间被 settle → 拿到终态，而不是等到超时', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: '写简介' })
    const pending = call({ action: 'wait', id: 'j1', timeout_ms: 10_000 }, { jobRegistry: reg })
    setTimeout(() => reg.settle('j1', 'failed', '子智能体报错'), 5)
    const result = await pending
    expect(result.success).toBe(true)
    expect(result.message).toContain('失败')
    expect(result.message).toContain('子智能体报错')
    const data = result.data as { job: { status: string }; timedOut?: boolean }
    expect(data.job.status).toBe('failed')
    expect(data.timedOut).toBeUndefined()
  })

  it('超时不算失败：如实说「仍未结束」并带当前进度', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: '写简介' })
    reg.setProgress('j1', '已完成 2/5')
    const result = await call({ action: 'wait', id: 'j1', timeout_ms: 1 }, { jobRegistry: reg })
    expect(result.success).toBe(true)
    expect(result.message).toContain('仍未结束')
    expect(result.message).toContain('已完成 2/5')
    expect((result.data as { timedOut?: boolean }).timedOut).toBe(true)
  })

  it('用户取消 → 明确报「已取消」，不伪装成超时', async () => {
    const reg = new JobRegistry()
    reg.register({ id: 'j1', kind: 'subagent', label: '写简介' })
    const controller = new AbortController()
    const pending = call(
      { action: 'wait', id: 'j1', timeout_ms: 10_000 },
      { jobRegistry: reg, signal: controller.signal }
    )
    controller.abort()
    const result = await pending
    expect(result.success).toBe(false)
    expect(result.error).toContain('已取消')
  })

  it('wait 缺 id → 拒绝；未找到任务也拒绝', async () => {
    const reg = new JobRegistry()
    expect((await call({ action: 'wait' }, { jobRegistry: reg })).success).toBe(false)
    expect((await call({ action: 'wait', id: 'nope' }, { jobRegistry: reg })).success).toBe(false)
  })
})
