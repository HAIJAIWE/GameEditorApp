import { describe, expect, it } from 'vitest'

import { evaluateAttrPanel, type AttrPanelRow } from '../../src/shared/domain/attr/attrPanel'
import {
  BASE_ATTR_EFFECTS,
  DEFAULT_BASE_ATTRS,
  buildFormulaFromCoeffs,
  defaultCoeffsFor,
  formatCoeff,
  initialEntries,
  parseFormulaToCoeffs,
  resolveBuilderAttrs
} from '../../src/shared/util/data/formulaBuilder'

describe('formulaBuilder：常量表照抄保真', () => {
  it('BASE_ATTR_EFFECTS 与 旧版 逐字一致（16 项，键名含斜杠）', () => {
    expect(Object.keys(BASE_ATTR_EFFECTS)).toHaveLength(16)
    expect(BASE_ATTR_EFFECTS['HP']).toEqual({ 力量: 10, 体质: 20, 敏捷: 5 })
    expect(BASE_ATTR_EFFECTS['物防']).toEqual({ 力量: 0.5, 敏捷: 0.5, 体质: 2 })
    // 旧版 里这两项的键带斜杠；曾被误写成「回血每回合」，此断言即回归锁
    expect(Object.keys(BASE_ATTR_EFFECTS)).toContain('回血/回合')
    expect(Object.keys(BASE_ATTR_EFFECTS)).toContain('回蓝/回合')
    expect(BASE_ATTR_EFFECTS['经验值']).toEqual({})
  })

  it('defaultCoeffsFor：命中的派生属性给默认系数，未命中给空表', () => {
    expect(defaultCoeffsFor('HP')).toEqual({ 力量: 10, 体质: 20, 敏捷: 5 })
    expect(defaultCoeffsFor('经验值')).toEqual({})
    expect(defaultCoeffsFor('不存在的属性')).toEqual({})
    expect(defaultCoeffsFor('  速度  ')).toEqual({ 敏捷: 2 })
  })
})

describe('formulaBuilder：系数格式化', () => {
  it('整数不带小数点，小数按 1 位输出', () => {
    expect(formatCoeff(10)).toBe('10')
    expect(formatCoeff(10.0)).toBe('10')
    expect(formatCoeff(0.5)).toBe('0.5')
    expect(formatCoeff(-1)).toBe('-1')
    expect(formatCoeff(-0.4)).toBe('-0.4')
    expect(formatCoeff(2.5)).toBe('2.5')
  })

  it('浮点残渣按 1 位小数规范化', () => {
    expect(formatCoeff(0.1 + 0.2)).toBe('0.3')
    expect(formatCoeff(0.30000000000000004)).toBe('0.3')
  })

  it('非有限值回落 0，不产出 NaN/Infinity 字样', () => {
    expect(formatCoeff(Number.NaN)).toBe('0')
    expect(formatCoeff(Number.POSITIVE_INFINITY)).toBe('0')
  })
})

describe('formulaBuilder：系数 → 公式', () => {
  it('跳过 0 系数，空则返回 =0', () => {
    expect(buildFormulaFromCoeffs([])).toBe('=0')
    expect(buildFormulaFromCoeffs([{ name: '力量', coeff: 0 }])).toBe('=0')
    expect(
      buildFormulaFromCoeffs([
        { name: '力量', coeff: 10 },
        { name: '智力', coeff: 0 },
        { name: '体质', coeff: 20 }
      ])
    ).toBe('=力量*10+体质*20')
  })

  it('顺序完全按 entries（不是固定属性表顺序）', () => {
    expect(
      buildFormulaFromCoeffs([
        { name: '体质', coeff: 20 },
        { name: '力量', coeff: 10 },
        { name: '敏捷', coeff: 5 }
      ])
    ).toBe('=体质*20+力量*10+敏捷*5')
  })

  it('负系数产出「属性*-1」，与 旧版 写法一致', () => {
    expect(buildFormulaFromCoeffs([{ name: '敏捷', coeff: -1 }])).toBe('=敏捷*-1')
    expect(
      buildFormulaFromCoeffs([
        { name: '力量', coeff: 2 },
        { name: '敏捷', coeff: -0.5 }
      ])
    ).toBe('=力量*2+敏捷*-0.5')
  })

  it('回归锁：非默认属性的系数不会被丢弃', () => {
    // 旧版 迭代的是类常量 BASE_ATTRS（恒为力量/智力/敏捷/体质），
    // 实测「幸运」系数设 7 后 get_formula() 仍返回 '=力量*2+敏捷*1'
    const formula = buildFormulaFromCoeffs([
      { name: '幸运', coeff: 7 },
      { name: '力量', coeff: 2 }
    ])
    expect(formula).toBe('=幸运*7+力量*2')
    expect(formula).toContain('幸运')
  })
})

