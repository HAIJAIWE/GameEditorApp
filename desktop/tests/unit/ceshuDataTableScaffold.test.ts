import { describe, expect, it } from 'vitest'

import {
  applyDataTableScaffold,
  guessFieldKey,
  guessFieldType,
  planDataTableScaffold
} from '../../src/shared/ceshu/data'
import { parseDataTableRequirements, type DataTableActual } from '../../src/shared/ceshu/data'
import { validateTypeSchema } from '../../src/shared/schema/adapters'
import type { DataTypeDef } from '../../src/shared/types'

/**
 * 按声明补齐结构。
 *
 * 两条底线：
 * 1. **不造数据行**——声明「期望 200 条」不等于让系统灌 200 条空记录；
 * 2. **不造重复表**——声明写「武器表」而库里已有「装备」时，新建「武器」正是这个功能要避免的事。
 */

function actual(overrides: Partial<DataTableActual> = {}): DataTableActual {
  return {
    typeId: 'equip',
    typeName: '装备',
    count: 3,
    fieldNames: ['id', 'name', 'value'],
    fieldLabels: ['ID:', '装备名称:', '数值:'],
    ...overrides
  }
}

function typeDef(id: string, name: string, fields: string[]): DataTypeDef {
  return {
    id,
    name,
    pluralKey: `${id}s`,
    color: '#2196F3',
    formFields: [
      { name: 'id', label: 'ID:', type: 'entry', editable: false },
      ...fields.map((field) => ({ name: field, label: `${field}:`, type: 'entry' as const, editable: true }))
    ]
  }
}

const EQUIP = typeDef('equip', '装备', ['name', 'value'])

describe('guessFieldType', () => {
  it('数值指标按数字建', () => {
    expect(guessFieldType('攻击力').type).toBe('spinbox')
    expect(guessFieldType('血量').type).toBe('spinbox')
    expect(guessFieldType('冷却时间').type).toBe('spinbox')
  })

  it('图片/描述/标签各归各位', () => {
    expect(guessFieldType('图标图片').type).toBe('image')
    expect(guessFieldType('描述').type).toBe('desc')
    expect(guessFieldType('标签').type).toBe('tags')
  })

  it('认不出来的按单行文本，且给出理由（别让用户猜）', () => {
    const result = guessFieldType('特殊机制')
    expect(result.type).toBe('entry')
    expect(result.reason).not.toBe('')
  })
})

describe('guessFieldKey', () => {
  it('常见字段走词典', () => {
    expect(guessFieldKey('攻击力', new Set())).toBe('atk')
    expect(guessFieldKey('稀有度', new Set())).toBe('rare')
  })

  it('冲突时退让，不覆盖已有键', () => {
    expect(guessFieldKey('攻击力', new Set(['atk']))).not.toBe('atk')
  })

  it('生出来的键必须过 FIELD_NAME_PATTERN（英文/数字/下划线）', () => {
    for (const label of ['特殊机制', '前置任务', '开放时间窗口']) {
      expect(guessFieldKey(label, new Set())).toMatch(/^[A-Za-z_]\w*$/)
    }
  })
})

describe('planDataTableScaffold：表名归一（不造重复表）', () => {
  it('「装备表」不会新建，而是补到「装备」上', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['装备表|x|攻击力|200']), [actual()], [EQUIP])
    expect(plan.createTypeCount).toBe(0)
    expect(plan.tables[0]?.action).toBe('add_fields')
    expect(plan.tables[0]?.targetTypeId).toBe('equip')
  })

  it('名称相近（包含关系）也复用，并在计划里说明理由', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['装备与武器|x|攻击力|200']), [actual()], [EQUIP])
    expect(plan.tables[0]?.action).toBe('add_fields')
    // 必须说明「为什么算同一张表」，否则用户不知道系统替它做了归一
    expect(plan.tables[0]?.note).toContain('名称相近')
  })

  it('确实没有相近类型才新建', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['成就|达成|名称,奖励|50']), [actual()], [EQUIP])
    expect(plan.createTypeCount).toBe(1)
    expect(plan.tables[0]?.action).toBe('create_type')
  })
})

