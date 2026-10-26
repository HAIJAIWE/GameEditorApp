import { BUILTIN_DATA_TYPES } from './typeSchema'
import type { DataTypeDef, FieldType, TypeFieldDef, TypeSectionDef } from './types'

/**
 * 数据类型 schema 的文件格式与校验（跨进程共用）。
 * 磁盘格式与 早期版本 <库目录>/type_schema.json 同构（snake_case），便于存量 schema 互通：
 *   { "version": "2.4", "data_types": [{ id, name, plural_key, color, form_fields: [...] }] }
 * 字段键：name/label/type/editable/values/from_/to/ref_type（TS 内部用 camelCase from/to/refType）。
 */

/** 字段类型中文标签（与 旧版 config/constants FIELD_TYPE_MAP 一致 + attrtable + attrpanel） */
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

interface TypeSchemaFileSection {
  title: string
  icon: string
  collapsed?: boolean
  fields: string[]
}

interface TypeSchemaFileType {
  id: string
  name: string
  plural_key: string
  color: string
  form_fields: TypeSchemaFileField[]
  /** 可选的自定义分区（旧版 侧忽略未知键，故与旧文件互通） */
  sections?: TypeSchemaFileSection[]
}

export interface TypeSchemaFile {
  version: string
  data_types: TypeSchemaFileType[]
}

/** 序列化为 旧版 兼容的 type_schema.json 结构（camelCase → snake_case） */
export function serializeTypeSchema(types: DataTypeDef[], version = DEFAULT_TYPE_SCHEMA_VERSION): TypeSchemaFile {
  return {
    version,
    data_types: types.map((def) => {
      const serializedType: TypeSchemaFileType = {
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
      }
      // 只有确实定义了分区才写该键：内置类型没有 sections，落盘结构与旧版逐字节一致。
      // 同时**剪除已删除字段的引用**、丢弃剪完变空的分区 —— 字段被删后分区引用会悬空，
      // 留着只会让文件越积越脏（渲染本来就跳过，剪掉不影响显示）。
      if (def.sections !== undefined && def.sections.length > 0) {
        const fieldNames = new Set(def.formFields.map((field) => field.name))
        const pruned: TypeSchemaFileSection[] = []
        for (const section of def.sections) {
          const fields = section.fields.filter((name) => fieldNames.has(name))
          if (fields.length === 0) continue
          const serializedSection: TypeSchemaFileSection = { title: section.title, icon: section.icon, fields }
          if (section.collapsed !== undefined) serializedSection.collapsed = section.collapsed
          pruned.push(serializedSection)
        }
        if (pruned.length > 0) serializedType.sections = pruned
      }
      return serializedType
    })
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
  const def: DataTypeDef = {
    id,
    name,
    pluralKey: readString(record.plural_key) || `${id}s`,
    color: readString(record.color) || '#607D8B',
    formFields: rawFields.map((field, fieldIndex) => parseField(field, name, fieldIndex))
  }
  const sections = parseSections(record.sections)
  if (sections.length > 0) def.sections = sections
  return def
}

/**
 * 解析可选的分区定义。结构不合法的条目**丢弃而非抛错**：
 * 分区只是排版辅助，不该因为一个坏分区让整份 schema（乃至整个应用）打不开。
 */
function parseSections(raw: unknown): TypeSectionDef[] {
  if (!Array.isArray(raw)) return []
  const sections: TypeSectionDef[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const title = readString(record.title)
    const fields = Array.isArray(record.fields)
      ? record.fields.filter((name): name is string => typeof name === 'string' && name !== '')
      : []
    if (!title || fields.length === 0) continue
    const section: TypeSectionDef = { title, icon: readString(record.icon) || '📌', fields }
    if (typeof record.collapsed === 'boolean') section.collapsed = record.collapsed
    sections.push(section)
  }
  return sections
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
    /*
     * **刻意降级而非抛错**（对齐 旧版 `field_config` 的 `else: QLineEdit()` 兜底）。
     *
     * 为什么必须这样：字段结构文件存在 `<库目录>/type_schema.json`，**与 早期版本同构**
     * （`main/stores.ts` 用 `join(libDir, 'type_schema.json')`）。旧版 支持而 TS 尚未收录的
     * 控件类型（已核实：`ref` 引用表、`textarea`）会让旧库文件带着未知 type —— 若这里 throw，
     * `TypeSchemaStore.load()` 会把异常一路抛到 `schema:list`，结果是**整个应用打不开**，
     * 用户的数据（旧策划书/条目）全部访问不到。为一个「控件没收录」把整个应用锁死不划算。
     *
     * 降级为最接近的可用控件（未知类型一律当单行文本），保证**库能打开、数据能读写**；
     * 原始 type 串记到控制台，方便后续补控件时对账。
     */
    console.warn(
      `[typeSchemaFile] 类型「${typeName}」的字段「${name}」使用了 TS 尚未收录的控件类型「${type}」，已降级为「entry」`
    )
  }

  const field: TypeFieldDef = {
    name,
    label: readString(record.label) || name,
    type: isFieldType(type) ? type : 'entry',
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
    // 可选分区：校验标题/字段存在性/不重复归组（允许有未归组字段，它们会并入第一个分区）
    if (def.sections !== undefined && def.sections.length > 0) {
      const allFieldNames = new Set(def.formFields.map((field) => field.name))
      const groupedNames = new Set<string>()
      def.sections.forEach((section, index) => {
        const sectionLabel = section.title || `第 ${index + 1} 个分区`
        if (!section.title.trim()) {
          errors.push(`类型「${label}」的${sectionLabel}标题不能为空`)
        }
        if (section.fields.length === 0) {
          errors.push(`类型「${label}」的分区「${sectionLabel}」至少需要一个字段`)
        }
        for (const name of section.fields) {
          // 引用已删除的字段**不算错**：渲染时跳过、保存时由 serializeTypeSchema 剪除。
          // 若这里报错，用户「套用模板后删掉一个字段」就会卡在无法保存（且没有编辑分区的 UI）。
          if (!allFieldNames.has(name)) continue
          if (groupedNames.has(name)) {
            errors.push(`类型「${label}」的字段「${name}」被归入多个分区`)
          } else {
            groupedNames.add(name)
          }
        }
      })
    }
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