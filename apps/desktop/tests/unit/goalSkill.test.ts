import { beforeEach, describe, expect, it } from 'vitest'
import { createGoalSkill } from '@mobai/agent-core/skills/goalSkill'
import { goalStore } from '@mobai/shared/agent/goal/goalStore'

const skill = createGoalSkill()
const SID = 'skill-session-1'

// 单例 goalStore 跨测试共享，每个用例前清空，避免状态泄漏
beforeEach(() => {
  goalStore.clear(SID)
})

function call(params: Record<string, unknown>): Promise<{ success: boolean; message: string; error?: string }> {
  return skill.execute(params, { sessionId: SID }) as Promise<{ success: boolean; message: string; error?: string }>
}

describe('system.goal 技能（对齐 dsh tool-goal）', () => {
  it('create 成功并回显状态', async () => {
    const result = await call({ action: 'create', objective: '重构登录' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('重构登录')
    expect(goalStore.get(SID)?.phase).toBe('active')
  })

  it('未知 action 拒绝', async () => {
    const result = await call({ action: 'frobnicate' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('未知 action')
  })

  it('缺 sessionId 拒绝', async () => {
    const result = (await skill.execute({ action: 'create', objective: 'x' }, {})) as { success: boolean }
    expect(result.success).toBe(false)
  })

  it('pause / complete 流转', async () => {
    await call({ action: 'create', objective: 'x' })
    expect((await call({ action: 'pause' })).success).toBe(true)
    expect(goalStore.get(SID)?.phase).toBe('paused')
    expect((await call({ action: 'resume' })).success).toBe(true)
    expect((await call({ action: 'complete' })).success).toBe(true)
    expect(goalStore.get(SID)?.phase).toBe('complete')
  })

  it('block 需 code + message', async () => {
    await call({ action: 'create', objective: 'x' })
    const bad = await call({ action: 'block', code: '', message: '原因' })
    expect(bad.success).toBe(false)
    const good = await call({ action: 'block', code: 'dep', message: '缺依赖' })
    expect(good.success).toBe(true)
    expect(goalStore.get(SID)?.phase).toBe('blocked')
  })

  it('clear 清空目标', async () => {
    await call({ action: 'create', objective: 'x' })
    const result = await call({ action: 'clear' })
    expect(result.success).toBe(true)
    expect(goalStore.get(SID)).toBeNull()
  })
})
