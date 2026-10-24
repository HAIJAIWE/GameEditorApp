import { describe, expect, it } from 'vitest'

import { checkLedger, checkPrototypeAcceptanceResults, checkTestCaseList, normalizeAcceptanceResult } from '../../src/shared/ceshuEvidence'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import { validateCeshu } from '../../src/shared/ceshuValidation'

describe('checkTestCaseList：用例清单', () => {
  function docWithCases(rows: string[]) {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.qa.test_case_list = rows
    return doc
  }

  it('合法用例（正常/边界/恢复/滥用 × 待执行/通过）→ 无消息', () => {
    const doc = docWithCases([
      '首杀得金币|正常|新游戏层1|等待两次击杀|金币≥5|待执行',
      '金币不足拒绝升级|边界|金币3|点游侠升级|拒绝且无状态变化|通过',
      '断线恢复|恢复|存档8小时前|重载页面|离线收益结算一次|待执行',
      '连点转生|滥用|层30|连点转生按钮|只结算一次|待执行'
    ])
    expect(checkTestCaseList(doc)).toEqual([])
  })

  it('英文类型/状态也认', () => {
    const doc = docWithCases(['caseA|boundary|pre|act|exp|passed'])
    expect(checkTestCaseList(doc)).toEqual([])
  })

  it('类型非法 → 一致性警告', () => {
    const messages = checkTestCaseList(docWithCases(['某用例|随便|前置|操作|期望|待执行']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('一致性警告')
    expect(messages[0]).toContain('类型「随便」无法识别')
  })

  it('状态非法 → 一致性警告', () => {
    const messages = checkTestCaseList(docWithCases(['某用例|正常|前置|操作|期望|搞定']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('状态「搞定」无法识别')
  })

  it('失败用例 → 警告（不该当完成态）', () => {
    const messages = checkTestCaseList(docWithCases(['某用例|正常|前置|操作|期望|失败']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('状态为失败')
  })

  it('缺前置/操作/期望 → 警告并列出缺哪列', () => {
    const messages = checkTestCaseList(docWithCases(['某用例|正常||点按钮||待执行']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('缺少 前置、期望')
  })

  it('空清单 → 静默', () => {
    expect(checkTestCaseList(createDefaultCeshu({ scope: 'full' }))).toEqual([])
  })
})

describe('checkLedger：经济账本对账', () => {
  function docWithLedger(rows: string[]) {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.economy.ledger = rows
    return doc
  }

  it('逐笔求和对得上 → 无消息（首局 0+4+4-5=3）', () => {
    expect(checkLedger(docWithLedger(['首局|0|4,4,-5|3']))).toEqual([])
  })

  it('对不上 → 一致性冲突，消息含求和过程', () => {
    const messages = checkLedger(docWithLedger(['首局|0|4,4,-5|5']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('一致性冲突')
    expect(messages[0]).toContain('对不上')
    expect(messages[0]).toContain('期末期望 5')
  })

  it('中间余额为负且不允许 → 警告', () => {
    const messages = checkLedger(docWithLedger(['贷款|10|-15,10|5']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('一致性警告')
    expect(messages[0]).toContain('余额变为 -5')
  })

  it('允许为负 → 不警告', () => {
    expect(checkLedger(docWithLedger(['贷款|10|-15,10|5|是']))).toEqual([])
  })

  it('列数不足/非数字 → 格式异常', () => {
    expect(checkLedger(docWithLedger(['短|0|4']))[0]).toContain('格式异常')
    expect(checkLedger(docWithLedger(['坏|零|4|4']))[0]).toContain('不是数字')
    expect(checkLedger(docWithLedger(['坏|0|4,abc|4']))[0]).toContain('含非数字')
  })

  it('空账本 → 静默', () => {
    expect(checkLedger(createDefaultCeshu({ scope: 'full' }))).toEqual([])
  })
})

describe('validateCeshu 集成：用例与账本进入校验链', () => {
  it('两类问题都能从 validateCeshu 里看到', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.qa.test_case_list = ['某用例|随便|前置|操作|期望|待执行']
    doc.economy.ledger = ['首局|0|4,4,-5|5']
    const messages = validateCeshu(doc)
    expect(messages.some((m) => m.includes('用例「某用例」'))).toBe(true)
    expect(messages.some((m) => m.includes('账本「首局」'))).toBe(true)
  })
})

describe('normalizeAcceptanceResult：验收结果列受控枚举归一（2026-10-24 收敛）', () => {
  it('受控三值 + 英文等价 + 合法中间态', () => {
    expect(normalizeAcceptanceResult('通过')).toBe('pass')
    expect(normalizeAcceptanceResult('pass')).toBe('pass')
    expect(normalizeAcceptanceResult('passed')).toBe('pass')
    expect(normalizeAcceptanceResult('未通过')).toBe('fail')
    expect(normalizeAcceptanceResult('失败')).toBe('fail')
    expect(normalizeAcceptanceResult('failed')).toBe('fail')
    expect(normalizeAcceptanceResult('部分通过')).toBe('partial')
    expect(normalizeAcceptanceResult('partial')).toBe('partial')
    expect(normalizeAcceptanceResult('待确认')).toBe('pending')
    expect(normalizeAcceptanceResult('pending')).toBe('pending')
  })

  it('旧自由文本兜底：模糊含通过不放水（fail/partial），其余 invalid', () => {
    expect(normalizeAcceptanceResult('未通过（手速不够）')).toBe('fail')
    expect(normalizeAcceptanceResult('基本通过')).toBe('partial')
    expect(normalizeAcceptanceResult('已完成')).toBe('invalid')
    expect(normalizeAcceptanceResult('感觉不错')).toBe('invalid')
    expect(normalizeAcceptanceResult('')).toBe('invalid')
  })
})

describe('checkPrototypeAcceptanceResults：原型验收结果列受控枚举', () => {
  function docWithAcceptance(rows: string[]) {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.qa.prototype_acceptance = rows
    return doc
  }

  it('受控三值与合法中间态 → 无消息', () => {
    const doc = docWithAcceptance([
      'Demo 首关计时|通过|平均 28 秒完成首单',
      'Boss 战压力测试|未通过|平均 95 秒',
      '手感到位|部分通过|12 人试玩 8 人认可',
      '全流程压测|待确认|排期下周'
    ])
    expect(checkPrototypeAcceptanceResults(doc)).toEqual([])
  })

  it('英文等价 → 无消息', () => {
    expect(checkPrototypeAcceptanceResults(docWithAcceptance(['Demo 检查|passed|截图']))).toEqual([])
  })

  it('无法识别的写法 → 一致性警告', () => {
    const messages = checkPrototypeAcceptanceResults(docWithAcceptance(['首关计时|搞定|28 秒']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('一致性警告')
    expect(messages[0]).toContain('无法识别')
    expect(messages[0]).toContain('通过/未通过/部分通过')
  })

  it('空表/缺结果列 → 静默', () => {
    expect(checkPrototypeAcceptanceResults(createDefaultCeshu({ scope: 'full' }))).toEqual([])
    expect(checkPrototypeAcceptanceResults(docWithAcceptance(['只有检查项|']))).toEqual([])
  })

  it('validateCeshu 集成：非法结果列进入校验链', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.qa.prototype_acceptance = ['首关计时|搞定|28 秒']
    expect(validateCeshu(doc).some((m) => m.includes('原型验收「首关计时」'))).toBe(true)
  })
})
