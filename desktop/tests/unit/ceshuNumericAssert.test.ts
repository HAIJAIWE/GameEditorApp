import { describe, expect, it } from 'vitest'

import {
  checkDesignClaims,
  checkNumericAssertions,
  evaluateExpression,
  extractIdentifiers,
  parseAcceptance,
  parseNumericParameters,
  parseParameterNames,
  parseParameterValue
} from '../../src/shared/ceshuNumericAssert'
import { validateCeshu } from '../../src/shared/ceshuValidation'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import type { CeshuDocument } from '../../src/shared/ceshuConstants'

/** 构造只填数值两章的文档（其余章留空，避免必填噪音干扰断言检查） */
function docWithNumeric(parameters: string[], assertions: string[]): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  doc.numeric.numeric_parameters = parameters
  doc.numeric.numeric_assertions = assertions
  return doc
}

describe('parseParameterValue：当前值格取数', () => {
  it('纯数字直接取', () => {
    expect(parseParameterValue('10')).toBe(10)
    expect(parseParameterValue('1.28')).toBe(1.28)
    expect(parseParameterValue('0.5')).toBe(0.5)
  })

  it('带单位/前缀取首个数字', () => {
    expect(parseParameterValue('4次/秒')).toBe(4)
    expect(parseParameterValue('×1.2')).toBe(1.2)
    expect(parseParameterValue('约0.5')).toBe(0.5)
    expect(parseParameterValue('10层/星火')).toBe(10)
    expect(parseParameterValue('6小时')).toBe(6)
  })

  it('无数值（待确认）→ null', () => {
    expect(parseParameterValue('待确认')).toBeNull()
    expect(parseParameterValue('')).toBeNull()
    expect(parseParameterValue('由策划定')).toBeNull()
  })
})

describe('parseNumericParameters / parseParameterNames', () => {
  it('跳过无数值的行；有名无数仍登记名字', () => {
    const rows = ['怪物基础HP|10|1-100|a|b', '星火加成|待确认|1-2|a|b', '|5|...']
    expect([...parseNumericParameters(rows)]).toEqual([['怪物基础HP', 10]])
    expect([...parseParameterNames(rows)]).toEqual(['怪物基础HP', '星火加成'])
  })

  it('非字符串行跳过', () => {
    expect(parseNumericParameters([42, null, { a: 1 }]).size).toBe(0)
  })
})

describe('evaluateExpression：安全求值', () => {
  const params = new Map([
    ['星火步长', 10],
    ['星火加成', 1.25],
    ['怪物HP成长', 1.28],
    ['贝壳币成长', 1.22]
  ])

  it('四则运算与优先级', () => {
    expect(evaluateExpression('1+2*3', params)).toEqual({ ok: true, value: 7 })
    expect(evaluateExpression('(1+2)*3', params)).toEqual({ ok: true, value: 9 })
    expect(evaluateExpression('10-2-3', params)).toEqual({ ok: true, value: 5 })
    expect(evaluateExpression('8/2/2', params)).toEqual({ ok: true, value: 2 })
  })

  it('幂右结合、负号与负指数', () => {
    expect(evaluateExpression('2^3^2', params)).toEqual({ ok: true, value: 512 })
    expect(evaluateExpression('-2^2', params)).toEqual({ ok: true, value: -4 })
    expect(evaluateExpression('2^-1', params)).toEqual({ ok: true, value: 0.5 })
  })

  it('白名单函数与中文参数名', () => {
    expect(evaluateExpression('floor((35-1)/星火步长)', params)).toEqual({ ok: true, value: 3 })
    expect(evaluateExpression('ceil(5/4)', params)).toEqual({ ok: true, value: 2 })
    expect(evaluateExpression('min(3,5,1)', params)).toEqual({ ok: true, value: 1 })
    expect(evaluateExpression('pow(星火加成,3)', params)).toEqual({ ok: true, value: 1.953125 })
    expect(evaluateExpression('(怪物HP成长^10)-(贝壳币成长^10)', params).ok).toBe(true)
  })

  it('参数代入与浮点尾差', () => {
    const result = evaluateExpression('0.1+0.2', new Map())
    expect(result.ok && Math.abs(result.value - 0.3) < 1e-9).toBe(true)
  })

  it('错误可读不抛：未登记参数 / 语法 / 除零 / 非白名单函数', () => {
    expect(evaluateExpression('未登记的+1', params)).toEqual({ ok: false, error: "未登记的参数 '未登记的'" })
    expect(evaluateExpression('1+', params).ok).toBe(false)
    expect(evaluateExpression('(1+2', params).ok).toBe(false)
    expect(evaluateExpression('1/0', params).ok).toBe(false)
    expect(evaluateExpression('process.exit(1)', params).ok).toBe(false)
    expect(evaluateExpression('constructor("x")', params).ok).toBe(false)
    expect(evaluateExpression('', params)).toEqual({ ok: false, error: '表达式为空' })
  })

  it('深度嵌套被拒（栈保护）', () => {
    const deep = '('.repeat(200) + '1' + ')'.repeat(200)
    expect(evaluateExpression(deep, params).ok).toBe(false)
  })

  it('超长表达式被拒', () => {
    const long = '1+'.repeat(150) + '1'
    expect(evaluateExpression(long, params).ok).toBe(false)
  })
})

