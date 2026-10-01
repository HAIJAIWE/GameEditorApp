import { describe, expect, it } from 'vitest'

import {
  ATTR_PANEL_QUICK_ADD,
  ATTR_PANEL_TEMPLATES,
  attrPanelToRows,
  defaultAttrPanelRows,
  evaluateAttrPanel,
  rowsToAttrPanel,
  type AttrPanelRow
} from '../../src/shared/attrPanel'

function row(name: string, formula: string, category = '基础'): AttrPanelRow {
  return { name, category, formula }
}

function hpOf(typeId: string, templateName: string): number {
  const rows = ATTR_PANEL_TEMPLATES[typeId][templateName].map((item) => ({ ...item }))
  return evaluateAttrPanel(rows).values[rows.findIndex((item) => item.name === 'HP')]
}

describe('属性面板模板（照抄 Python ATTR_TEMPLATES）', () => {
  it('role 7 套 / monster 4 套，各 17 行，关键数值与公式一致', () => {
    expect(Object.keys(ATTR_PANEL_TEMPLATES.role)).toEqual(['新手', '战士', '法师', '刺客', '射手', '牧师', '坦克'])
    expect(Object.keys(ATTR_PANEL_TEMPLATES.monster)).toEqual(['小怪', '普通怪', '精英怪', 'Boss'])
    for (const group of Object.values(ATTR_PANEL_TEMPLATES)) {
      for (const template of Object.values(group)) {
        expect(template).toHaveLength(17)
        expect(template[0]).toEqual({ name: '力量', category: '基础', formula: expect.any(String) })
      }
    }
    expect(ATTR_PANEL_TEMPLATES.role['新手'][0].formula).toBe('5')
    expect(ATTR_PANEL_TEMPLATES.role['新手'][4]).toEqual({
      name: 'HP',
      category: '派生',
      formula: '=力量*10+体质*20+敏捷*5'
    })
    expect(ATTR_PANEL_TEMPLATES.role['新手'][11]).toEqual({ name: '暴击率', category: '战斗', formula: '=8.0' })
    expect(ATTR_PANEL_TEMPLATES.role['新手'][15]).toEqual({ name: '回血/回合', category: '战斗', formula: '=6' })
    expect(ATTR_PANEL_TEMPLATES.role['战士'][0].formula).toBe('12')
    expect(ATTR_PANEL_TEMPLATES.monster['Boss'][0].formula).toBe('20')
    expect(ATTR_PANEL_TEMPLATES.monster['Boss'][12].formula).toBe('=168.0')
  })

  it('defaultAttrPanelRows 返回第一套模板副本（修改不影响定义），未知类型为空', () => {
    const rows = defaultAttrPanelRows('role')
    expect(rows).toHaveLength(17)
    expect(rows[0].name).toBe('力量')
    rows[0].formula = '999'
    expect(ATTR_PANEL_TEMPLATES.role['新手'][0].formula).toBe('5')
    expect(defaultAttrPanelRows('unknown_type')).toEqual([])
  })

  it('全部 11 套模板按拓扑求值零错误，关键结果正确', () => {
    for (const group of Object.values(ATTR_PANEL_TEMPLATES)) {
      for (const template of Object.values(group)) {
        const evaluation = evaluateAttrPanel(template.map((item) => ({ ...item })))
        expect(evaluation.errors.filter(Boolean)).toEqual([])
      }
    }
    expect(hpOf('role', '新手')).toBeCloseTo(175) // 5*10 + 5*20 + 5*5
    expect(hpOf('role', '战士')).toBeCloseTo(345) // 12*10 + 10*20 + 5*5
    expect(hpOf('role', '法师')).toBeCloseTo(130) // 3*10 + 4*20 + 4*5
    expect(hpOf('monster', 'Boss')).toBeCloseTo(740) // 20*10 + 24*20 + 12*5
  })
})

describe('属性面板快速添加预置', () => {
  it('基础 4 + 派生 7 + 战斗 6 + 奖励 3，共 20 项，类别/公式与 Python 一致', () => {
    expect(ATTR_PANEL_QUICK_ADD).toHaveLength(20)
    expect(ATTR_PANEL_QUICK_ADD.find((item) => item.name === '力量')).toEqual({
      name: '力量',
      category: '基础',
      formula: '0'
    })
    expect(ATTR_PANEL_QUICK_ADD.find((item) => item.name === '速度')).toEqual({
      name: '速度',
      category: '派生',
      formula: '=0'
    })
    expect(ATTR_PANEL_QUICK_ADD.find((item) => item.name === '暴击率')).toEqual({
      name: '暴击率',
      category: '战斗',
      formula: '=0'
    })
    expect(ATTR_PANEL_QUICK_ADD.find((item) => item.name === '经验值')).toEqual({
      name: '经验值',
      category: '奖励',
      formula: '=0'
    })
  })
})

