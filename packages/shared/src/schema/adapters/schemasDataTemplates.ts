/**
 * `schemasData` 拆分件：**自定义模板**（`templates:*` 通道 + 模板 JSON 文件对话框）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

export const templatesListInputSchema = z.object({
  chapterKey: z.string().max(50).optional()
})

export const templatesSaveInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  tags: z.array(z.string().max(50)).max(50).default([]),
  /** 所属章节键；空串表示全局模板 */
  chapterKey: z.string().max(50).default(''),
  data: z.record(z.string(), z.unknown()).default({}),
  sourceGame: z.string().max(200).default('')
})

export const templatesDeleteInputSchema = z.object({
  id: z.string().min(1)
})

export const templatesUpdateInputSchema = z.object({
  id: z.string().min(1),
  /** 名称传空串时由存储层判定为「更新失败」 */
  name: z.string().max(200).default(''),
  description: z.string().max(2000).default(''),
  tags: z.array(z.string().max(50)).max(50).default([]),
  chapterKey: z.string().max(50).default(''),
  data: z.record(z.string(), z.unknown()).default({}),
  sourceGame: z.string().max(200).default('')
})

export const templatesExportInputSchema = z.object({
  path: z.string().min(1)
})

export const templatesImportInputSchema = z.object({
  path: z.string().min(1),
  overwrite: z.boolean().default(false)
})

/** 模板 JSON 文件选择（open=导入 / save=导出），与 attr 侧 dialog 通道同构 */
export const templateJsonDialogInputSchema = z.object({
  mode: z.enum(['open', 'save']),
  defaultName: z.string().max(200).optional()
})

export type TemplatesListInput = z.infer<typeof templatesListInputSchema>
export type TemplatesSaveInput = z.infer<typeof templatesSaveInputSchema>
export type TemplatesDeleteInput = z.infer<typeof templatesDeleteInputSchema>
export type TemplatesUpdateInput = z.infer<typeof templatesUpdateInputSchema>
export type TemplatesExportInput = z.infer<typeof templatesExportInputSchema>
export type TemplatesImportInput = z.infer<typeof templatesImportInputSchema>
export type TemplateJsonDialogInput = z.infer<typeof templateJsonDialogInputSchema>