describe('extractIdentifiers：剔除函数名', () => {
  it('只留参数引用', () => {
    expect(extractIdentifiers('floor((35-1)/星火步长)+pow(星火加成,3)')).toEqual(['星火步长', '星火加成'])
    expect(extractIdentifiers('1+2')).toEqual([])
  })
})

describe('parseAcceptance：接受条件', () => {
  it('比较运算与区间', () => {
    expect(parseAcceptance('==2')).toEqual({ op: '==', value: 2 })
    expect(parseAcceptance('>= 0')).toEqual({ op: '>=', value: 0 })
    expect(parseAcceptance('<10')).toEqual({ op: '<', value: 10 })
    expect(parseAcceptance('between 1.5-2.5')).toEqual({ op: 'between', min: 1.5, max: 2.5 })
    expect(parseAcceptance('between -1~2')).toEqual({ op: 'between', min: -1, max: 2 })
  })

  it('空或无法识别 → null（跳过该项判定）', () => {
    expect(parseAcceptance('')).toBeNull()
    expect(parseAcceptance('看心情')).toBeNull()
  })
})

describe('checkNumericAssertions：断言复算', () => {
  it('一致 → 无消息', () => {
    const doc = docWithNumeric(
      ['星火步长|10|5-50|稀|密', '星火加成|1.25|1.05-2|强|弱'],
      ['首转生恰得3星火|floor((35-1)/星火步长)|3|0|==3', '三星火加成|星火加成^3|1.95|0.01|between 1.5-2.5']
    )
    expect(checkNumericAssertions(doc)).toEqual([])
  })

  it('复算值与声明不符 → 一致性冲突（error 级措辞）', () => {
    // 验收条件设为恒真（>=0），隔离出「复算不符」这一条
    const doc = docWithNumeric(
      ['星火步长|10|5-50|稀|密'],
      ['首转生星火数|floor((35-1)/星火步长)|4|0|>=0']
    )
    const messages = checkNumericAssertions(doc)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('一致性冲突')
    expect(messages[0]).toContain('复算不符')
    expect(messages[0]).toContain('计算得 3')
    expect(messages[0]).toContain('声明 4')
  })

  it('声明值与验收条件双双失真 → 两条都报（同一违背的两个视角）', () => {
    const doc = docWithNumeric(
      ['星火步长|10|5-50|稀|密'],
      ['首转生星火数|floor((35-1)/星火步长)|4|0|==4']
    )
    const messages = checkNumericAssertions(doc)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain('复算不符')
    expect(messages[1]).toContain('未通过验收条件')
  })

  it('容差内不算冲突', () => {
    const doc = docWithNumeric(
      ['怪物HP成长|1.28|1.1-2|陡|缓', '贝壳币成长|1.22|1.05-2|晚|早'],
      ['血量增速快于币速|(怪物HP成长^10)-(贝壳币成长^10)|4.5|0.5|>=0']
    )
    expect(checkNumericAssertions(doc)).toEqual([])
  })

  it('验收条件不通过 → 一致性冲突', () => {
    const doc = docWithNumeric(
      ['怪物HP成长|1.28|1.1-2|陡|缓', '贝壳币成长|1.22|1.05-2|晚|早'],
      ['血量必快于币速|(怪物HP成长^10)-(贝壳币成长^10)|4.5|0.5|>=100']
    )
    const messages = checkNumericAssertions(doc)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('未通过验收条件')
    expect(messages[0]).toContain('>=100')
  })

  it('引用未登记参数 → 格式异常', () => {
    const doc = docWithNumeric(['星火步长|10|5-50|稀|密'], ['微光加成|微光加成^2|1.44|0|==1.44'])
    const messages = checkNumericAssertions(doc)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('格式异常')
    expect(messages[0]).toContain("未登记的参数 '微光加成'")
  })

  it('依赖参数「待确认」→ 复算跳过（warning 级，不惩罚）', () => {
    const doc = docWithNumeric(['星火加成|待确认|1.05-2|强|弱'], ['三星火加成|星火加成^3|1.95|0.01|between 1.5-2.5'])
    const messages = checkNumericAssertions(doc)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('复算跳过')
    expect(messages[0]).not.toContain('一致性冲突')
  })

  it('无断言行 / 表达式为空 → 静默跳过', () => {
    expect(checkNumericAssertions(docWithNumeric(['星火步长|10'], []))).toEqual([])
    expect(checkNumericAssertions(docWithNumeric(['星火步长|10'], ['只有断言没有表达式']))).toEqual([])
  })
})

