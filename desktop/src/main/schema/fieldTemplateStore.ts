import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

import { FIELD_TYPES } from '../../shared/typeSchemaFile'
import type { TypeFieldDef } from '../../shared/types'

/**
 * 用户自定义**字段模板**存储（本模块内唯一写者）。
 *
 * ## 为什么存「完整字段定义」而不是 旧版 那样只存标签
 * 旧版 `TemplateManagerDialog.save_current_as_template` 只写
 * `template_data["fields"][type][field["name"]] = field["label"]`，
 * `apply_template` 也**只覆盖 label** —— 字段类型 / 可选值 / 数值范围 / 是否可编辑
 * **全部丢失**，是个残废语义（实证见 `src/config/settings:780-786`）。
 * 本移植**刻意不复制该缺陷**：模板存完整 `TypeFieldDef[]`，应用即整体还原。
 *
 * ## 存储形态
 * 单文件 `<库>/field_templates.json`：`{ [模板名]: TypeFieldDef[] }`。
 * 与 旧版「每个模板一个 .json 文件」不同 —— 单文件天然免疫模板名里的路径分隔符问题，
 * 也便于整体导入导出。
 */

/** 自定义模板表：模板名 → 完整字段定义数组 */
export type FieldTemplateMap = Record<string, TypeFieldDef[]>

/** 模板名上限（与库名等其它命名保持一致量级） */
export const MAX_TEMPLATE_NAME = 40

export class FieldTemplateStore {
  private cache: FieldTemplateMap | null = null

  constructor(private readonly filePath: string) {}

  /** 全部自定义模板名（按名称排序，稳定展示） */
  listNames(): string[] {
    return Object.keys(this.load()).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }

  /** 取某个自定义模板的字段定义；不存在返回 null */
  get(name: string): TypeFieldDef[] | null {
    const fields = this.load()[name]
    return fields ? structuredClone(fields) : null
  }

  /**
   * 保存（新建或覆盖）一个自定义模板。
   * 校验：名称非空且不含路径分隔符、字段非空、字段名非空、字段类型受支持。
   */
  save(name: string, fields: TypeFieldDef[]): void {
    const trimmed = name.trim()
    if (trimmed === '') throw new Error('模板名称不能为空')
    if (trimmed.length > MAX_TEMPLATE_NAME) throw new Error(`模板名称不能超过 ${MAX_TEMPLATE_NAME} 个字符`)
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      throw new Error('模板名称不能包含路径分隔符')
    }
    validateFields(fields)
    const all = this.load()
    all[trimmed] = structuredClone(fields)
    this.persist(all)
  }

  /** 删除自定义模板；不存在返回 false */
  remove(name: string): boolean {
    const all = this.load()
    if (!(name in all)) return false
    delete all[name]
    this.persist(all)
    return true
  }

  private load(): FieldTemplateMap {
    if (this.cache !== null) return this.cache
    if (!existsSync(this.filePath)) {
      this.cache = {}
      return this.cache
    }
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch (error) {
      throw new Error(
        `读取字段模板文件失败（${this.filePath}）：${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    this.cache = parseTemplateMap(raw)
    return this.cache
  }

  /** 原子写：临时文件 + rename（与 TypeSchemaStore 同构，避免写一半损坏） */
  private persist(all: FieldTemplateMap): void {
    const tempPath = `${this.filePath}.tmp`
    try {
      writeFileSync(tempPath, JSON.stringify(all, null, 2), 'utf-8')
      renameSync(tempPath, this.filePath)
    } catch (error) {
      throw new Error(`写入字段模板文件失败：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }
    this.cache = all
  }
}

/** 解析并校验落盘内容；结构不对的条目丢弃而非整体报错（避免一个坏模板毁掉全部） */
function parseTemplateMap(raw: unknown): FieldTemplateMap {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: FieldTemplateMap = {}
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const fields = value.filter(isTypeFieldDef)
    if (fields.length > 0) result[name] = fields
  }
  return result
}

function isTypeFieldDef(value: unknown): value is TypeFieldDef {
  if (value === null || typeof value !== 'object') return false
  const field = value as Record<string, unknown>
  return typeof field.name === 'string' && field.name !== '' && typeof field.type === 'string'
}

/** 保存前校验字段定义（与 `validateTypeSchema` 的字段级规则保持一致口径） */
function validateFields(fields: TypeFieldDef[]): void {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error('模板至少要包含一个字段')
  }
  const seen = new Set<string>()
  for (const field of fields) {
    if (typeof field.name !== 'string' || field.name.trim() === '') {
      throw new Error('字段名不能为空')
    }
    if (seen.has(field.name)) {
      throw new Error(`字段名重复：${field.name}`)
    }
    seen.add(field.name)
    if (!(FIELD_TYPES as readonly string[]).includes(field.type)) {
      throw new Error(`不支持的字段类型：${String(field.type)}`)
    }
  }
}