describe('formulaBuilder：公式 → 系数（回填）', () => {
  const ATTRS = ['力量', '智力', '敏捷', '体质']

  it('解析线性式并按词表顺序补 0', () => {
    expect(parseFormulaToCoeffs('=力量*10+体质*20+敏捷*5', ATTRS)).toEqual({
      ok: true,
      entries: [
        { name: '力量', coeff: 10 },
        { name: '智力', coeff: 0 },
        { name: '敏捷', coeff: 5 },
        { name: '体质', coeff: 20 }
      ]
    })
  })

  it('容忍省略 = 前导、空白与「系数*属性」的等价写法', () => {
    expect(parseFormulaToCoeffs('力量*10', ATTRS)).toEqual({
      ok: true,
      entries: [
        { name: '力量', coeff: 10 },
        { name: '智力', coeff: 0 },
        { name: '敏捷', coeff: 0 },
        { name: '体质', coeff: 0 }
      ]
    })
    expect(parseFormulaToCoeffs(' = 力量 * 10 + 体质 * 20 ', ATTRS)).toEqual({
      ok: true,
      entries: [
        { name: '力量', coeff: 10 },
        { name: '智力', coeff: 0 },
        { name: '敏捷', coeff: 0 },
        { name: '体质', coeff: 20 }
      ]
    })
    expect(parseFormulaToCoeffs('=10*力量', ATTRS)).toEqual({
      ok: true,
      entries: [
        { name: '力量', coeff: 10 },
        { name: '智力', coeff: 0 },
        { name: '敏捷', coeff: 0 },
        { name: '体质', coeff: 0 }
      ]
    })
  })

  it('往返数值一致：重建后项顺序按属性列表归一', () => {
    const text = '=力量*10+体质*20+敏捷*5'
    const parsed = parseFormulaToCoeffs(text, ATTRS)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    // 顺序被归一为属性列表顺序（力量/智力/敏捷/体质）；数值等价，但**不保证原文逐字一致**。
    // 实证 旧版 同此行为：current_attr=HP 时 get_formula() = '=力量*10+敏捷*5+体质*20'
    expect(buildFormulaFromCoeffs(parsed.entries)).toBe('=力量*10+敏捷*5+体质*20')
  })

  it('照抄 旧版 实测输出（offscreen 实跑取证）', () => {
    const defaults = (derived: string): string =>
      buildFormulaFromCoeffs(initialEntries(ATTRS, '', derived).entries)
    expect(defaults('HP')).toBe('=力量*10+敏捷*5+体质*20')
    expect(defaults('物攻')).toBe('=力量*2+敏捷*1')
    expect(defaults('物防')).toBe('=力量*0.5+敏捷*0.5+体质*2')
    expect(defaults('速度')).toBe('=敏捷*2')
  })

  it('无法无损表示的形态一律明确拒绝（不静默清零）', () => {
    expect(parseFormulaToCoeffs('', ATTRS)).toEqual({ ok: false, reason: '公式为空' })
    expect(parseFormulaToCoeffs('=', ATTRS)).toEqual({ ok: false, reason: '公式为空' })
    expect(parseFormulaToCoeffs('0', ATTRS)).toEqual({
      ok: false,
      reason: '公式是纯常量，没有可配置的系数'
    })
    expect(parseFormulaToCoeffs('=100', ATTRS)).toEqual({
      ok: false,
      reason: '公式是纯常量，没有可配置的系数'
    })
    // 常量项：本编辑器没有常量输入位，重建会丢
    expect(parseFormulaToCoeffs('=力量*10+50', ATTRS).ok).toBe(false)
    expect(parseFormulaToCoeffs('=不存在*2', ATTRS)).toEqual({
      ok: false,
      reason: '公式引用了未知属性「不存在」'
    })
    // 重复属性无法回填为单一系数
    expect(parseFormulaToCoeffs('=力量*10+力量*20', ATTRS)).toEqual({
      ok: false,
      reason: '属性「力量」在公式中出现多次，无法回填为单一系数'
    })
    // 括号 / 除法 / 幂 / 函数
    expect(parseFormulaToCoeffs('=(力量+体质)*2', ATTRS).ok).toBe(false)
    expect(parseFormulaToCoeffs('=力量/2', ATTRS).ok).toBe(false)
    expect(parseFormulaToCoeffs('=力量**2', ATTRS).ok).toBe(false)
    expect(parseFormulaToCoeffs('=max(力量,体质)', ATTRS).ok).toBe(false)
    expect(parseFormulaToCoeffs('=力量*10-敏捷*5', ATTRS).ok).toBe(false)
    // 系数位不是数字
    expect(parseFormulaToCoeffs('=力量*体质', ATTRS)).toEqual({
      ok: false,
      reason: '项「力量*体质」的系数不是数字'
    })
  })
})

