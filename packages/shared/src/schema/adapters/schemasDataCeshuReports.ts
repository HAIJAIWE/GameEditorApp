/**
 * `schemasData` 拆分件：**策划书报告 / 版本对比导出**（渲染层生成 Markdown，主进程原子写盘）。
 *
 * 文档本体见 `schemasDataCeshu.ts`，AI 生成见 `schemasDataCeshuAi.ts`。
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** AI 审阅报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuReviewExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 版本对比：两个不同版本 id */
export const ceshuDiffInputSchema = z.object({
  id: z.string().min(1),
  otherId: z.string().min(1)
})

/** 版本对比报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuDiffExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 完备度报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuReadinessExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 校验报告导出（渲染层生成 Markdown，主进程原子写盘） */
export const ceshuValidationExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/** 变更日志导出（渲染层生成 MD/HTML/Text，主进程原子写盘） */
export const ceshuChangelogExportInputSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1)
})

/**
 * 报告文件保存对话框（按扩展名/显示名动态生成过滤器）。
 * 用于「导出校验报告 / 变更日志」这类**非策划书导出格式枚举**内的文件
 * （`CESHU_EXPORT_FORMATS` 只有 markdown/html/docx/pptx/pdf/excel，不含纯文本）。
 */
export const reportFileDialogInputSchema = z.object({
  defaultName: z.string().max(200),
  /** 含点扩展名，如 `.md` / `.html` / `.txt` */
  extension: z.string().min(2).max(10),
  label: z.string().min(1).max(50)
})

export type CeshuReviewExportInput = z.infer<typeof ceshuReviewExportInputSchema>
export type CeshuDiffInput = z.infer<typeof ceshuDiffInputSchema>
export type CeshuDiffExportInput = z.infer<typeof ceshuDiffExportInputSchema>
export type CeshuReadinessExportInput = z.infer<typeof ceshuReadinessExportInputSchema>
export type CeshuValidationExportInput = z.infer<typeof ceshuValidationExportInputSchema>
export type CeshuChangelogExportInput = z.infer<typeof ceshuChangelogExportInputSchema>
export type ReportFileDialogInput = z.infer<typeof reportFileDialogInputSchema>
