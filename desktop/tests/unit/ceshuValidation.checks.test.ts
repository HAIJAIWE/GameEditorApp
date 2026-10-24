import { describe, expect, test, vi } from 'vitest'
import * as numericAssert from '../../src/shared/ceshuNumericAssert'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import {
  buildCheckContext,
  CESHU_CHECKS,
  validateCeshu,
  type CeshuCheckContext
} from '../../src/shared/ceshuValidation'
import type { CeshuDocument } from '../../src/shared/ceshuConstants'

/**
 * 守卫「校验注册表」（改造档3）：
 * - 注册表层级：id 列表稳定、可独立运行；
 * - 去重：一次 validateCeshu 只复算一次 evaluateAssertions；
 * - 完整性：逐项运行的长度之和 == validateCeshu 总长度（无重复、无遗漏）。
 */

const EXPECTED_IDS = [
  'requiredFields',
  'crossChapterConsistency',
  'contentQuality',
  'numericAssertions',
  'designClaims',
  'prototypeAcceptance',
  'testCaseList',
  'ledger'
]

function makeDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full' })
}

describe('CESHU_CHECKS 注册表', () => {
  test('id 列表与预期一致（新增检查需同步更新此处）', () => {
    expect(CESHU_CHECKS.map((check) => check.id)).toEqual(EXPECTED_IDS)
  })

  test('每项 run(ctx) 都可独立运行并返回数组', () => {
    const ctx = buildCheckContext(makeDoc())
    for (const check of CESHU_CHECKS) {
      const out = check.run(ctx)
      expect(Array.isArray(out)).toBe(true)
    }
  })

  test('逐项运行长度之和 == validateCeshu 总长度（无重复、无遗漏）', () => {
    const ctx = buildCheckContext(makeDoc())
    const sum = CESHU_CHECKS.reduce((acc, check) => acc + check.run(ctx).length, 0)
    expect(sum).toBe(validateCeshu(makeDoc()).length)
  })

  test('validateCeshu 只复算一次 evaluateAssertions（档3 去重）', () => {
    const spy = vi.spyOn(numericAssert, 'evaluateAssertions')
    validateCeshu(makeDoc())
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  test('designClaims 可独立运行：断言通过的主张不报错，断言不存在的报错', () => {
    const ctx: CeshuCheckContext = buildCheckContext(makeDoc())
    // 注入参数 + 一条复算通过的断言 + 一条「计算」主张指向它
    ctx.doc.numeric.numeric_parameters = ['主基地等级|30']
    ctx.doc.numeric.numeric_assertions = ['主基地产出|30|30']
    ctx.doc.numeric.design_claims = ['主基地达标|计算|主基地产出']

    // 重新构建上下文以纳入上面注入的参数（断言结论依赖参数表）
    const ctx2 = buildCheckContext(ctx.doc)
    const claimCheck = CESHU_CHECKS.find((check) => check.id === 'designClaims')!
    expect(claimCheck.run(ctx2)).toHaveLength(0)

    ctx2.doc.numeric.design_claims = ['虚构主张|计算|不存在的断言']
    expect(claimCheck.run(ctx2).some((m) => m.includes('不在数值断言表中'))).toBe(true)
  })
})
