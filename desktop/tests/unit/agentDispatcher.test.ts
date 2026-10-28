import { describe, expect, it } from 'vitest'

import { SkillDispatcher, SkillRegistry } from '../../src/main/agent/dispatcher'
import { RISK_LEVEL, type SkillProtocol } from '../../src/shared/agent/protocol'

function makeSkill(overrides: Partial<SkillProtocol> & Pick<SkillProtocol, 'id'>): SkillProtocol {
  return {
    description: '测试技能',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: { action: { type: 'string', description: '操作类型' } },
      required: ['action']
    },
    execute: () => ({ success: true, message: 'ok' }),
    ...overrides
  }
}

describe('SkillRegistry', () => {
  it('注册 / 取用 / 注销 / 计数 / 清空', () => {
    const registry = new SkillRegistry()
    expect(registry.register(makeSkill({ id: 'system.a' }))).toBe(true)
    expect(registry.register(makeSkill({ id: 'system.b' }))).toBe(true)
    expect(registry.count).toBe(2)
    expect(registry.get('system.a')?.id).toBe('system.a')
    expect(registry.list().map((skill) => skill.id)).toEqual(['system.a', 'system.b'])

    // 空 id 拒绝注册
    expect(registry.register(makeSkill({ id: '' }))).toBe(false)
    expect(registry.count).toBe(2)

    expect(registry.unregister('system.a')).toBe(true)
    expect(registry.count).toBe(1)
    expect(registry.unregister('system.a')).toBe(false)

    registry.clear()
    expect(registry.count).toBe(0)
  })
})

describe('SkillDispatcher：名称解析', () => {
  function makeDispatcher(): SkillDispatcher {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.game_data', description: '游戏数据增删改查操作' }))
    dispatcher.register(makeSkill({ id: 'system.ceshu', description: '策划书管理列表与详情' }))
    return dispatcher
  }

  it('精确 id 直接命中', () => {
    expect(makeDispatcher().fuzzyMatch('system.game_data')).toBe('system.game_data')
  })

  it('别名命中（含中文）', () => {
    const dispatcher = makeDispatcher()
    expect(dispatcher.fuzzyMatch('策划书')).toBe('system.ceshu')
    expect(dispatcher.fuzzyMatch('角色')).toBe('system.game_data')
    expect(dispatcher.fuzzyMatch('game_data')).toBe('system.game_data')
  })

  it('全角/大小写与空白由 trim+toLowerCase 归一；无法解析返回 null', () => {
    const dispatcher = makeDispatcher()
    expect(dispatcher.fuzzyMatch('SYSTEM.GAME_DATA')).toBe('system.game_data')
    expect(dispatcher.fuzzyMatch('  system.ceshu  ')).toBe('system.ceshu')
    expect(dispatcher.fuzzyMatch('压根不存在的工具')).toBeNull()
    expect(dispatcher.fuzzyMatch('')).toBeNull()
  })

  it('别名为未注册技能时不进入索引（避免指向不存在的工具）', () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.ceshu' }))
    // shell 未注册 → 其模糊别名 'system.file_ops' 等也不应生效
    expect(dispatcher.fuzzyMatch('file_ops')).toBeNull()
    expect(dispatcher.fuzzyMatch('ceshu')).toBe('system.ceshu')
  })
})

describe('SkillDispatcher：执行与结构化错误', () => {
  it('未知工具 → 未知工具: {名称}', async () => {
    const dispatcher = new SkillDispatcher()
    const result = await dispatcher.execute('nope.tool', {})
    expect(result).toEqual({ success: false, error: '未知工具: nope.tool', message: '' })
  })

  it('正常执行：参数经修正后传给技能，结果被归一化', async () => {
    const seen: Array<Record<string, unknown>> = []
    const dispatcher = new SkillDispatcher()
    dispatcher.register(
      makeSkill({
        id: 'system.game_data',
        execute: (params) => {
          seen.push(params)
          return { success: true, message: '共 2 条角色数据', data: [1, 2] }
        }
      })
    )
    const result = await dispatcher.execute('system.game_data', { type: 'role', action: 'list' })
    expect(result).toEqual({ success: true, message: '共 2 条角色数据', data: [1, 2] })
    // 'type' 别名收敛为 data_type
    expect(seen[0]).toEqual({ action: 'list', data_type: 'role' })
  })

  it('技能返回非标准形状也会被归一化', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.demo', execute: () => ({ data: '只有数据' }) as never }))
    const result = await dispatcher.execute('system.demo', {})
    expect(result).toEqual({ success: true, message: '只有数据', data: '只有数据' })
  })

  it('技能抛错不冒泡，收敛为结构化错误', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(
      makeSkill({
        id: 'system.boom',
        execute: () => {
          throw new Error('内部爆炸')
        }
      })
    )
    const result = await dispatcher.execute('system.boom', {})
    expect(result).toEqual({ success: false, error: '内部爆炸', message: '' })
  })
})

