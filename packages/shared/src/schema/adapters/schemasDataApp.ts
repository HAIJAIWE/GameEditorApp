/**
 * `schemasData` 拆分件：**应用级通道**——日志上报 / 窗口模式 / 视图菜单动作 / 代码面板文件系统。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** 渲染层转发到主进程的日志条目 */
export const appLogInputSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().min(1).max(4096),
  meta: z.unknown().optional()
})

/** 渲染层上报最后停留的界面模式（落进 window-state.json，下次启动恢复） */
export const windowModeInputSchema = z.object({
  mode: z.enum(['data', 'ceshu', 'digital'])
})
export type WindowModeInput = z.infer<typeof windowModeInputSchema>

/** 视图菜单动作（缩放 / 重载 / 开发者工具）：主进程对**聚焦窗口**的 webContents 执行 */
export const appViewActionSchema = z.enum(['zoomIn', 'zoomOut', 'zoomReset', 'reload', 'toggleDevTools'])

export const appViewActionInputSchema = z.object({
  action: appViewActionSchema
})

export type AppViewActionInput = z.infer<typeof appViewActionInputSchema>

/** 代码面板：列目录（path 为绝对路径，空串由主进程回落默认根） */
export const fsListDirInputSchema = z.object({
  path: z.string()
})
export type FsListDirInput = z.infer<typeof fsListDirInputSchema>

/** 代码面板：读文本文件（主进程做大小/二进制双重闸） */
export const fsReadFileInputSchema = z.object({
  path: z.string().min(1)
})
export type FsReadFileInput = z.infer<typeof fsReadFileInputSchema>