describe('formulaBuilder：打开编辑器时的初始状态', () => {
  const ATTRS = ['力量', '智力', '敏捷', '体质']

  it('回归锁：回填原公式真实系数，而非用默认系数表顶替', () => {
    // 旧版 实测：传 current_formula='=智力*5'、current_attr='物攻' 时，
    // 对话框显示的是默认系数 '=力量*2+敏捷*1' —— 点确定即覆盖用户原公式
    const initial = initialEntries(ATTRS, '=智力*5', '物攻')
    expect(initial.warning).toBeNull()
    expect(initial.entries).toEqual([
      { name: '力量', coeff: 0 },
      { name: '智力', coeff: 5 },
      { name: '敏捷', coeff: 0 },
      { name: '体质', coeff: 0 }
    ])
    expect(buildFormulaFromCoeffs(initial.entries)).toBe('=智力*5')
    // 绝不能出现物攻的默认系数
    expect(buildFormulaFromCoeffs(initial.entries)).not.toContain('力量*2')
  })

  it('空公式才用默认系数起手', () => {
    for (const empty of ['', '0', '=0']) {
      const initial = initialEntries(ATTRS, empty, 'HP')
      expect(initial.warning).toBeNull()
      // 顺序 = 属性列表顺序
      expect(buildFormulaFromCoeffs(initial.entries)).toBe('=力量*10+敏捷*5+体质*20')
    }
    expect(initialEntries(ATTRS, '', '经验值').entries).toEqual([
      { name: '力量', coeff: 0 },
      { name: '智力', coeff: 0 },
      { name: '敏捷', coeff: 0 },
      { name: '体质', coeff: 0 }
    ])
  })

  it('无法回填时给明确警告且系数全 0（不静默用默认值造成覆盖假象）', () => {
    const initial = initialEntries(ATTRS, '=(力量+体质)*2', 'HP')
    expect(initial.entries.every((entry) => entry.coeff === 0)).toBe(true)
    expect(initial.warning).toContain('=(力量+体质)*2')
    expect(initial.warning).toContain('无法用系数编辑器表示')
    // 警告里必须引用原文，用户才能核对将要被替换的内容
    expect(initial.warning).toContain('替换')
  })

  it('回归锁：属性集合来自调用方，非硬编码四项', () => {
    const available = ['力量', '智力', '敏捷', '体质', '幸运']
    const initial = initialEntries(available, '=幸运*7', '物攻')
    expect(initial.warning).toBeNull()
    expect(initial.entries.map((entry) => entry.name)).toContain('幸运')
    expect(buildFormulaFromCoeffs(initial.entries)).toBe('=幸运*7')
    // 旧版 实测：传 5 个属性（含幸运）时表格只显示硬编码 4 个
    expect(initial.entries).toHaveLength(5)
  })
})

