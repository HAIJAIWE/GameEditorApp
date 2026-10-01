import { z } from 'zod'

import { ATTR_TYPES } from './attrSystem'
import { CESHU_EXPORT_FORMATS } from './ceshuConstants'
import { ADJUST_MODES, BATCH_OP_KINDS } from './dataTableOps'
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

/* ---- 数据表批量操作 ---- */

export const batchOpSchema = z
  .object({
    kind: z.enum(BATCH_OP_KINDS),
    field: z.string().min(1).max(64),
    value: z.string().max(5000).default(''),
    separator: z.string().max(20).default(','),
    mode: z.enum(ADJUST_MODES).default('add'),
    adjust: z.number().int().min(-99999).max(99999).default(0)
  })
  .superRefine((op, ctx) => {
    if (op.kind === 'append_value' && op.value === '') {
      ctx.addIssue({ code: 'custom', message: '请填写追加内容' })
    }
    if (op.kind === 'add_tag' && op.value === '') {
      ctx.addIssue({ code: 'custom', message: '请填写标签内容' })
    }
  })

export const batchUpdateInputSchema = z.object({
  type: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(5000),
  op: batchOpSchema
})

export const deleteManyInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(5000)
})

export const referencesInputSchema = z.object({
  id: z.string().min(1)
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

/* ---- 属性系统 ---- */

export const attrFormulaSchema = z.object({
  coefficients: z.record(z.string().min(1).max(64), z.number()),
  baseValue: z.number()
})

export const attrDefinitionSchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(ATTR_TYPES),
  category: z.string().max(64),
  displayName: z.string().max(64),
  minValue: z.number(),
  maxValue: z.number().nullable(),
  defaultValue: z.number(),
  formula: attrFormulaSchema
})

const attrSystemSchema = z.object({
  attributes: z.record(z.string().min(1).max(64), attrDefinitionSchema)
})

export const attrSystemSaveInputSchema = z.object({
  system: attrSystemSchema
})

/** 导出游戏配置：路径 + 当前草稿系统（导出未保存的编辑，对应 Python 就地编辑后导出） */
export const attrGameConfigExportInputSchema = z.object({
  path: z.string().min(1),
  system: attrSystemSchema
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
export type BatchOpInput = z.infer<typeof batchOpSchema>
export type BatchUpdateInput = z.infer<typeof batchUpdateInputSchema>
export type DeleteManyInput = z.infer<typeof deleteManyInputSchema>
export type ReferencesInput = z.infer<typeof referencesInputSchema>
export type SchemaSaveInput = z.infer<typeof schemaSaveInputSchema>
export type AttrSystemSaveInput = z.infer<typeof attrSystemSaveInputSchema>
export type AttrGameConfigExportInput = z.infer<typeof attrGameConfigExportInputSchema>
export type CeshuCreateInput = z.infer<typeof ceshuCreateInputSchema>
export type CeshuSaveChapterInput = z.infer<typeof ceshuSaveChapterInputSchema>
export type CeshuExportInput = z.infer<typeof ceshuExportInputSchema>
export type CeshuChooseExportFileInput = z.infer<typeof ceshuChooseExportFileInputSchema>
export type CeshuDeriveInput = z.infer<typeof ceshuDeriveInputSchema>
export type CeshuAiGenerateInput = z.infer<typeof ceshuAiGenerateInputSchema>