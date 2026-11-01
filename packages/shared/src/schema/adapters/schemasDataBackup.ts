/**
 * `schemasData` 拆分件：**备份**（数据安全，破坏性操作带 confirm 布尔位）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** 创建备份：可选标签（[A-Za-z0-9_-]{1,40}），用于区分同秒内的多次备份 */
export const backupCreateInputSchema = z.object({
  label: z.string().max(40).optional()
})

/** 恢复备份：confirm 必须为 true —— 主进程再做一次校验（渲染层的确认可被绕过） */
export const backupRestoreInputSchema = z.object({
  name: z.string().min(1),
  confirm: z.boolean()
})

/** 删除备份：软删除（改名），仍需 confirm */
export const backupDeleteInputSchema = z.object({
  name: z.string().min(1),
  confirm: z.boolean()
})

export type BackupCreateInput = z.infer<typeof backupCreateInputSchema>
export type BackupRestoreInput = z.infer<typeof backupRestoreInputSchema>
export type BackupDeleteInput = z.infer<typeof backupDeleteInputSchema>