describe('属性面板编辑行 ↔ 存储转换', () => {
  it('加载：过滤非对象与空名称行，缺省类别/公式补齐、去空白、未知键保留（对应 Python load_data）', () => {
    const rows = attrPanelToRows([
      null,
      '力量',
      { name: '  ', formula: '5' },
      { name: ' 力量 ', value: 10 },
      { name: 'HP', category: '', formula: '=力量*10' }
    ])
    expect(rows).toEqual([
      { name: '力量', value: 10, category: '自定义', formula: '0' },
      { name: 'HP', category: '自定义', formula: '=力量*10' }
    ])
    expect(attrPanelToRows(undefined)).toEqual([])
  })

  it('保存：空名称行忽略、类别/公式空值补齐、未知键保留（对应 Python get_data）', () => {
    const rows: AttrPanelRow[] = [
      { name: '  ', category: '基础', formula: '5' },
      { name: ' 力量 ', category: '  ', formula: '  ', note: 'x' },
      { name: '幸运', category: '', formula: 'abc' }
    ]
    expect(rowsToAttrPanel(rows)).toEqual([
      { name: '力量', category: '自定义', formula: '0', note: 'x' },
      { name: '幸运', category: '自定义', formula: 'abc' }
    ])
  })
})

describe('属性面板求值（拓扑序，修正 Python 两趟行序缺陷）', () => {
  it('行序倒置（派生行在基础行之前）仍正确计算', () => {
    const evaluation = evaluateAttrPanel([
      row('HP', '=力量*10+体质*20+敏捷*5', '派生'),
      row('力量', '5'),
      row('敏捷', '5'),
      row('体质', '5')
    ])
    expect(evaluation.errors).toEqual([null, null, null, null])
    expect(evaluation.values[0]).toBe(175)
  })

  it('未定义名称/非法公式/非数字/除零给出中文错误并按 0 展示', () => {
    const { values, errors } = evaluateAttrPanel([
      row('力量', '10'),
      row('A', '=不存在*2', '派生'),
      row('B', '=力量*', '派生'),
      row('C', 'abc', '派生'),
      row('D', '=力量/0', '派生')
    ])
    expect(values[0]).toBe(10)
    expect(errors[1]).toContain('未定义的属性名')
    expect(errors[2]).toContain('公式不完整')
    expect(errors[3]).toContain('不是数字')
    expect(errors[4]).toContain('除数为 0')
    expect(values.slice(1)).toEqual([0, 0, 0, 0])
  })

  it('依赖失败向传播错误', () => {
    const { values, errors } = evaluateAttrPanel([row('A', '=不存在', '派生'), row('B', '=A+1', '派生')])
    expect(errors[0]).toContain('未定义的属性名')
    expect(errors[1]).toContain('依赖的属性「A」无法计算')
    expect(values).toEqual([0, 0])
  })

  it('环依赖：环上成员标记循环依赖，依赖环的行单独提示', () => {
    const { values, errors } = evaluateAttrPanel([
      row('A', '=B+1', '派生'),
      row('B', '=A+1', '派生'),
      row('C', '=A*2', '派生')
    ])
    expect(errors[0]).toContain('循环依赖：A、B')
    expect(errors[1]).toContain('循环依赖：A、B')
    expect(errors[2]).toContain('存在循环依赖')
    expect(values).toEqual([0, 0, 0])
  })

  it('自引用视为环', () => {
    const { errors } = evaluateAttrPanel([row('A', '=A+1', '派生')])
    expect(errors[0]).toContain('循环依赖')
  })

  it('重名取最后一行（与 Python results 覆盖语义一致）', () => {
    const { values, errors } = evaluateAttrPanel([row('力量', '5'), row('HP', '=力量*10', '派生'), row('力量', '30')])
    expect(errors).toEqual([null, null, null])
    expect(values).toEqual([30, 300, 30])
  })

  it('每行结果舍入到 1 位小数并参与下游（复刻 Python 舍入传播）', () => {
    const { values } = evaluateAttrPanel([row('力量', '10'), row('X', '=力量/3', '派生'), row('Y', '=X*3', '派生')])
    expect(values[1]).toBe(3.3)
    expect(values[2]).toBe(9.9)
  })

  it('括号/整除/取模/幂（右结合、优先级与 Python 一致）与含斜杠属性名', () => {
    const { values, errors } = evaluateAttrPanel([
      row('力量', '10'),
      row('回血/回合', '4', '战斗'),
      row('A', '=(力量+4)*2', '派生'),
      row('B', '=力量//3', '派生'),
      row('C', '=力量%3', '派生'),
      row('D', '=2**3**2', '派生'),
      row('E', '=回血/回合*2+1', '派生'),
      row('F', '=-2**2', '派生')
    ])
    expect(errors.filter(Boolean)).toEqual([])
    expect(values.slice(2)).toEqual([28, 3, 1, 512, 9, -4])
  })

  it('名称边界：不替换更长标识符中的部分匹配（与 Python \\b 对齐）', () => {
    const { errors } = evaluateAttrPanel([row('HP', '100'), row('A', '=HPMax*2', '派生')])
    expect(errors[1]).toContain('未定义的属性名')
  })

  it('无名称行参与求值但不作为变量（保存时忽略）', () => {
    const { values, errors } = evaluateAttrPanel([
      row('力量', '5'),
      { name: '', category: '自定义', formula: '=力量+1' }
    ])
    expect(errors).toEqual([null, null])
    expect(values).toEqual([5, 6])
  })
})