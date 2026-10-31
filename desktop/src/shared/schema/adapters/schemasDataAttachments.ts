/**
 * `schemasData` 拆分件：**会话附件 + 用系统默认程序打开路径**。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** 会话附件：把用户选中的文件复制进 `<活跃库>/attachments/` 并返回元数据 */
export const attachmentsAddInputSchema = z.object({
  path: z.string().min(1)
})
export type AttachmentsAddInput = z.infer<typeof attachmentsAddInputSchema>

/** 会话附件：用系统默认程序打开库内附件（按叶子名解析，不含路径） */
export const attachmentsOpenInputSchema = z.object({
  name: z.string().min(1).max(260)
})
export type AttachmentsOpenInput = z.infer<typeof attachmentsOpenInputSchema>

/** 会话附件：把库内图片附件读成 data URL（按叶子名解析，缩略图/lightbox 用） */
export const attachmentsReadImageInputSchema = z.object({
  name: z.string().min(1).max(260)
})
export type AttachmentsReadImageInput = z.infer<typeof attachmentsReadImageInputSchema>

/** 用系统默认程序打开任意路径（交付文件等不在 attachments 目录的产物） */
export const shellOpenPathInputSchema = z.object({
  path: z.string().min(1)
})
export type ShellOpenPathInput = z.infer<typeof shellOpenPathInputSchema>
