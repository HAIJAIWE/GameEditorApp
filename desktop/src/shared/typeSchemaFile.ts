import { BUILTIN_DATA_TYPES } from './typeSchema'
import type { DataTypeDef, FieldType, TypeFieldDef } from './types'

/**
 * 数据类型 schema 的文件格式与校验（跨进程共用）。
 * 磁盘格式与 Python 版 <库目录>/type_schema.json 同构（snake_case），便于存量 schema 互通：
 *   { "version": "2.4", "data_types": [{ id, name, plural_key, color, form_fields: [...] }] }
 * 字段键：name/label/type/editable/values/from_/to/ref_type（TS 内部用 camelCase from/to/refType）。
 */

/** 字段类型中文标签（与 Python config/constants.py FIELD_TYPE_MAP 一致 + attrtable + attrpanel） */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  entry: '文本输入',
  combobox: '下拉选择',
  spinbox: '整数输入',
  double_spin: '小数输入',
  tags: '标签输入',
  template: '描述模板',
  desc: '描述文本',
  content: '多行内容',
  achievement_desc: '成就描述',
  image: '图片路径',
  image_desc: '图片描述',
  image_tags: '图片标签',
  dialog: '关联对话',
  droptable: '掉落表',
  multiselect: '多选引用',
  attrtable: '属性表',
  attrpanel: '属性面板'
}

export const FIELD_TYPES = Object.keys(FIELD_TYPE_LABELS) as FieldType[]

export const DEFAULT_TYPE_SCHEMA_VERSION = '2.4'

/** 字段类型校验：单行/多行文本类（用于编辑器提示，无实际逻辑分支） */
export const FIELD_NAME_PATTERN = /^[A-Za-z_]\w*$/

/* ---- 文件序列化 / 解析 ---- */

interface TypeSchemaFileField {
  name: string
  label: string
  type: string
  editable: boolean
  values?: string[]
  from_?: number
  to?: number
  ref_type?: string
}

interface TypeSchemaFileType {
  id: string
  name: string
  plural_key: string
  color: string
  form_fields: TypeSchemaFileField[]
}

export interface TypeSchemaFile {
  version: string
  data_types: TypeSchemaFileType[]
}

/** 序列化为 Python 兼容的 type_schema.json 结构（camelCase → snake_case） */
export function serializeTypeSchema(types: DataTypeDef[], version = DEFAULT_TYPE_SCHEMA_VERSION): TypeSchemaFile {
  return {
    version,
    data_types: types.map((def) => ({
      id: def.id,
      name: def.name,
      plural_key: def.pluralKey,
      color: def.color,
      form_fields: def.formFields.map((field) => {
        const serialized: TypeSchemaFileField = {
          name: field.name,
          label: field.label,
          type: field.type,
          editable: field.editable
        }
        if (field.values !== undefined) serialized.values = [...field.values]
        if (field.from !== undefined) serialized.from_ = field.from
        if (field.to !== undefined) serialized.to = field.to
        if (field.refType !== undefined && field.refType !== '') serialized.ref_type = field.refType
        return serialized
      })
    }))
  }
}

/** 解析 type_schema.json（snake_case；version 缺省用默认值）；结构/控件类型不合法时抛中文错误 */
export function parseTypeSchemaFile(raw: unknown): { version: string; types: DataTypeDef[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('字段结构文件格式不正确：顶层应为 JSON 对象')
  }
  const record = raw as Record<string, unknown>
  const version = typeof record.version === 'string' && record.version ? record.version : DEFAULT_TYPE_SCHEMA_VERSION
  const rawTypes = record.data_types
  if (!Array.isArray(rawTypes)) {
    throw new Error('字段结构文件缺少 data_types 数组')
  }

  const types: DataTypeDef[] = rawTypes.map((item, index) => parseType(item, index))
  return { version, types }
}

function parseType(raw: unknown, index: number): DataTypeDef {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`字段结构文件第 ${index + 1} 个类型定义不是对象`)
  }
  const record = raw as Record<string, unknown>
  const id = readString(record.id)
  const name = readString(record.name)
  if (!id || !name) {
    throw new Error(`字段结构文件第 ${index + 1} 个类型缺少 id 或 name`)
  }
  const rawFields = record.form_fields
  if (!Array.isArray(rawFields) || rawFields.length === 0) {
    throw new Error(`类型「${name}」缺少 form_fields 数组`)
  }
  return {
    id,
    name,
    pluralKey: readString(record.plural_key) || `${id}s`,
    color: readString(record.color) || '#607D8B',
    formFields: rawFields.map((field, fieldIndex) => parseField(field, name, fieldIndex))
  }
}

