/**
 * `schemasData` 拆分件：**数据类型 schema（字段结构编辑器）+ 字段模板**。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

import { FIELD_TYPES } from './typeSchemaFile'
import type { FieldType } from '../../types'

export const typeFieldDefSchema = z.object({
  name: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  type: z.enum(FIELD_TYPES as [FieldType, ...FieldType[]]),
  editable: z.boolean(),
  values: z.array(z.string().max(500)).max(500).optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  refType: z.string().max(64).optional()
})

/** 类型自定义分区（可选；见 shared/types.ts 的 TypeSectionDef） */
export const typeSectionDefSchema = z.object({
  title: z.string().min(1).max(100),
  icon: z.string().max(16),
  collapsed: z.boolean().optional(),
  fields: z.array(z.string().min(1).max(64)).max(300)
})

export const dataTypeDefSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  pluralKey: z.string().min(1).max(64),
  color: z.string().max(40),
  formFields: z.array(typeFieldDefSchema).min(1).max(300),
  /**
   * 可选分区（模板/用户定义）。
   * ⚠️ **必须显式声明**：zod 默认会剥掉未声明的键 —— 漏了它，
   * `schema:save` 会在校验阶段静默丢掉 `sections`，分区设置永远存不下来。
   */
  sections: z.array(typeSectionDefSchema).max(50).optional()
})

export const schemaSaveInputSchema = z.object({
  types: z.array(dataTypeDefSchema).min(1).max(100)
})

export type SchemaSaveInput = z.infer<typeof schemaSaveInputSchema>

/** 字段 ID 的 AI 候选请求（术语表未收录时使用） */
export const fieldIdSuggestInputSchema = z.object({
  label: z.string().min(1).max(64),
  existingNames: z.array(z.string().max(64)).max(500),
  typeName: z.string().max(64).optional(),
  fieldType: z.string().max(32).optional()
})

export type FieldIdSuggestInput = z.infer<typeof fieldIdSuggestInputSchema>

/** 用户自定义字段模板：保存（新建/覆盖）。存完整字段定义，非 旧版 那样只存标签 */
export const fieldTemplateSaveInputSchema = z.object({
  name: z.string().min(1).max(40),
  fields: z.array(typeFieldDefSchema).min(1).max(300)
})

/** 用户自定义字段模板：按名操作（读取 / 删除） */
export const fieldTemplateNameInputSchema = z.object({
  name: z.string().min(1).max(40)
})

export type FieldTemplateSaveInput = z.infer<typeof fieldTemplateSaveInputSchema>
export type FieldTemplateNameInput = z.infer<typeof fieldTemplateNameInputSchema>
