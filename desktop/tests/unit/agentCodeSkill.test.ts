import { describe, expect, it } from 'vitest'

import { SkillDispatcher } from '../../src/main/agent/dispatcher'
import { createCodeSkill } from '../../src/main/agent/skills/codeSkill'
import { RISK_LEVEL, resolveRiskLevel } from '../../src/shared/agent/protocol'

/**
 * `system.code`（A1-5）：沙箱执行 + SYSTEM 级危险确认门。
 * 这是 A1-4 遗留项「危险操作审批端到端拦截」的技能侧前提——本批次终于有 SYSTEM 级技能了。
 */
describe('system.code 技能：沙箱执行', () => {
  it('返回值经沙箱序列化回传（数字 / 对象 / 字符串）', async () => {
    const skill = createCodeSkill()

    const sum = await skill.execute({ action: 'execute', code: 'return 1 + 1' }, {})
    expect(sum.success).toBe(true)
    expect(sum.message).toBe('执行成功: 2')
    expect(sum.data).toBe(2)

    const object = await skill.execute({ action: 'execute', code: 'return { a: 1, b: [2, 3] }' }, {})
    expect(object.success).toBe(true)
    expect(object.message).toBe('执行成功: {"a":1,"b":[2,3]}')
    expect(object.data).toEqual({ a: 1, b: [2, 3] })

    // 字符串不加引号（describeValue 对字符串直出）
    const text = await skill.execute({ action: 'execute', code: 'return "甲"' }, {})
    expect(text.message).toBe('执行成功: 甲')
  })

  it('未 return 时视为 null', async () => {
    const skill = createCodeSkill()
    const result = await skill.execute({ action: 'execute', code: 'const a = 1' }, {})
    expect(result.success).toBe(true)
    expect(result.data).toBeNull()
  })

  it('代码抛错 → 沙箱执行失败（不冒泡到调度器）', async () => {
    const skill = createCodeSkill()
    const result = await skill.execute({ action: 'execute', code: 'throw new Error("炸了")' }, {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('沙箱执行失败: ')
    expect(result.error).toContain('炸了')
  })

  it('沙箱无宿主能力：访问 process / require 会失败', async () => {
    const skill = createCodeSkill()
    const result = await skill.execute({ action: 'execute', code: 'return typeof process' }, {})
    expect(result.success).toBe(true)
    // 沙箱内不存在 process（默认零宿主能力）
    expect(result.data).toBe('undefined')
  })

  it('缺 code 参数 / 未知动作', async () => {
    const skill = createCodeSkill()
    expect(await skill.execute({ action: 'execute' }, {})).toEqual({
      success: false,
      error: '缺少 code 参数',
      message: ''
    })
    expect(await skill.execute({ action: 'nope' }, {})).toEqual({
      success: false,
      error: '未知动作: nope',
      message: ''
    })
  })

  it('超时与内存上限被夹到安全范围（不接受 LLM 传超大值）', async () => {
    const skill = createCodeSkill()
    // 传超大值仍应正常返回（被夹到上限而非直接放行）
    const result = await skill.execute(
      { action: 'execute', code: 'return 42', timeout_ms: 999_999, memory_limit_mb: 99_999 },
      {}
    )
    expect(result.success).toBe(true)
    expect(result.data).toBe(42)
  })
})

describe('system.code 的 SYSTEM 级危险确认门（A1-4 遗留项的技能侧前提）', () => {
  it('风险等级为 SYSTEM（最高档）', () => {
    expect(resolveRiskLevel('system.code', 'execute')).toBe(RISK_LEVEL.SYSTEM)
  })

  it('未确认 → 拒绝执行，且沙箱代码没有被跑', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(createCodeSkill())
    const result = await dispatcher.execute('system.code', {
      action: 'execute',
      code: 'return 1 + 1'
    })
    expect(result).toEqual({
      success: false,
      error: '高危操作需用户确认: system.code/execute',
      message: ''
    })
  })

  it('确认令牌匹配 → 放行执行并消费令牌', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(createCodeSkill())
    const ctx = { dangerConfirmed: { tool: 'system.code', action: 'execute' } }
    const result = await dispatcher.execute('system.code', { action: 'execute', code: 'return 7 * 6' }, ctx)
    expect(result.success).toBe(true)
    expect(result.data).toBe(42)
    expect(ctx.dangerConfirmed).toBeNull()
  })
})
