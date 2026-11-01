import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'

import type { DataTypeDef } from '@mobai/shared/types'
import {
  DEFAULT_TYPE_SCHEMA_VERSION,
  cloneTypes,
  createBuiltinTypeSchema,
  parseTypeSchemaFile,
  serializeTypeSchema,
  validateTypeSchema
} from '@mobai/shared/schema/adapters'

/**
 * 数据类型 schema 存储（本模块内唯一写者）。
 * - 文件：<userData>/type_schema.json（与 早期版本 <库目录>/type_schema.json 同构）
 * - 缺省文件时以内置 12 类型为种子（仅在用户保存后落盘）
 * - 保存前做领域校验（id 格式/唯一、id 首字段、refType 存在性等），原子写：临时文件 + rename
 */
export class TypeSchemaStore {
  private cache: DataTypeDef[] | null = null
  private version = DEFAULT_TYPE_SCHEMA_VERSION

  constructor(private readonly filePath: string) {}

  /** 当前生效的类型列表（懒加载；文件损坏时抛中文错误，由 IPC 统一转为错误响应） */
  getTypes(): DataTypeDef[] {
    if (!this.cache) {
      this.cache = this.load()
    }
    return cloneTypes(this.cache)
  }

  /** 保存整份 schema（字段结构编辑器提交入口）；返回落盘后的类型列表 */
  saveTypes(types: DataTypeDef[]): DataTypeDef[] {
    const errors = validateTypeSchema(types)
    if (errors.length > 0) {
      throw new Error(`字段结构校验失败：\n${errors.join('\n')}`)
    }
    const payload = serializeTypeSchema(types, this.version)
    const tempPath = `${this.filePath}.tmp`
    try {
      writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf-8')
      renameSync(tempPath, this.filePath)
    } catch (error) {
      throw new Error(`写入字段结构文件失败：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }
    this.cache = cloneTypes(types)
    return cloneTypes(this.cache)
  }

  private load(): DataTypeDef[] {
    if (!existsSync(this.filePath)) {
      return createBuiltinTypeSchema()
    }
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch (error) {
      throw new Error(
        `读取字段结构文件失败（${this.filePath}）：${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    const parsed = parseTypeSchemaFile(raw)
    this.version = parsed.version
    return parsed.types
  }
}