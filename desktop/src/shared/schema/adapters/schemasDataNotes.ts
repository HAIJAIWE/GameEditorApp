/**
 * `schemasData` 拆分件：**章节笔记**（`notes:*` 通道）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

export const notesListInputSchema = z.object({
  id: z.string().min(1),
  chapterKey: z.string().max(50).optional()
})

export const notesAddInputSchema = z.object({
  id: z.string().min(1),
  chapterKey: z.string().min(1).max(50),
  content: z.string().max(20000).default(''),
  author: z.string().max(100).optional()
})

export const notesUpdateInputSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1),
  content: z.string().max(20000).default(''),
  author: z.string().max(100).optional()
})

export const notesDeleteInputSchema = z.object({
  id: z.string().min(1),
  noteId: z.string().min(1)
})

export type NotesListInput = z.infer<typeof notesListInputSchema>
export type NotesAddInput = z.infer<typeof notesAddInputSchema>
export type NotesUpdateInput = z.infer<typeof notesUpdateInputSchema>
export type NotesDeleteInput = z.infer<typeof notesDeleteInputSchema>
