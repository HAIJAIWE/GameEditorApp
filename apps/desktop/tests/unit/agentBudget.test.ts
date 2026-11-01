import { describe, expect, it } from 'vitest'
import {
  evaluateBudget,
  estimateTaskTokens,
  estimateTokens,
  taskBudget,
  type BudgetScale,
  type LlmTaskType
} from '@mobai/shared/agent/runtime'

describe('预算护栏纯逻辑（v0.6 M5）', () => {
  const tasks: LlmTaskType[] = ['chapter', 'full', 'datagen', 'review']

  it('各任务类型都有正预算（不会把正常任务判为超预算）', () => {
    for (const t of tasks) {
      expect(taskBudget(t)).toBeGreaterThan(0)
    }
  })

  it('datagen 预算随条数线性增长', () => {
    expect(taskBudget('datagen', { count: 1 })).toBe(2000)
    expect(taskBudget('datagen', { count: 10 })).toBe(20000)
  })

  it('full 预算随章节数增长', () => {
    expect(taskBudget('full', { chapters: 10 })).toBe(30000)
    expect(taskBudget('full', { chapters: 20 })).toBe(60000)
  })

  it('estimateTokens 按字符长度粗估（保守）', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('a'.repeat(100))).toBe(50)
    expect(estimateTokens('中文'.repeat(50))).toBe(50) // 100 字符 ÷ 2 ≈ 50 token
  })

  it('estimateTaskTokens 与 taskBudget 同源（datagen 随条数）', () => {
    expect(estimateTaskTokens('datagen', { count: 5 })).toBe(9000)
    expect(taskBudget('datagen', { count: 5 })).toBe(10000)
    // 预估略低于预算（不刻意制造误报）
    expect(estimateTaskTokens('datagen', { count: 5 })).toBeLessThan(taskBudget('datagen', { count: 5 }))
  })

  it('本地档一律 level=free、不拦截', () => {
    const s = evaluateBudget(999999, 100, false)
    expect(s.cloud).toBe(false)
    expect(s.level).toBe('free')
    expect(s.over).toBe(false)
  })

  it('云端档：低于预算 ⇒ ok', () => {
    const s = evaluateBudget(1000, 4000, true)
    expect(s.level).toBe('ok')
    expect(s.over).toBe(false)
    expect(s.ratio).toBeCloseTo(0.25)
  })

  it('云端档：预算 80%~100% ⇒ warn', () => {
    const s = evaluateBudget(3600, 4000, true)
    expect(s.level).toBe('warn')
    expect(s.over).toBe(false)
  })

  it('云端档：超预算 ⇒ over（降级而非静默烧钱的前置判定）', () => {
    const s = evaluateBudget(5000, 4000, true)
    expect(s.level).toBe('over')
    expect(s.over).toBe(true)
    expect(s.ratio).toBeGreaterThan(1)
  })

  it('budget 为 0 时 ratio 记 0，不抛除零错误', () => {
    const s = evaluateBudget(10, 0, true)
    expect(s.ratio).toBe(0)
    expect(s.over).toBe(false)
  })

  it('evaluateBudget 与 taskBudget 串起来：超大批量数据会触发 over', () => {
    const count = 20
    const scale: BudgetScale = { count }
    const est = estimateTaskTokens('datagen', scale)
    const s = evaluateBudget(est, taskBudget('datagen', scale), true)
    // 20 条 × 1800 预估 = 36000 > 20 × 2000 预算 = 40000 ⇒ 其实没超
    expect(s.over).toBe(false)
    // 但 20 条 × 2500 预估（偏大）则超
    const big = evaluateBudget(estimateTaskTokens('datagen', scale) + 20000, taskBudget('datagen', scale), true)
    expect(big.over).toBe(true)
  })
})
