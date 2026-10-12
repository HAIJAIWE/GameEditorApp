import { describe, expect, it } from 'vitest'

import { calculateAttributes, evaluateFormula } from '../../src/shared/domain/attr/attrEngine'
import {
  buildAttrGameConfig,
  createDefaultAttrSystem,
  defaultBaseValues,
  formulaToDisplay,
  formulaToText,
  parseAttrSystemFile,
  parseFormulaText,
  serializeAttrSystem,
  topoSortAttributes,
  validateAttrSystem,
  type AttrDefinition,
  type AttrSystem
} from '../../src/shared/attrSystem'

function attr(name: string, patch: Partial<AttrDefinition> = {}): AttrDefinition {
  return {
    name,
    type: 'derived',
    category: '派生属性',
    displayName: name,
    minValue: 0,
    maxValue: null,
    defaultValue: 0,
    formula: { coefficients: {}, baseValue: 0 },
    ...patch
  }
}

describe('默认属性系统（匹平 Python _build_default_system）', () => {
  const system = createDefaultAttrSystem()

  it('基础 4 + 派生 7 + 战斗 6；基础默认值 10；战斗属性带上限', () => {
    const names = Object.keys(system.attributes)
    expect(names).toHaveLength(17)
    expect(system.attributes['力量']).toMatchObject({
      type: 'base',
      category: '基础属性',
      defaultValue: 10,
      minValue: 0,
      maxValue: null
    })
    expect(system.attributes['HP']).toMatchObject({ type: 'derived', category: '派生属性' })
    expect(system.attributes['HP']?.formula).toEqual({ coefficients: { 力量: 10, 体质: 20, 敏捷: 5 }, baseValue: 0 })
    expect(system.attributes['暴击率']).toMatchObject({ type: 'combat', maxValue: 100 })
    expect(system.attributes['暴击率']?.formula).toEqual({ coefficients: { 敏捷: 0.4 }, baseValue: 5 })
    expect(defaultBaseValues(system)).toEqual({ 力量: 10, 智力: 10, 敏捷: 10, 体质: 10 })
  })

  it('默认基础值计算结果与 Python 公式一致', () => {
    const calculation = calculateAttributes(system, defaultBaseValues(system))
    expect(calculation.cycle).toBeNull()
    const values = calculation.values
    expect(values['HP']).toBe(350)
    expect(values['MP']).toBe(200)
    expect(values['物攻']).toBe(30)
    expect(values['物防']).toBe(30)
    expect(values['魔攻']).toBe(30)
    expect(values['魔防']).toBe(20)
    expect(values['速度']).toBe(20)
    expect(values['暴击率']).toBeCloseTo(9, 6)
    expect(values['暴击伤害']).toBeCloseTo(155, 6)
    expect(values['命中率']).toBeCloseTo(88, 6)
    expect(values['闪避率']).toBeCloseTo(9, 6)
    expect(values['回血/回合']).toBe(10)
    expect(values['回蓝/回合']).toBe(5)
  })
})

describe('公式文本互转（匹平 to_legacy_string / from_legacy_string）', () => {
  it('系数 → 文本：常数项在前、整数不带小数、空公式为 =0', () => {
    expect(formulaToText({ coefficients: { 力量: 10, 体质: 20, 敏捷: 5 }, baseValue: 0 })).toBe(
      '= 力量*10 + 体质*20 + 敏捷*5'
    )
    expect(formulaToText({ coefficients: {}, baseValue: 5 })).toBe('= 5')
    expect(formulaToText({ coefficients: {}, baseValue: 0 })).toBe('=0')
    expect(formulaToText({ coefficients: { 敏捷: 0 }, baseValue: 0 })).toBe('=0')
  })

  it('文本 → 系数：空白容错、单独数字为常数项、非法返回 null', () => {
    expect(parseFormulaText('= 力量*10 + 体质*20 + 敏捷*5')).toEqual({
      coefficients: { 力量: 10, 体质: 20, 敏捷: 5 },
      baseValue: 0
    })
    expect(parseFormulaText('=力量*10+5')).toEqual({ coefficients: { 力量: 10 }, baseValue: 5 })
    expect(parseFormulaText('50')).toEqual({ coefficients: {}, baseValue: 50 })
    expect(parseFormulaText('')).toEqual({ coefficients: {}, baseValue: 0 })
    expect(parseFormulaText('= 力量*')).toBeNull()
    expect(parseFormulaText('= 力量*零点五')).toBeNull()
    expect(parseFormulaText('abc')).toBeNull()
  })

  it('往返一致；可读展示使用 ×', () => {
    const original = { coefficients: { 力量: 0.5, 智力: 3 }, baseValue: 150 }
    expect(parseFormulaText(formulaToText(original))).toEqual(original)
    expect(formulaToDisplay(original)).toBe('力量×0.5 + 智力×3 + 150')
  })
})