describe('planDataTableScaffold：字段与跳过', () => {
  it('已存在的字段跳过，只列真缺的', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['装备|x|数值,攻击力|200']), [actual()], [EQUIP])
    const table = plan.tables[0]
    expect(table?.skippedFields).toEqual(['数值'])
    expect(table?.fields.map((field) => field.label)).toEqual(['攻击力:'])
  })

  it('表与字段都齐 → skip，且不计入改动数', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['装备|x|数值|200']), [actual()], [EQUIP])
    expect(plan.tables[0]?.action).toBe('skip')
    expect(plan.createTypeCount + plan.addFieldCount).toBe(0)
    expect(plan.skippedTableCount).toBe(1)
  })

  it('新建表会自动带 name 字段（列表要显示名字）', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['成就|x|奖励|50']), [actual()], [EQUIP])
    expect(plan.tables[0]?.fields.map((field) => field.name)).toContain('name')
  })

  it('计划里不含任何数据行相关的东西（只补结构）', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['成就|达成|名称,奖励|500']), [actual()], [EQUIP])
    expect(Object.keys(plan.tables[0] ?? {})).not.toContain('rows')
    expect(JSON.stringify(plan)).not.toContain('500')
  })
})

describe('applyDataTableScaffold：落盘要过 schema 校验', () => {
  it('补字段后原类型保持原样，只多出新字段', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['装备|x|攻击力|200']), [actual()], [EQUIP])
    const next = applyDataTableScaffold([EQUIP], plan)

    expect(next).toHaveLength(1)
    expect(next[0]?.formFields.map((field) => field.name)).toEqual(['id', 'name', 'value', 'atk'])
    // 入参不被修改
    expect(EQUIP.formFields).toHaveLength(3)
  })

  it('新建类型的首字段是不可编辑的 id（校验会卡这条）', () => {
    const plan = planDataTableScaffold(parseDataTableRequirements(['成就|达成|名称,奖励|50']), [actual()], [EQUIP])
    const next = applyDataTableScaffold([EQUIP], plan)
    const created = next.find((def) => def.id !== 'equip')

    expect(created?.formFields[0]?.name).toBe('id')
    expect(created?.formFields[0]?.editable).toBe(false)
  })

  it('生成出来的 schema 能通过 validateTypeSchema（否则 saveTypes 会抛错）', () => {
    const requirements = parseDataTableRequirements([
      '成就|达成|名称,奖励,图标图片|50',
      '装备|x|攻击力,暴击率|200',
      '装备表|重复声明|闪避|10'
    ])
    const plan = planDataTableScaffold(requirements, [actual()], [EQUIP])
    const next = applyDataTableScaffold([EQUIP], plan)

    expect(validateTypeSchema(next)).toEqual([])
  })

  it('同一份声明重复执行不会重复加字段（幂等）', () => {
    const requirements = parseDataTableRequirements(['装备|x|攻击力|200'])
    const once = applyDataTableScaffold([EQUIP], planDataTableScaffold(requirements, [actual()], [EQUIP]))
    const after: DataTableActual = {
      ...actual(),
      fieldNames: [...(once[0]?.formFields.map((field) => field.name) ?? [])],
      fieldLabels: once[0]?.formFields.map((field) => field.label) ?? []
    }
    const twice = applyDataTableScaffold(once, planDataTableScaffold(requirements, [after], once))
    expect(twice[0]?.formFields).toHaveLength(once[0]?.formFields.length ?? 0)
  })
})

describe('guessFieldKey：后缀命中', () => {
  it('「图标图片」能借「图片」映射到 image', () => {
    expect(guessFieldKey('图标图片', new Set())).toBe('image')
  })

  it('「攻击力上限」不会误中「攻击力」（只认后缀，不做包含）', () => {
    expect(guessFieldKey('攻击力上限', new Set())).not.toBe('atk')
  })
})

describe('英文标签 + id 系统字段（2026-10-27 补）', () => {
  it('英文标签直接用作字段键（不退化 f1）', () => {
    expect(guessFieldKey('attack', new Set())).toBe('attack')
    expect(guessFieldKey('damage_rate', new Set())).toBe('damage_rate')
  })

  it('英文数值标签判 spinbox（不只认中文）', () => {
    expect(guessFieldType('attack').type).toBe('spinbox')
    expect(guessFieldType('cooldown').type).toBe('spinbox')
  })

  it('关键字段写 id 不生成 id_2（id 由 apply 统一补系统字段）', () => {
    const requirements = parseDataTableRequirements(['武器表|装备|id,name,attack|≥10'])
    const plan = planDataTableScaffold(requirements, [], [])
    const types = applyDataTableScaffold([], plan)
    const weapon = types[0]!
    const idFields = weapon.formFields.filter((field) => field.name === 'id')
    expect(idFields).toHaveLength(1)
    expect(idFields[0]?.editable).toBe(false)
    expect(weapon.formFields.some((field) => field.name === 'id_2')).toBe(false)
  })
})
