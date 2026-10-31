/**
 * `schemasData` 拆分件：**库管理**（新建 / 重命名 / 切换 / 删除整个游戏库）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** 库管理（A2-1）：新建库 */
export const libraryCreateInputSchema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional()
})

/** 库管理：重命名库 */
export const libraryRenameInputSchema = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40)
})

/** 库管理：按库名操作（切换） */
export const libraryNameInputSchema = z.object({
  name: z.string().min(1).max(40)
})

/**
 * 删除整个游戏库：**破坏性**操作，一次性抹掉该库的策划书 + 数据 + 图片。
 *
 * `confirm` 必须为 true —— 渲染层的确认可被绕过（任何未来调用点 / agent skill / 测试
 * 都能直接打这条 IPC），主进程必须再挡一次，与 `clearAllInputSchema` /
 * `backupDeleteInputSchema` / `ceshuDeleteInputSchema` 同一约定。
 *
 * ⚠️ 此前本通道**只有 `libraryNameInputSchema{name}`、且渲染层点一下就直接删**：
 * ① 无契约层 confirm，② 无 UX 二次确认，③ 删除**不走撤销**（撤销只覆盖数据条目，
 * 不覆盖整库删除）⇒ 误点一次即永久丢失整个库。这是本仓「破坏性操作必须有契约层
 * confirm」铁律下最后一个漏网的入口（`data:clearAll` / `ceshu:delete` /
 * `backup:*` / `images:deleteImages` 均已守住）。
 */
export const libraryRemoveInputSchema = z.object({
  name: z.string().min(1).max(40),
  confirm: z.boolean()
})

export type LibraryCreateInput = z.infer<typeof libraryCreateInputSchema>
export type LibraryRenameInput = z.infer<typeof libraryRenameInputSchema>
export type LibraryNameInput = z.infer<typeof libraryNameInputSchema>
export type LibraryRemoveInput = z.infer<typeof libraryRemoveInputSchema>