describe('求值与拓扑计算', () => {
  it('未定义依赖按 0、系数 0 跳过', () => {
    expect(evaluateFormula({ coefficients: { A: 0, B: 2 }, baseValue: 1 }, { A: 100, B: 3 })).toBe(7)
    expect(evaluateFormula({ coefficients: { 缺失: 5 }, baseValue: 0 }, {})).toBe(0)
  })

  it('拓扑序计算：依赖与插入顺序相反也能算对', () => {
    const system: AttrSystem = {
      attributes: {
        C: attr('C', { formula: { coefficients: { B: 1 }, baseValue: 0 } }),
        B: attr('B', { formula: { coefficients: { A: 2 }, baseValue: 0 } }),
        A: attr('A', { type: 'base', category: '基础属性', defaultValue: 3 })
      }
    }
    const calculation = calculateAttributes(system, { A: 3 })
    expect(calculation.values['B']).toBe(6)
    expect(calculation.values['C']).toBe(6)
    expect(topoSortAttributes(system).order.indexOf('A')).toBeLessThan(topoSortAttributes(system).order.indexOf('B'))
  })

  it('min/max 截断（默认最小值 0）', () => {
    const system: AttrSystem = {
      attributes: {
        基础: attr('基础', { type: 'base', category: '基础属性', defaultValue: 10 }),
        负属性: attr('负属性', { formula: { coefficients: { 基础: -5 }, baseValue: 0 } }),
        上限属性: attr('上限属性', { maxValue: 20, formula: { coefficients: { 基础: 3 }, baseValue: 0 } })
      }
    }
    const calculation = calculateAttributes(system, { 基础: 10 })
    expect(calculation.values['负属性']).toBe(0)
    expect(calculation.values['上限属性']).toBe(20)
  })

  it('环依赖：返回成员而非抛错', () => {
    const system: AttrSystem = {
      attributes: {
        X: attr('X', { formula: { coefficients: { Y: 1 }, baseValue: 0 } }),
        Y: attr('Y', { formula: { coefficients: { X: 1 }, baseValue: 0 } })
      }
    }
    expect(topoSortAttributes(system).cycle?.sort()).toEqual(['X', 'Y'])
    expect(calculateAttributes(system, {}).cycle?.sort()).toEqual(['X', 'Y'])
    expect(validateAttrSystem(system).join('\n')).toContain('循环依赖')
  })
})

describe('领域校验', () => {
  it('内置默认集通过；捕获依赖不存在 / min>max / 名键不一致 / 空系统', () => {
    expect(validateAttrSystem(createDefaultAttrSystem())).toEqual([])

    const bad: AttrSystem = {
      attributes: {
        A: attr('A', { formula: { coefficients: { 不存在: 1 }, baseValue: 0 } }),
        B: attr('B', { name: 'B2', displayName: 'B', minValue: 10, maxValue: 5 })
      }
    }
    const messages = validateAttrSystem(bad).join('\n')
    expect(messages).toContain('依赖了不存在的属性「不存在」')
    expect(messages).toContain('最小值大于上限')
    expect(messages).toContain('名称与键名不一致')

    expect(validateAttrSystem({ attributes: {} })).toContain('属性系统至少需要一个属性')
  })
})

