import { describe, expect, it, vi } from 'vitest'
import { createJobSkill } from '../../src/main/agent/skills/jobSkill'
import { JobRegistry } from '../../src/shared/agent/jobs/jobRegistry'

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
