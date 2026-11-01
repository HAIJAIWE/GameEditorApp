import { describe, expect, it } from 'vitest'
import { createPresentPlanSkill } from '@mobai/agent-core/skills/presentPlanSkill'

const skill = createPresentPlanSkill()

describe('system.present_plan（对齐 dsh plan-mode exit_plan_mode 审阅流）', () => {
  it('合法计划：返回 question 交互，计划正文放入 detail，两个选项', async () => {
    const plan = '# 重构登录流程\n\n1. 抽 UserService\n2. 接 OAuth'
    const result = await skill.execute({ plan }, {})
    expect(result.success).toBe(true)
    expect(result.interaction?.kind).toBe('question')
    expect(result.interaction?.detail).toBe(plan)
    const labels = (result.interaction?.options ?? []).map((o) => o.label)
    expect(labels).toEqual(['批准并执行', '需要修改'])
  })

  it('计划必须以 # 标题起头，否则拒绝', async () => {
    const result = await skill.execute({ plan: '先做一些改动，再看看效果' }, {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('#')
    expect(result.interaction).toBeUndefined()
  })

  it('空计划拒绝', async () => {
    const result = await skill.execute({ plan: '   ' }, {})
    expect(result.success).toBe(false)
  })

  it('非字符串计划拒绝', async () => {
    const result = await skill.execute({ plan: 42 }, {})
    expect(result.success).toBe(false)
  })

  it('缺少 plan 参数拒绝', async () => {
    const result = await skill.execute({}, {})
    expect(result.success).toBe(false)
  })
})
