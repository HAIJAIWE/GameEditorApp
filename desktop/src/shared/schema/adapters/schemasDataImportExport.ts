/**
 * `schemasData` 拆分件：**数据导入导出**（旧版迁移 / CSV·Excel / 数据快照）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/* ---- 旧版数据迁移（导入 / 导出整份文件） ---- */

export const importLegacyInputSchema = z.object({
  path: z.string().min(1)
})

export const exportLegacyInputSchema = z.object({
  path: z.string().min(1)
})

export type ImportLegacyInput = z.infer<typeof importLegacyInputSchema>
export type ExportLegacyInput = z.infer<typeof exportLegacyInputSchema>

/* ---- 游戏数据 CSV / Excel 导入导出（features/export 迁移） ---- */

/** 导出目录（CSV 按类型分文件 / Excel 写 game_data.xlsx） */
export const exportDirInputSchema = z.object({
  dir: z.string().min(1)
})

/** 导入源文件路径（CSV / Excel） */
export const importDataFileInputSchema = z.object({
  path: z.string().min(1)
})

/** 导入预览：选好的文件 + 类型（决定用 Excel 还是 CSV 解析器） */
export const previewImportInputSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(['excel', 'csv'])
})

/** 确认导入：带回预览时拿到的会话 id（解析结果在主进程暂存，不重复读文件） */
export const applyImportInputSchema = z.object({
  previewId: z.string().min(1)
})

export type ExportDirInput = z.infer<typeof exportDirInputSchema>
export type ImportDataFileInput = z.infer<typeof importDataFileInputSchema>
export type PreviewImportInput = z.infer<typeof previewImportInputSchema>
export type ApplyImportInput = z.infer<typeof applyImportInputSchema>

/* ---- 数据快照导出（给人 / 给 git 审核，不是给游戏运行吃） ---- */

/** 快照格式：json = 确定性可 diff 的全量数据；csv = 单表宽表（每行一条） */
export const dataSnapshotFormatSchema = z.enum(['json', 'csv'])

/**
 * 数据快照导出：把 SQLite 全量数据 + 类型 schema 渲染成**确定性可 git diff** 的 JSON/CSV，
 * 让策划改动能在 PR 里逐行审核（SQLite 真相源本身不可读、blob diff 噪声大）。
 * 与 `engine:exportData`（给游戏运行态的产物）不同：本通道是**审查件**。
 */
export const dataSnapshotInputSchema = z.object({
  /** 目标路径（含扩展名；缺省时按 format 兜底补 .json/.csv） */
  path: z.string().min(1),
  format: dataSnapshotFormatSchema.default('json')
})

export const dataSnapshotFileDialogInputSchema = z.object({
  defaultName: z.string().min(1).max(120).optional(),
  format: dataSnapshotFormatSchema.default('json'),
  defaultPath: z.string().min(1).max(4096).optional()
})

export type DataSnapshotFormat = z.infer<typeof dataSnapshotFormatSchema>
export type DataSnapshotInput = z.infer<typeof dataSnapshotInputSchema>
export type DataSnapshotFileDialogInput = z.infer<typeof dataSnapshotFileDialogInputSchema>
