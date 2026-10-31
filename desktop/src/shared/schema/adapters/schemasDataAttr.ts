/**
 * `schemasData` 拆分件：**属性系统**（`attr:*` 通道：保存 / 导出 / 导入 / 文件对话框）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

import { ATTR_TYPES } from '../../attrSystem'

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

/** 属性系统整体（`attributes` 按 id 索引）；本文件内部复用，不对外导出 */
const attrSystemSchema = z.object({
  attributes: z.record(z.string().min(1).max(64), attrDefinitionSchema)
})

export const attrSystemSaveInputSchema = z.object({
  system: attrSystemSchema
})

/** 导出游戏配置：路径 + 当前草稿系统 */
export const attrGameConfigExportInputSchema = z.object({
  path: z.string().min(1),
  system: attrSystemSchema
})

/** 导出属性系统 JSON：路径 + 当前草稿系统 */
export const attrSystemJsonExportInputSchema = z.object({
  path: z.string().min(1),
  system: attrSystemSchema
})

/** 导入属性系统 JSON：仅路径（主进程读文件并解析） */
export const attrSystemJsonImportInputSchema = z.object({
  path: z.string().min(1)
})

/** 属性系统 JSON 文件选择对话框（mode 区分导入/导出；导出可用 defaultName 预填文件名） */
export const attrJsonDialogInputSchema = z.object({
  mode: z.enum(['open', 'save']),
  defaultName: z.string().max(200).optional()
})

export type AttrSystemSaveInput = z.infer<typeof attrSystemSaveInputSchema>
export type AttrGameConfigExportInput = z.infer<typeof attrGameConfigExportInputSchema>
export type AttrSystemJsonExportInput = z.infer<typeof attrSystemJsonExportInputSchema>
export type AttrSystemJsonImportInput = z.infer<typeof attrSystemJsonImportInputSchema>
export type AttrJsonDialogInput = z.infer<typeof attrJsonDialogInputSchema>
