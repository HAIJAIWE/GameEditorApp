import { z } from 'zod'

import { CESHU_EXPORT_FORMATS } from './ceshuConstants'
import { FIELD_TYPES } from './typeSchemaFile'
import type { FieldType } from './types'

/**
 * IPC 请求 schema（仅主进程导入，用于入口运行时校验）。
 * 注意：本文件包含 zod 运行时依赖，不要被 preload 直接导入。
 */

export const listItemsInputSchema = z.object({
  type: z.string().min(1)
})

export const createItemInputSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({})
})

export const deleteItemInputSchema = z.object({
  id: z.string().min(1)
})

export const importLegacyInputSchema = z.object({
  path: z.string().min(1)
})

export const updateItemInputSchema = z.object({
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown())
})

export const exportLegacyInputSchema = z.object({
  path: z.string().min(1)
})

/* ---- 数据类型 schema（字段结构编辑器） ---- */

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

export const dataTypeDefSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  pluralKey: z.string().min(1).max(64),
  color: z.string().max(40),
  formFields: z.array(typeFieldDefSchema).min(1).max(300)
})

export const schemaSaveInputSchema = z.object({
  types: z.array(dataTypeDefSchema).min(1).max(100)
})

/* ---- 策划书（GDD） ---- */

export const ceshuCreateInputSchema = z.object({
  name: z.string().max(200).default(''),
  scope: z.enum(['full', 'lite']).default('full')
})

export const ceshuGetInputSchema = z.object({
  id: z.string().min(1)
})

export const ceshuSaveChapterInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  /** 同时写回的文档级字段（一键生成应用时写入风格/类型 key） */
  style: z.string().max(50).optional(),
  moduleType: z.string().max(50).optional()
})

export const ceshuExportInputSchema = z.object({
  id: z.string().min(1),
  format: z.enum(CESHU_EXPORT_FORMATS),
  path: z.string().min(1)
})

export const ceshuChooseExportFileInputSchema = z.object({
  format: z.enum(CESHU_EXPORT_FORMATS),
  defaultName: z.string().max(200).default('策划书')
})

export const ceshuDeriveInputSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(500).default('')
})

export const ceshuAiGenerateInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  onlyEmpty: z.boolean().default(false),
  /** 一键生成上下文：draft 仅合并进提示词作为上下文，不写盘 */
  fullGenerate: z
    .object({
      styleKey: z.string().max(50).default(''),
      extraPrompt: z.string().max(6000).default(''),
      draft: z.record(z.string(), z.record(z.string(), z.unknown())).default({})
    })
    .optional()
})

export type ListItemsInput = z.infer<typeof listItemsInputSchema>
export type CreateItemInput = z.infer<typeof createItemInputSchema>
export type DeleteItemInput = z.infer<typeof deleteItemInputSchema>
export type ImportLegacyInput = z.infer<typeof importLegacyInputSchema>
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>
export type ExportLegacyInput = z.infer<typeof exportLegacyInputSchema>
export type SchemaSaveInput = z.infer<typeof schemaSaveInputSchema>
export type CeshuCreateInput = z.infer<typeof ceshuCreateInputSchema>
export type CeshuSaveChapterInput = z.infer<typeof ceshuSaveChapterInputSchema>
export type CeshuExportInput = z.infer<typeof ceshuExportInputSchema>
export type CeshuChooseExportFileInput = z.infer<typeof ceshuChooseExportFileInputSchema>
export type CeshuDeriveInput = z.infer<typeof ceshuDeriveInputSchema>
export type CeshuAiGenerateInput = z.infer<typeof ceshuAiGenerateInputSchema>