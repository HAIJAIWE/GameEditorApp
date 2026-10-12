import { log } from '../../shared/util/logger'
import type { LogLevel } from '../../shared/types'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { appLogInputSchema, windowModeInputSchema } from '../../shared/schemas'

export function registerAppIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { getAppInfo, setWindowMode } = deps
  handle('app:info', undefined, () => getAppInfo())
  // 窗口状态：渲染层切模式时上报，落进 window-state.json（下次启动恢复）
  handle('app:setWindowMode', windowModeInputSchema, (req) => {
    setWindowMode(req.mode)
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