describe('SkillDispatcher：危险操作确认门', () => {
  function makeShellDispatcher(): SkillDispatcher {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(
      makeSkill({
        id: 'system.shell',
        description: '执行 shell 命令',
        execute: () => ({ success: true, message: '已执行' })
      })
    )
    return dispatcher
  }

  // 注：action 别名在调度器层统一归一（exec → execute），故文案/令牌用的是规范动作名
  it('SYSTEM 级工具未确认 → 高危操作需用户确认: {工具}/{操作}', async () => {
    const result = await makeShellDispatcher().execute('system.shell', { action: 'exec' })
    expect(result).toEqual({
      success: false,
      error: '高危操作需用户确认: system.shell/execute',
      message: ''
    })
  })

  it('确认令牌匹配则放行，且被一次性消费（就地置空）', async () => {
    const dispatcher = makeShellDispatcher()
    const ctx = { dangerConfirmed: { tool: 'system.shell', action: 'execute' } }
    const result = await dispatcher.execute('system.shell', { action: 'exec' }, ctx)
    expect(result).toEqual({ success: true, message: '已执行' })
    expect(ctx.dangerConfirmed).toBeNull()
  })

  it('令牌用掉后再次执行仍需重新确认', async () => {
    const dispatcher = makeShellDispatcher()
    const ctx = { dangerConfirmed: { tool: 'system.shell', action: 'execute' } }
    await dispatcher.execute('system.shell', { action: 'exec' }, ctx)
    const second = await dispatcher.execute('system.shell', { action: 'exec' }, ctx)
    expect(second.success).toBe(false)
    expect(second.error).toBe('高危操作需用户确认: system.shell/execute')
  })

  it('令牌的工具或操作不匹配 → 不放行', async () => {
    const dispatcher = makeShellDispatcher()
    const wrongAction = await dispatcher.execute('system.shell', { action: 'exec' }, {
      dangerConfirmed: { tool: 'system.shell', action: 'kill' }
    })
    expect(wrongAction.success).toBe(false)

    const wrongTool = await dispatcher.execute('system.shell', { action: 'exec' }, {
      dangerConfirmed: { tool: 'system.other', action: 'exec' }
    })
    expect(wrongTool.success).toBe(false)
  })

  it('READ_ONLY / DATA_WRITE 工具不需要确认', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.game_data', execute: () => ({ success: true, message: '读好了' }) }))
    expect(RISK_LEVEL.READ_ONLY).toBe(0)
    const result = await dispatcher.execute('system.game_data', { action: 'list' })
    expect(result).toEqual({ success: true, message: '读好了' })
  })
})

describe('SkillDispatcher：供提示词与面板使用的元数据', () => {
  it('toolsDescription / toolsJsonSchema / count', () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.a', description: '技能甲' }))
    dispatcher.register(makeSkill({ id: 'system.b', description: '技能乙' }))

    expect(dispatcher.count).toBe(2)
    expect(dispatcher.toolsDescription()).toContain('- system.a: 技能甲')
    expect(dispatcher.toolsDescription()).toContain('- system.b: 技能乙')

    const schemas = dispatcher.toolsJsonSchema()
    expect(schemas.map((schema) => schema.name)).toEqual(['system.a', 'system.b'])
    expect(schemas[0]?.parameters.type).toBe('object')

    // 注销后模糊索引同步失效
    dispatcher.unregister('system.a')
    expect(dispatcher.count).toBe(1)
    expect(dispatcher.fuzzyMatch('system.a')).toBeNull()
  })

  it('toolCatalog（M2/G7）：每工具一行摘要，不含参数明细', () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.a', description: '技能甲' }))
    dispatcher.register(makeSkill({ id: 'system.b', description: '技能乙' }))

    expect(dispatcher.toolCatalog().split('\n')).toEqual(['- system.a: 技能甲', '- system.b: 技能乙'])
    // 全量版含参数行（`action`），目录版不含——两者分工明确
    expect(dispatcher.toolsDescription()).toContain('action')
    expect(dispatcher.toolCatalog()).not.toContain('action')
  })
})

/**
 * 风险**硬上限**（`maxAllowedRisk`）守卫。
 *
 * 为什么必须锁：改前该字段存了却从不读取（`riskCeiling` getter 也零调用点）——
 * 形似安全策略、实则零守卫，删掉那行都不会有测试报红。这三条用例把「它真的在拦」钉住。
 * 同时钉住缺省值：缺省必须是 `SYSTEM`（不设上限），否则 `system.code` 这类
 * 已经过用户确认的操作会被默认配置**永久锁死**（那是行为破坏，不是加强安全）。
 */