function parseField(raw: unknown, typeName: string, index: number): TypeFieldDef {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`类型「${typeName}」第 ${index + 1} 个字段定义不是对象`)
  }
  const record = raw as Record<string, unknown>
  const name = readString(record.name)
  const type = readString(record.type)
  if (!name || !type) {
    throw new Error(`类型「${typeName}」第 ${index + 1} 个字段缺少 name 或 type`)
  }
  if (!isFieldType(type)) {
    throw new Error(`类型「${typeName}」的字段「${name}」使用了未知控件类型：${type}`)
  }

  const field: TypeFieldDef = {
    name,
    label: readString(record.label) || name,
    type,
    editable: record.editable !== false
  }
  if (Array.isArray(record.values)) {
    field.values = record.values.map((value) => String(value))
  }
  if (typeof record.from_ === 'number' && Number.isFinite(record.from_)) field.from = record.from_
  if (typeof record.to === 'number' && Number.isFinite(record.to)) field.to = record.to
  const refType = readString(record.ref_type)
  if (refType) field.refType = refType
  return field
}

function isFieldType(value: string): value is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/* ---- 领域校验（主进程保存前 + 渲染层保存前共用） ---- */

/** 返回中文错误列表；空数组表示通过 */
export function validateTypeSchema(types: DataTypeDef[]): string[] {
  const errors: string[] = []
  if (types.length === 0) {
    errors.push('至少需要保留一个数据类型')
    return errors
  }

  const typeIds = new Set<string>()
  const pluralKeys = new Set<string>()
  for (const def of types) {
    const label = def.name || def.id || '(未命名类型)'
    if (!def.id) {
      errors.push(`类型「${label}」缺少类型 ID`)
    } else if (!FIELD_NAME_PATTERN.test(def.id)) {
      errors.push(`类型「${label}」的 ID「${def.id}」格式不合法（需为英文/数字/下划线，且以字母或下划线开头）`)
    } else if (typeIds.has(def.id)) {
      errors.push(`类型 ID「${def.id}」重复`)
    } else {
      typeIds.add(def.id)
    }
    if (!def.name.trim()) {
      errors.push(`类型「${label}」的名称不能为空`)
    }
    if (!def.pluralKey.trim()) {
      errors.push(`类型「${label}」的复数键不能为空`)
    } else if (pluralKeys.has(def.pluralKey)) {
      errors.push(`类型「${label}」的复数键「${def.pluralKey}」与其他类型重复`)
    } else {
      pluralKeys.add(def.pluralKey)
    }
    if (def.color && !/^#([0-9a-fA-F]{3,8})$/.test(def.color)) {
      errors.push(`类型「${label}」的颜色需为 #RRGGBB 十六进制格式`)
    }
    if (def.formFields.length === 0) {
      errors.push(`类型「${label}」至少需要一个字段`)
      continue
    }
    const first = def.formFields[0]
    if (first.name !== 'id') {
      errors.push(`类型「${label}」的首个字段必须是 id 字段`)
    }
    if (first.name === 'id' && first.editable) {
      errors.push(`类型「${label}」的 id 字段必须为不可编辑`)
    }
    const fieldNames = new Set<string>()
    def.formFields.forEach((field, index) => {
      const fieldLabel = field.label || field.name || `第 ${index + 1} 个字段`
      if (!field.name) {
        errors.push(`类型「${label}」的「${fieldLabel}」缺少字段名`)
      } else if (!FIELD_NAME_PATTERN.test(field.name)) {
        errors.push(`类型「${label}」的字段名「${field.name}」格式不合法（需为英文/数字/下划线，且以字母或下划线开头）`)
      } else if (fieldNames.has(field.name)) {
        errors.push(`类型「${label}」的字段名「${field.name}」重复`)
      } else {
        fieldNames.add(field.name)
      }
      if (!field.label.trim()) {
        errors.push(`类型「${label}」的字段「${field.name || index + 1}」显示标签不能为空`)
      }
      if (field.type === 'spinbox' || field.type === 'double_spin') {
        if (field.from !== undefined && field.to !== undefined && field.from > field.to) {
          errors.push(`类型「${label}」的字段「${fieldLabel}」下限不能大于上限`)
        }
      }
      if (field.type === 'multiselect' && field.refType && !types.some((t) => t.id === field.refType || t.pluralKey === field.refType)) {
        errors.push(`类型「${label}」的字段「${fieldLabel}」引用了不存在的类型「${field.refType}」`)
      }
    })
  }
  return errors
}

/** 深拷贝（编辑器草稿与缓存隔离用） */
export function cloneTypes(types: DataTypeDef[]): DataTypeDef[] {
  return structuredClone(types)
}

/** 内置默认 schema 的深拷贝（首次启动 / 无用户文件时的种子） */
export function createBuiltinTypeSchema(): DataTypeDef[] {
  return cloneTypes(BUILTIN_DATA_TYPES)
}