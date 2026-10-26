import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { TypeSchemaStore } from '../../src/main/schema/store'

describe('TypeSchemaStore（type_schema.json 唯一写者）', () => {
  it('无文件时以内置 12 类型为种子；保存后落盘并可重新加载', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-schema-'))
    const filePath = join(dir, 'type_schema.json')
    const store = new TypeSchemaStore(filePath)

    // 种子：内置 schema（此时尚未落盘，仅在用户保存后写文件）
    expect(store.getTypes()).toHaveLength(12)
    expect(existsSync(filePath)).toBe(false)

    const edited = store.getTypes()
    edited[0].name = '角色改'
    edited[0].formFields.push({ name: 'test_field', label: '测试字段:', type: 'entry', editable: true })
    const saved = store.saveTypes(edited)
    expect(saved[0]?.formFields.some((f) => f.name === 'test_field')).toBe(true)

    // 落盘为 旧版 兼容结构（snake_case + form_fields + id 首字段）
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      version: string
      data_types: Array<{ name: string; form_fields: Array<{ name: string }> }>
    }
    expect(raw.version).toBe('2.4')
    expect(raw.data_types[0]?.name).toBe('角色改')
    expect(raw.data_types[0]?.form_fields[0]?.name).toBe('id')

    const reloaded = new TypeSchemaStore(filePath)
    expect(reloaded.getTypes()[0]?.name).toBe('角色改')
    expect(reloaded.getTypes()[0]?.formFields.at(-1)?.name).toBe('test_field')
  })

  it('自定义分区 sections：保存后落盘、重新加载仍在（端到端）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-schema-'))
    const filePath = join(dir, 'type_schema.json')
    const store = new TypeSchemaStore(filePath)

    const types = store.getTypes()
    const role = types.find((def) => def.id === 'role')
    if (!role) throw new Error('内置 role 类型缺失')
    role.sections = [
      { title: '基础信息', icon: '📌', fields: ['id', 'name'] },
      { title: '职业 & 种族', icon: '⚔️', fields: ['job', 'race'] }
    ]
    const saved = store.saveTypes(types)
    expect(saved.find((def) => def.id === 'role')?.sections).toEqual(role.sections)

    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      data_types: Array<{ id: string; sections?: Array<{ title: string; fields: string[] }> }>
    }
    expect(raw.data_types.find((t) => t.id === 'role')?.sections?.[1]?.title).toBe('职业 & 种族')

    const reloaded = new TypeSchemaStore(filePath)
    expect(reloaded.getTypes().find((def) => def.id === 'role')?.sections).toEqual(role.sections)
  })

  it('保存校验失败：抛中文错误且不落盘', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-schema-'))
    const filePath = join(dir, 'type_schema.json')
    const store = new TypeSchemaStore(filePath)

    const broken = store.getTypes()
    broken[0].id = '1bad'
    expect(() => store.saveTypes(broken)).toThrow('字段结构校验失败')
    expect(existsSync(filePath)).toBe(false)
  })

  it('文件损坏时读取报错含文件路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-schema-'))
    const filePath = join(dir, 'type_schema.json')
    writeFileSync(filePath, '{ not json', 'utf-8')
    expect(() => new TypeSchemaStore(filePath).getTypes()).toThrow('读取字段结构文件失败')
  })
})