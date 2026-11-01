import { describe, expect, it } from 'vitest'
import { GoalError, GoalStore, formatGoalStatus } from '@mobai/shared/agent/goal/goalStore'

const SID = 'session-1'

function fresh(): GoalStore {
  return new GoalStore()
}

describe('GoalStore（对齐 dsh goal 生命周期）', () => {
  it('create → active，默认 maxRounds=10，roundsStarted=0', () => {
    const store = fresh()
    const goal = store.create(SID, '完成登录重构')
    expect(goal.phase).toBe('active')
    expect(goal.maxRounds).toBe(10)
    expect(goal.roundsStarted).toBe(0)
    expect(goal.objective).toBe('完成登录重构')
  })

  it('已存在目标再 create 报错', () => {
    const store = fresh()
    store.create(SID, '目标A')
    expect(() => store.create(SID, '目标B')).toThrow(GoalError)
  })

  it('objective 非空校验', () => {
    const store = fresh()
    expect(() => store.create(SID, '   ')).toThrow(GoalError)
    expect(() => store.create(SID, 42 as unknown as string)).toThrow(GoalError)
  })

  it('maxRounds 必须正整数', () => {
    const store = fresh()
    expect(() => store.create(SID, 'x', 0)).toThrow(GoalError)
    expect(() => store.create(SID, 'x', 2.5)).toThrow(GoalError)
  })

  it('edit 改 objective / maxRounds', () => {
    const store = fresh()
    store.create(SID, '旧目标', 5)
    const edited = store.edit(SID, { objective: '新目标', maxRounds: 8 })
    expect(edited.objective).toBe('新目标')
    expect(edited.maxRounds).toBe(8)
  })

  it('pause / resume 状态机', () => {
    const store = fresh()
    store.create(SID, 'x')
    expect(store.pause(SID).phase).toBe('paused')
    expect(() => store.pause(SID)).toThrow(GoalError) // 已 paused → 再 pause 报错
    expect(store.resume(SID).phase).toBe('active')
  })

  it('complete 为终态', () => {
    const store = fresh()
    store.create(SID, 'x')
    expect(store.complete(SID).phase).toBe('complete')
    expect(() => store.edit(SID, { objective: 'y' })).toThrow(GoalError)
  })

  it('block 需 code + message，并记录原因', () => {
    const store = fresh()
    store.create(SID, 'x')
    expect(() => store.block(SID, '', '原因')).toThrow(GoalError)
    const blocked = store.block(SID, 'dep-missing', '缺少依赖 Y')
    expect(blocked.phase).toBe('blocked')
    expect(blocked.blockReason).toEqual({ code: 'dep-missing', message: '缺少依赖 Y' })
  })

  it('bumpRound 只对 active 计数', () => {
    const store = fresh()
    store.create(SID, 'x')
    expect(store.bumpRound(SID)).toBe(1)
    store.pause(SID)
    expect(store.bumpRound(SID)).toBeNull()
  })

  it('clear 回到无目标', () => {
    const store = fresh()
    store.create(SID, 'x')
    store.clear(SID)
    expect(store.get(SID)).toBeNull()
  })

  it('formatGoalStatus 含阶段与轮次', () => {
    const store = fresh()
    const goal = store.create(SID, '做大事', 7)
    goal.roundsStarted = 3
    expect(formatGoalStatus(goal)).toContain('轮次 3/7')
    expect(formatGoalStatus(goal)).toContain('做大事')
  })
})
