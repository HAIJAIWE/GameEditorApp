/**
 * `schemasData` 拆分件：**数据条目 CRUD + 批量操作**（`data:*` 通道）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

import { ADJUST_MODES, BATCH_OP_KINDS } from '../../util/data'

export const listItemsInputSchema = z.object({
  type: z.string().min(1)
})

export const createItemInputSchema = z.object({
  type: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
  /**
   * 创建即标记为「AI 生成、待核对」。AI 数据生成面板导入时传，
   * 人工新建不传（`undefined` = 人工创建的条目，列表上不带待核对点）。
   */
  aiGeneratedAt: z.string().min(1).optional()
})

export const deleteItemInputSchema = z.object({
  id: z.string().min(1)
})

export const updateItemInputSchema = z.object({
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown())
})

export type ListItemsInput = z.infer<typeof listItemsInputSchema>
export type CreateItemInput = z.infer<typeof createItemInputSchema>
export type DeleteItemInput = z.infer<typeof deleteItemInputSchema>
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>

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

/**
 * 清空所有数据：**破坏性**操作。
 * confirm 必须为 true —— 渲染层的二次确认可被绕过，主进程再校验一次
 * （与 `backupRestoreInputSchema` / `backupDeleteInputSchema` 同一约定）。
 */
export const clearAllInputSchema = z.object({
  confirm: z.boolean()
})

export const referencesInputSchema = z.object({
  id: z.string().min(1)
})

export type BatchOpInput = z.infer<typeof batchOpSchema>
export type BatchUpdateInput = z.infer<typeof batchUpdateInputSchema>
export type DeleteManyInput = z.infer<typeof deleteManyInputSchema>
export type ClearAllInput = z.infer<typeof clearAllInputSchema>
export type ReferencesInput = z.infer<typeof referencesInputSchema>