describe('formulaBuilder：属性列表解析', () => {
  it('去空白、去空串、同名保留首次出现', () => {
    expect(resolveBuilderAttrs([' 力量 ', '', '   ', '幸运', '力量'])).toEqual(['力量', '幸运'])
  })

  it('为空或全空串时回落默认四项', () => {
    expect(resolveBuilderAttrs([])).toEqual([...DEFAULT_BASE_ATTRS])
    expect(resolveBuilderAttrs(['', '  '])).toEqual([...DEFAULT_BASE_ATTRS])
    expect(resolveBuilderAttrs(null)).toEqual([...DEFAULT_BASE_ATTRS])
    expect(resolveBuilderAttrs(undefined)).toEqual([...DEFAULT_BASE_ATTRS])
  })
})

describe('formulaBuilder × attrPanel：产物必须真能被既有求值器消费', () => {
  it('系数编辑器产出的公式在属性面板中算得出正确数值', () => {
    // 力量 10 / 敏捷 4 / 体质 5，HP = 10*10 + 4*5 + 5*20 = 220
    const rows: AttrPanelRow[] = [
      { name: '力量', category: '基础', formula: '10' },
      { name: '敏捷', category: '基础', formula: '4' },
      { name: '体质', category: '基础', formula: '5' },
      { name: 'HP', category: '战斗', formula: '=0' }
    ]
    const built = buildFormulaFromCoeffs([
      { name: '力量', coeff: 10 },
      { name: '敏捷', coeff: 5 },
      { name: '体质', coeff: 20 }
    ])
    expect(built).toBe('=力量*10+敏捷*5+体质*20')

    rows[3].formula = built
    const evaluation = evaluateAttrPanel(rows)
    expect(evaluation.errors).toEqual([null, null, null, null])
    expect(evaluation.values[3]).toBe(220)
  })

  it('负系数公式同样可被求值器解析（=敏捷*-1 不是坏式子）', () => {
    const built = buildFormulaFromCoeffs([
      { name: '敏捷', coeff: -1 },
      { name: '力量', coeff: 2 }
    ])
    expect(built).toBe('=敏捷*-1+力量*2')

    const rows: AttrPanelRow[] = [
      { name: '力量', category: '基础', formula: '10' },
      { name: '敏捷', category: '基础', formula: '4' },
      { name: '速度', category: '战斗', formula: built }
    ]
    const evaluation = evaluateAttrPanel(rows)
    expect(evaluation.errors[2]).toBeNull()
    expect(evaluation.values[2]).toBe(16)
  })

  it('回填→重建的往返式子同样能被求值器接受', () => {
    const text = '=力量*10+体质*20+敏捷*5'
    const parsed = parseFormulaToCoeffs(text, ['力量', '智力', '敏捷', '体质'])
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const rebuilt = buildFormulaFromCoeffs(parsed.entries)
    expect(rebuilt).toBe('=力量*10+敏捷*5+体质*20')

    const rows: AttrPanelRow[] = [
      { name: '力量', category: '基础', formula: '5' },
      { name: '敏捷', category: '基础', formula: '5' },
      { name: '体质', category: '基础', formula: '5' },
      { name: 'HP', category: '战斗', formula: rebuilt }
    ]
    expect(evaluateAttrPanel(rows).values[3]).toBe(175)
  })
})
