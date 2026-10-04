/** 跨进程共享的数据类型（主进程 / preload / 渲染层三端共用） */

export interface ItemRecord {
  id: string
  type: string
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  dbPath: string
}

/** 单条日志条目（渲染层 → 主进程转发的载荷） */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface AppLogInput {
  level: LogLevel
  message: string
  /** 可选的结构化附带信息（错误对象、上下文等） */
  meta?: unknown
}

/* ---- 数据类型 schema（自 Python 版 core/defaults/rpg_schema.py v2.4 匹平迁移） ---- */

export type FieldType =
  | 'entry'
  | 'spinbox'
  | 'double_spin'
  | 'combobox'
  | 'multiselect'
  | 'desc'
  | 'content'
  | 'tags'
  | 'template'
  | 'image'
  | 'image_desc'
  | 'image_tags'
  | 'attrtable'
  | 'attrpanel'
  | 'droptable'
  | 'achievement_desc'
  | 'dialog'

export interface TypeFieldDef {
  name: string
  label: string
  type: FieldType
  /** 是否允许用户编辑（id 等系统字段为 false） */
  editable: boolean
  /** combobox/template 的可选值 */
  values?: string[]
  /** spinbox 下限（对应 Python 侧 from_） */
  from?: number
  /** spinbox 上限 */
  to?: number
  /** multiselect 引用的数据类型 id */
  refType?: string
}

export interface DataTypeDef {
  /** 单数键：新架构内部与存储使用 */
  id: string
  /** 中文名 */
  name: string
  /** 旧版数据文件的复数键（导入映射用） */
  pluralKey: string
  color: string
  formFields: TypeFieldDef[]
}

/** 批量字段操作结果（affected=已写入，skipped=非数值跳过，missing=不存在或类型不符） */
export interface BatchUpdateSummary {
  affected: number
  skipped: number
  missing: number
}

/** 批量删除结果 */
export interface DeleteManySummary {
  deleted: number
  missing: number
}

/** 旧数据导入结果 */
export interface ImportSummary {
  filePath: string
  totalItems: number
  imported: number
  updated: number
  skipped: number
  /** 每类型入库条数（键为数据类型 id 或未识别复数键） */
  byType: Record<string, number>
  /** 文件中出现但当前 schema 未收录的复数键及其条数（数据已保留入库） */
  unknownTypes: Record<string, number>
}

/** 数据导出结果（导回旧版 JSON 交换格式） */
export interface ExportSummary {
  filePath: string
  totalItems: number
  /** 每类型导出条数（键为数据类型 id 或原始键名） */
  byType: Record<string, number>
}