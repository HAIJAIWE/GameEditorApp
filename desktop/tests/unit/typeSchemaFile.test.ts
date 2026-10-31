import { describe, expect, it } from 'vitest'

import { dataTypeDefSchema } from '../../src/shared/schema/adapters'
import { BUILTIN_DATA_TYPES } from '../../src/shared/schema/core'
import { parseTypeSchemaFile, serializeTypeSchema, validateTypeSchema } from '../../src/shared/schema/adapters'
import { TYPE_TEMPLATES, buildNewTypeDraft } from '../../src/shared/schema/core'
import type { DataTypeDef } from '../../src/shared/types'

describe('字段结构文件格式', () => {
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

  it('未知控件类型**降级为 entry 而不抛错**', () => {
    // 动机：字段结构文件与 早期版本同构（<库目录>/type_schema.json），旧版 独有而 TS 未收录的
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

describe('字段模板', () => {
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

describe('可选分区 sections（落盘 / 解析 / 校验）', () => {
  const withSections: DataTypeDef = {
    id: 'unit',
    name: '单位',
    pluralKey: 'units',
    color: '#123456',
    formFields: [
      { name: 'id', label: 'ID:', type: 'entry', editable: false },
      { name: 'name', label: '名称:', type: 'entry', editable: true },
      { name: 'hp', label: '生命:', type: 'spinbox', editable: true }
    ],
    sections: [
      { title: '基础信息', icon: '📌', fields: ['id', 'name'] },
      { title: '战斗属性', icon: '⚔️', fields: ['hp'] }
    ]
  }

  it('序列化：sections 按 snake_case 兼容结构写出', () => {
    const file = serializeTypeSchema([withSections])
    expect(file.data_types[0]?.sections).toEqual([
      { title: '基础信息', icon: '📌', fields: ['id', 'name'] },
      { title: '战斗属性', icon: '⚔️', fields: ['hp'] }
    ])
  })

  it('无 sections 的类型不写该键（旧文件结构逐字节不变）', () => {
    const file = serializeTypeSchema([{ ...withSections, sections: undefined }])
    expect('sections' in (file.data_types[0] ?? {})).toBe(false)
  })

  it('解析往返：sections 原样恢复', () => {
    const parsed = parseTypeSchemaFile(serializeTypeSchema([withSections]))
    expect(parsed.types).toEqual([withSections])
  })

  it('解析容错：坏分区被丢弃而非抛错（空标题 / 空字段）', () => {
    const parsed = parseTypeSchemaFile({
      data_types: [
        {
          id: 'a',
          name: 'A',
          plural_key: 'as',
          color: '#ffffff',
          form_fields: [
            { name: 'id', label: 'ID', type: 'entry', editable: false },
            { name: 'x', label: 'X', type: 'entry', editable: true }
          ],
          sections: [
            { title: '', icon: '📌', fields: ['id'] },
            { title: '空', icon: '📌', fields: [] },
            { title: '好', icon: '📌', fields: ['id', 'x'] }
          ]
        }
      ]
    })
    expect(parsed.types[0]?.sections?.map((s) => s.title)).toEqual(['好'])
  })

  it('校验：重复归组 / 空标题 报中文错误；引用已删除字段不报错', () => {
    const bad: DataTypeDef = {
      ...withSections,
      sections: [
        { title: '基础信息', icon: '📌', fields: ['id', 'ghost'] },
        { title: '战斗属性', icon: '⚔️', fields: ['hp', 'id'] },
        { title: '', icon: '📌', fields: ['name'] }
      ]
    }
    const messages = validateTypeSchema([bad]).join('\n')
    expect(messages).toContain('被归入多个分区')
    expect(messages).toContain('标题不能为空')
    // ghost 是已删除字段：渲染跳过、保存剪除，**不应**阻断保存（否则删字段后无法保存）
    expect(messages).not.toContain('ghost')
  })

  it('校验：合法 sections 通过', () => {
    expect(validateTypeSchema([withSections])).toEqual([])
  })

  it('序列化时剪除已删除字段的引用；分区剪空则整段丢弃', () => {
    const pruned: DataTypeDef = {
      ...withSections,
      sections: [
        { title: '基础信息', icon: '📌', fields: ['id', 'name', 'ghost'] },
        { title: '空分区', icon: '⚙️', fields: ['also_ghost'] }
      ]
    }
    const file = serializeTypeSchema([pruned])
    expect(file.data_types[0]?.sections).toEqual([{ title: '基础信息', icon: '📌', fields: ['id', 'name'] }])
  })

  it('IPC 校验（dataTypeDefSchema）保留 sections，不被 zod 剥掉', () => {
    // 关键回归：zod 默认 strip 未声明键，dataTypeDefSchema 漏声明 sections 会让
    // schema:save 静默丢分区 —— 这条测试直接锁住该契约。
    const parsed = dataTypeDefSchema.parse(withSections)
    expect(parsed.sections).toEqual(withSections.sections)
  })
})