describe('SkillDispatcher：风险硬上限（maxAllowedRisk）', () => {
  it('默认不设上限：SYSTEM 级工具带确认令牌可执行', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'system.code' }))
    const ctx = { dangerConfirmed: { tool: 'system.code', action: 'execute' } }

    expect(dispatcher.riskCeiling).toBe(RISK_LEVEL.SYSTEM)
    const result = await dispatcher.execute('system.code', { action: 'execute' }, ctx)
    expect(result.success).toBe(true)
  })

  it('收紧到 FILE_SYSTEM：SYSTEM 级工具即便带确认令牌也被拒（硬上限优先于确认门）', async () => {
    const dispatcher = new SkillDispatcher({ maxAllowedRisk: RISK_LEVEL.FILE_SYSTEM })
    dispatcher.register(makeSkill({ id: 'system.code' }))
    const ctx = { dangerConfirmed: { tool: 'system.code', action: 'execute' } }

    const result = await dispatcher.execute('system.code', { action: 'execute' }, ctx)
    expect(result.success).toBe(false)
    expect(result.error).toContain('超出风险上限')
    // 被硬上限拦下时不消费令牌（同一令牌仍可用于其它放行路径，语义不串味）
    expect(ctx.dangerConfirmed).not.toBeNull()
  })

  it('收紧到 FILE_SYSTEM 仍放行 DATA_WRITE 级工具（不是一刀切全禁）', async () => {
    const dispatcher = new SkillDispatcher({ maxAllowedRisk: RISK_LEVEL.FILE_SYSTEM })
    dispatcher.register(makeSkill({ id: 'system.game_data' }))

    const result = await dispatcher.execute('system.game_data', { action: 'create' })
    expect(result.success).toBe(true)
  })
})

/**
 * 信任边界：confirm 只认 `ctx.dangerConfirmed` 可信令牌，**不认模型参数**。
 * 改前 delete/rollback 靠 `params.confirm`，而 `fixParams` 还会把 confirmed/sure 归一成 confirm
 * ⇒ 模型只要在参数里写 `confirm:true` 就能跳过用户询问。这三条用例钉住「它真的在拦」。
 */
describe('SkillDispatcher：confirm 只认可信令牌（不认模型参数）', () => {
  /** 只有收到 confirm:true 才删除的 DATA_WRITE 技能 */
  function makeDeleteSkill(onDelete: () => void): SkillProtocol {
    return makeSkill({
      id: 'system.game_data',
      execute: (params) => {
        if (params.confirm !== true) {
          return {
            success: false,
            message: '',
            error: '[WARN] 确认删除？',
            interaction: { kind: 'confirm', prompt: '确认删除？' }
          }
        }
        onDelete()
        return { success: true, message: '已删除' }
      }
    })
  }

  it('模型自带 confirm/confirmed/sure 均被丢弃 → 仍返回 confirm 交互，绝不执行删除', async () => {
    const dispatcher = new SkillDispatcher()
    let deleted = false
    dispatcher.register(makeDeleteSkill(() => { deleted = true }))

    for (const extra of [{ confirm: true }, { confirmed: true }, { sure: true }]) {
      const result = await dispatcher.execute('system.game_data', { action: 'delete', ...extra }, {})
      expect(result.success).toBe(false)
      expect(result.interaction).toEqual({ kind: 'confirm', prompt: '确认删除？' })
      expect(deleted).toBe(false)
    }
  })

  it('可信令牌匹配 → 注入 confirm 并消费令牌，技能真正执行', async () => {
    const dispatcher = new SkillDispatcher()
    let deleted = false
    dispatcher.register(makeDeleteSkill(() => { deleted = true }))
    const ctx = { dangerConfirmed: { tool: 'system.game_data', action: 'delete' } }

    const result = await dispatcher.execute('system.game_data', { action: 'delete' }, ctx)
    expect(result.success).toBe(true)
    expect(deleted).toBe(true)
    expect(ctx.dangerConfirmed).toBeNull()
  })

  it('令牌工具/动作不匹配 → 不注入、不消费，仍返回 confirm 交互', async () => {
    const dispatcher = new SkillDispatcher()
    let deleted = false
    dispatcher.register(makeDeleteSkill(() => { deleted = true }))
    const ctx = { dangerConfirmed: { tool: 'system.game_data', action: 'update' } }

    const result = await dispatcher.execute('system.game_data', { action: 'delete' }, ctx)
    expect(result.success).toBe(false)
    expect(result.interaction).toBeDefined()
    expect(deleted).toBe(false)
    expect(ctx.dangerConfirmed).not.toBeNull()
  })
})
