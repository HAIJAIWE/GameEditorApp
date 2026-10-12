/**
 * 统一日志入口（对应 Python `common/logger.py` 的对外 API）。
 *
 * 设计要点（与 Python 版对齐，但按 Electron 双进程重新落地）：
 * - 主进程（Node）：日志经 `setLogSink` 注册的 sink 写入文件 + 回显控制台。
 * - 渲染层（浏览器）：经 `window.mbApi.app.log` 转发到主进程，**绝不**在渲染层直接写文件。
 * - 早期启动（sink 尚未注册）或转发失败时降级到 `console`，保证不丢日志、不抛错。
 *
 * 范围说明（刻意不做）：Python 版的「环形缓冲供 LLM 注入上下文」在 TS 侧**当前无消费者**
 * （agent/brain 的上下文来自 memory，不来自日志），按「无消费者不预建」的原则暂不实现；
 * 待 LLM 上下文注入需求出现时，再在 main 侧补环形缓冲 + `app:recentLogs` 读取通道。
 */

import type { AppLogInput } from '../types'

export type { AppLogInput }

/** 经注册的 sink 写出一条日志（主进程侧由 `main/logger.ts` 注入文件写入实现） */
type LogSink = (entry: AppLogInput) => void

let sink: LogSink | null = null

/** 主进程初始化时由 `initLogger` 调用，注入文件写入实现 */
export function setLogSink(next: LogSink | null): void {
  sink = next
}

function isRendererWithBridge(): boolean {
  const w = (globalThis as { window?: { mbApi?: { app?: { log?: unknown } } } }).window
  return w != null && w.mbApi?.app?.log != null
}

function consoleFallback(level: AppLogInput['level'], message: string, meta?: unknown): void {
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : level === 'debug'
          ? console.debug
          : console.log
  fn(`[${level}] ${message}`, meta ?? '')
}

function emit(level: AppLogInput['level'], message: string, meta?: unknown): void {
  const entry: AppLogInput = { level, message, meta }

  if (isRendererWithBridge()) {
    const bridge = (globalThis as unknown as { window: { mbApi: { app: { log: (e: AppLogInput) => unknown } } } }).window.mbApi
    try {
      // 转发到主进程写文件；fire-and-forget，不阻塞渲染层
      void bridge.app.log(entry)
      return
    } catch {
      // 桥接异常（理论上不应发生）→ 降级 console，不影响业务
      consoleFallback(level, message, meta)
      return
    }
  }

  if (sink !== null) {
    sink(entry)
    return
  }

  // 主进程早期启动、sink 尚未注入：降级 console
  consoleFallback(level, message, meta)
}

export const log = {
  debug: (message: string, meta?: unknown): void => emit('debug', message, meta),
  info: (message: string, meta?: unknown): void => emit('info', message, meta),
  warn: (message: string, meta?: unknown): void => emit('warn', message, meta),
  error: (message: string, meta?: unknown): void => emit('error', message, meta)
}
