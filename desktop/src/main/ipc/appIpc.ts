import { BrowserWindow } from 'electron'

import { log } from '../../shared/util/logger'
import type { LogLevel } from '../../shared/types'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { appLogInputSchema, appViewActionInputSchema, windowModeInputSchema } from '../../shared/schema/schemas'

export function registerAppIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { getAppInfo, setWindowMode } = deps
  handle('app:info', undefined, () => getAppInfo())
  // 窗口状态：渲染层切模式时上报，落进 window-state.json（下次启动恢复）
  handle('app:setWindowMode', windowModeInputSchema, (req) => {
    setWindowMode(req.mode)
    return undefined
  })
  // 视图菜单动作：对聚焦窗口的 webContents 执行缩放/重载/DevTools。
  // 缩放范围 [0.5, 3]，步长 0.1（与常见编辑器的 Ctrl +/- 体感一致）。
  handle('app:viewAction', appViewActionInputSchema, (req) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win === null) return undefined
    const contents = win.webContents
    if (req.action === 'reload') {
      contents.reload()
      return undefined
    }
    if (req.action === 'toggleDevTools') {
      contents.toggleDevTools()
      return undefined
    }
    const current = contents.getZoomFactor()
    const next =
      req.action === 'zoomIn' ? Math.min(current + 0.1, 3) : req.action === 'zoomOut' ? Math.max(current - 0.1, 0.5) : 1
    contents.setZoomFactor(next)
    return undefined
  })
  // 渲染层转发日志：req 为单条日志条目，主进程按自身配置写入文件
  handle('app:log', appLogInputSchema, (req) => {
    const sink: Record<LogLevel, (message: string, meta?: unknown) => void> = {
      debug: log.debug,
      info: log.info,
      warn: log.warn,
      error: log.error
    }
    sink[req.level](req.message, req.meta)
    return undefined
  })
}