describe('validateCeshu 集成：断言检查进入校验链', () => {
  it('复算不符的断言出现在 validateCeshu 结果里（计入 error 统计）', () => {
    const doc = docWithNumeric(['星火步长|10|5-50|稀|密'], ['首转生星火数|floor((35-1)/星火步长)|4|0|==4'])
    const messages = validateCeshu(doc)
    const hit = messages.filter((message) => message.includes('复算不符'))
    expect(hit).toHaveLength(1)
  })

  it('只填数值两章时，断言相关消息不引入额外必填噪音', () => {
    const doc = docWithNumeric(
      ['星火步长|10|5-50|稀|密'],
      ['首转生恰得3星火|floor((35-1)/星火步长)|3|0|==3']
    )
    const messages = validateCeshu(doc)
    expect(messages.filter((message) => message.includes('数值断言'))).toEqual([])
  })
})

describe('checkDesignClaims：claim → 证据核对', () => {
  const parameters = ['星火步长|10|5-50|稀|密', '星火加成|1.25|1.05-2|强|弱']
  const assertions = [
    '首转生恰得3星火|floor((35-1)/星火步长)|3|0|==3',
    '三星火加成|星火加成^3|1.95|0.01|between 1.5-2.5'
  ]

  function docWithClaims(claims: string[], assertionRows = assertions): CeshuDocument {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.numeric.numeric_parameters = parameters
    doc.numeric.numeric_assertions = assertionRows
    doc.numeric.design_claims = claims
    return doc
  }

  it('计算类主张挂到通过的断言 → 无消息', () => {
    expect(checkDesignClaims(docWithClaims(['首转生恰得3星火|计算|首转生恰得3星火']))).toEqual([])
  })

  it('证据断言不存在 → 一致性冲突（无法复算）', () => {
    const messages = checkDesignClaims(docWithClaims(['某个主张|计算|不存在的断言']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('一致性冲突')
    expect(messages[0]).toContain('不在数值断言表中')
  })

  it('证据断言复算不过 → 一致性冲突（主张不成立）', () => {
    const bad = ['首转生恰得3星火|floor((35-1)/星火步长)|9|0|==3']
    const messages = checkDesignClaims(docWithClaims(['首转生恰得3星火|计算|首转生恰得3星火'], bad))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('主张不成立')
  })

  it('实测/假设类主张：证据非空即通过，空证据告警', () => {
    expect(checkDesignClaims(docWithClaims(['30 秒内理解核心循环|实测|Demo 首关计时'])).length).toBe(0)
    expect(checkDesignClaims(docWithClaims(['次留 35%|假设|首测验证']))).toHaveLength(0)
    const empty = checkDesignClaims(docWithClaims(['没有证据的主张|假设|']))
    expect(empty).toHaveLength(1)
    expect(empty[0]).toContain('一致性警告')
    expect(empty[0]).toContain('没有证据')
  })

  it('强度无法识别 → 一致性警告', () => {
    const messages = checkDesignClaims(docWithClaims(['某主张|感觉|断言A']))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('无法识别')
  })

  it('无 claims 字段 → 静默', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(checkDesignClaims(doc)).toEqual([])
  })

  it('英文强度也认（calculated / tested / assumed）', () => {
    expect(checkDesignClaims(docWithClaims(['主张A|calculated|首转生恰得3星火'])).length).toBe(0)
    expect(checkDesignClaims(docWithClaims(['主张B|tested|试玩'])).length).toBe(0)
  })
})