describe('文件序列化 / 解析（Python attr_system.json 同构）', () => {
  const system = createDefaultAttrSystem()

  it('序列化为平铺 snake_case 结构，往返一致且保留上限', () => {
    const file = serializeAttrSystem(system)
    expect(file['HP']).toEqual({
      name: 'HP',
      type: 'derived',
      category: '派生属性',
      display_name: 'HP',
      min_value: 0,
      max_value: null,
      default_value: 0,
      formula: '= 力量*10 + 体质*20 + 敏捷*5'
    })
    expect(file['暴击率']?.max_value).toBe(100)

    const parsed = parseAttrSystemFile(file)
    expect(parsed.warnings).toEqual([])
    expect(parsed.system).toEqual(system)
  })

  it('容错：未知类型按基础属性、公式非法按空公式，均给 warnings', () => {
    const parsed = parseAttrSystemFile({
      力量: {
        name: '力量',
        type: 'base',
        category: '基础属性',
        display_name: '力量',
        min_value: 0,
        max_value: null,
        default_value: 10,
        formula: '=0'
      },
      坏公式: {
        name: '坏公式',
        type: 'weird',
        min_value: 'x',
        default_value: null,
        formula: '= 未知*abc'
      }
    })
    const warnings = parsed.warnings.join('\n')
    expect(warnings).toContain('类型「weird」未知')
    expect(warnings).toContain('公式无法解析')
    expect(warnings).toContain('不是数字')
    expect(parsed.system.attributes['坏公式']?.type).toBe('base')
    expect(parsed.system.attributes['坏公式']?.formula).toEqual({ coefficients: {}, baseValue: 0 })
  })

  it('结构异常：顶层非对象、空文件均抛中文错误', () => {
    expect(() => parseAttrSystemFile([])).toThrow('顶层应为 JSON 对象')
    expect(() => parseAttrSystemFile({})).toThrow('未解析出任何属性')
  })
})

describe('游戏配置导出（匹平 Python _build_game_config）', () => {
  it('默认集：基础属性列表 + 派生/战斗 linear 公式 + 计算顺序 + 约束', () => {
    const config = buildAttrGameConfig(createDefaultAttrSystem())
    expect(config.version).toBe('1.0')
    expect(config.base_attributes).toEqual([
      { name: '力量', display_name: '力量', min: 0, max: null, default: 10 },
      { name: '智力', display_name: '智力', min: 0, max: null, default: 10 },
      { name: '敏捷', display_name: '敏捷', min: 0, max: null, default: 10 },
      { name: '体质', display_name: '体质', min: 0, max: null, default: 10 }
    ])
    expect(config.derived_formulas['HP']).toEqual({
      type: 'linear',
      base: 0,
      coefficients: { 力量: 10, 体质: 20, 敏捷: 5 },
      min: 0,
      max: null
    })
    expect(config.derived_formulas['暴击率']).toEqual({
      type: 'linear',
      base: 5,
      coefficients: { 敏捷: 0.4 },
      min: 0,
      max: 100
    })
    expect(Object.keys(config.derived_formulas)).toHaveLength(13)
    expect(config.calculation_order).toHaveLength(17)
    expect(config.calculation_order.indexOf('力量')).toBeLessThan(config.calculation_order.indexOf('HP'))
    expect(config.attribute_constraints['暴击率']).toEqual({ min: 0, max: 100 })
    expect(config.attribute_constraints['力量']).toEqual({ min: 0, max: null })
  })

  it('零系数剔除、常数项保留', () => {
    const system: AttrSystem = {
      attributes: {
        力量: attr('力量', { type: 'base', defaultValue: 10 }),
        体质: attr('体质', { type: 'base', defaultValue: 10 }),
        剔零: attr('剔零', { formula: { coefficients: { 力量: 0, 体质: 2 }, baseValue: 7 } })
      }
    }
    expect(buildAttrGameConfig(system).derived_formulas['剔零']).toEqual({
      type: 'linear',
      base: 7,
      coefficients: { 体质: 2 },
      min: 0,
      max: null
    })
  })

  it('环依赖：计算顺序为空数组（对应 Python 抛错回退）', () => {
    const system: AttrSystem = {
      attributes: {
        A: attr('A', { formula: { coefficients: { B: 1 }, baseValue: 0 } }),
        B: attr('B', { formula: { coefficients: { A: 1 }, baseValue: 0 } })
      }
    }
    expect(buildAttrGameConfig(system).calculation_order).toEqual([])
  })
})