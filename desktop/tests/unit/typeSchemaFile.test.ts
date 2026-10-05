import { describe, expect, it } from 'vitest'

import { BUILTIN_DATA_TYPES } from '../../src/shared/typeSchema'
import { parseTypeSchemaFile, serializeTypeSchema, validateTypeSchema } from '../../src/shared/typeSchemaFile'
import { TYPE_TEMPLATES, buildNewTypeDraft } from '../../src/shared/typeTemplates'
import type { DataTypeDef } from '../../src/shared/types'

describe('字段结构文件格式（与 Python type_schema.json 同构）', () => {
  it('序列化：snake_case 键、from_/to、ref_type、可选值保留', () => {
    const file = serializeTypeSchema(BUILTIN_DATA_TYPES, '2.4')
    expect(file.version).toBe('2.4')
    expect(file.data_types).toHaveLength(12)

    const role = file.data_types.find((t) => t.id === 'role')
    expect(role?.plural_key).toBe('roles')
    expect(role?.form_fields[0]).toEqual({ name: 'id', label: 'ID:', type: 'entry', editable: false })

    const hpBonus = file.data_types.find((t) => t.id === 'job')?.form_fields.find((f) => f.name === 'hp_bonus')
    expect(hpBonus).toMatchObject({ name: 'hp_bonus', type: 'spinbox', from_: -50, to: 100 })

    const skills = role?.form_fields.find((f) => f.name === 'skills')
    expect(skills?.ref_type).toBe('skills')
  })

  it('解析（往返）：内置 schema 序列化后解析回等值结构', () => {
    const parsed = parseTypeSchemaFile(serializeTypeSchema(BUILTIN_DATA_TYPES))
    expect(parsed.version).toBe('2.4')
    expect(parsed.types).toEqual(BUILTIN_DATA_TYPES)
  })

  it('解析容错：顶层非对象、缺 data_types 给出中文错误', () => {
    expect(() => parseTypeSchemaFile([])).toThrow('顶层应为 JSON 对象')
    expect(() => parseTypeSchemaFile({ version: '2.4' })).toThrow('data_types')
  })

  it('未知控件类型**降级为 entry 而不抛错**（对齐 Python field_config.py 的 else: QLineEdit 兜底）', () => {
    // 动机：字段结构文件与 Python 版同构（<库目录>/type_schema.json），PyQt 独有而 TS 未收录的
    // 控件类型（已核实 ref / textarea）不能把整个应用锁死 —— 否则 schema:list 抛错 → 应用打不开。
    const parsed = parseTypeSchemaFile({
      data_types: [
        {
          id: 'a',
          name: 'A',
          plural_key: 'as',
          color: '#ffffff',
          form_fields: [
            { name: 'x', label: 'X', type: 'not_a_type' },
            { name: 'y', label: 'Y', type: 'ref' },
            { name: 'z', label: 'Z', type: 'textarea' },
            { name: 'w', label: 'W', type: 'entry' }
          ]
        }
      ]
    })
    const types = parsed.types.map((def) => def.formFields ?? [])
    expect(types).toHaveLength(1)
    expect(types[0]?.map((field) => field.type)).toEqual(['entry', 'entry', 'entry', 'entry'])
    // 字段名/标签必须原样保留（降级只动控件类型，不动用户数据语义）
    expect(types[0]?.map((field) => field.name)).toEqual(['x', 'y', 'z', 'w'])
    expect(types[0]?.map((field) => field.label)).toEqual(['X', 'Y', 'Z', 'W'])
  })
})

describe('字段结构领域校验（保存前共用）', () => {
  it('内置 schema 与新建类型草稿均通过', () => {
    expect(validateTypeSchema(BUILTIN_DATA_TYPES)).toEqual([])
    expect(validateTypeSchema([buildNewTypeDraft(['role'])])).toEqual([])
  })

  it('捕获类型级问题：id 格式/重复、名称为空、颜色非十六进制', () => {
    const bad: DataTypeDef[] = [
      {
        id: '1bad',
        name: '',
        pluralKey: 'roles',
        color: 'red',
        formFields: [{ name: 'id', label: 'ID:', type: 'entry', editable: false }]
      }
    ]
    const messages = validateTypeSchema(bad).join('\n')
    expect(messages).toContain('格式不合法')
    expect(messages).toContain('名称不能为空')
    expect(messages).toContain('颜色需为 #RRGGBB')
  })

  it('捕获字段级问题：缺 id 首字段、字段名重复、下限大于上限、refType 悬空', () => {
    const bad: DataTypeDef[] = [
      {
        id: 'noid',
        name: '无 ID 字段',
        pluralKey: 'noids',
        color: '#112233',
        formFields: [{ name: 'name', label: '名称:', type: 'entry', editable: true }]
      },
      {
        id: 'dupfield',
        name: '重复字段',
        pluralKey: 'dupfields',
        color: '#112233',
        formFields: [
          { name: 'id', label: 'ID:', type: 'entry', editable: false },
          { name: 'x', label: 'X:', type: 'spinbox', editable: true, from: 10, to: 1 },
          { name: 'x', label: 'X2:', type: 'entry', editable: true }
        ]
      },
      {
        id: 'refbad',
        name: '悬空引用',
        pluralKey: 'refs',
        color: '#112233',
        formFields: [
          { name: 'id', label: 'ID:', type: 'entry', editable: false },
          { name: 'a', label: 'A:', type: 'multiselect', editable: true, refType: 'not_exist' }
        ]
      }
    ]
    const messages = validateTypeSchema(bad).join('\n')
    expect(messages).toContain('首个字段必须是 id')
    expect(messages).toContain('字段名「x」重复')
    expect(messages).toContain('下限不能大于上限')
    expect(messages).toContain('引用了不存在的类型「not_exist」')
  })
})

describe('字段模板（照抄 Python TYPE_TEMPLATES）', () => {
  it('8 套模板（含「空白」），均以 id 首字段开头且不可编辑', () => {
    expect(Object.keys(TYPE_TEMPLATES)).toHaveLength(8)
    for (const fields of Object.values(TYPE_TEMPLATES)) {
      expect(fields.length).toBeGreaterThanOrEqual(2)
      expect(fields[0]?.name).toBe('id')
      expect(fields[0]?.editable).toBe(false)
    }
    expect(TYPE_TEMPLATES['RPG角色']?.some((f) => f.name === 'hp' && f.from === 50)).toBe(true)
    expect(TYPE_TEMPLATES['FPS武器']?.some((f) => f.type === 'double_spin')).toBe(true)
  })

  it('新建类型草稿：id 自动去重、含空白模板字段', () => {
    expect(buildNewTypeDraft([]).id).toBe('new_type')
    expect(buildNewTypeDraft(['new_type']).id).toBe('new_type_2')
    expect(buildNewTypeDraft(['new_type', 'new_type_2']).pluralKey).toBe('new_type_3s')
    const draft = buildNewTypeDraft(['role'])
    expect(draft.formFields.map((f) => f.name)).toEqual(['id', 'name'])
  })
})