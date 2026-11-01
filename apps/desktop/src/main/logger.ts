/**
 * 主进程日志实现。
 *
 * 提供：轮转文件日志（单文件上限 + 保留 N 个备份）、按级别回显控制台。
 * 与 早期版本对齐的刻意取舍：
 * - 不实现「环形缓冲供 LLM 注入」——TS 侧无消费者（见 shared/util/logger.ts 顶部说明）。
 * - 单例/全局态：用 `setLogSink` 把写入函数注入 shared/logger，渲染层与主进程共用同一入口。
 *
 * 纯函数（formatLogLine / needsRotate / rotateLogFile）与文件 IO 分离，便于单测。
 */

import { existsSync, mkdirSync, renameSync, statSync, appendFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import type { AppLogInput, LogLevel } from '@mobai/shared/types'
import { setLogSink } from '@mobai/shared/util/system'

const LOGGER_NAME = 'GameEditorApp'

const LEVEL_NAME: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR'
}

/** 级别权重，用于「仅回显 >= 阈值」判断 */
const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
}

export interface LoggerOptions {
  /** 单文件最大字节数；达到后轮转。默认 10MB */
  maxBytes?: number
  /** 保留的备份个数（app.log.1 最新）。默认 5 */
  backupCount?: number
  /** 控制台回显的最低级别；低于此级的只写文件。默认 warn */
  consoleLevel?: LogLevel
  /** 测试用：关闭控制台回显，避免噪声 */
  echoConsole?: boolean
}

export interface LoggerHandle {
  /** 当前日志目录 */
  logDir: string
  /** 当前主日志文件绝对路径 */
  logFile: string
}

function timestamp(d: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** 将一条日志格式化为单行文本 */
export function formatLogLine(entry: AppLogInput, time: Date = new Date()): string {
  const metaPart = entry.meta !== undefined ? ` | meta: ${serializeMeta(entry.meta)}` : ''
  return `${timestamp(time)} - ${LOGGER_NAME} - ${LEVEL_NAME[entry.level]} - ${entry.message}${metaPart}`
}

function serializeMeta(meta: unknown): string {
  if (meta instanceof Error) return `${meta.name}: ${meta.message}`
  if (typeof meta === 'string') return meta
  try {
    return JSON.stringify(meta)
  } catch {
    return String(meta)
  }
}

/** 是否需要轮转（文件存在且超过 maxBytes） */
export function needsRotate(logFile: string, maxBytes: number): boolean {
  if (!existsSync(logFile)) return false
  try {
    return statSync(logFile).size >= maxBytes
  } catch {
    return false
  }
}

/**
 * 轮转日志（RotatingFileHandler 语义：app.log → app.log.1 → … → app.log.backupCount）。
 * 返回最新备份是否创建成功（用于测试断言）。
 */
export function rotateLogFile(logFile: string, backupCount: number): void {
  // 删除最老的备份
  const oldest = `${logFile}.${backupCount}`
  if (existsSync(oldest)) {
    try {
      unlinkSync(oldest)
    } catch {
      /* ignore */
    }
  }
  // 其余备份依次后移：app.log.N → app.log.N+1（N 从 backupCount-1 递减到 1）
  for (let i = backupCount - 1; i >= 1; i--) {
    const src = `${logFile}.${i}`
    const dst = `${logFile}.${i + 1}`
    if (existsSync(src)) {
      try {
        renameSync(src, dst)
      } catch {
        /* ignore */
      }
    }
  }
  // 当前主日志 → app.log.1（最新备份）
  if (existsSync(logFile)) {
    try {
      renameSync(logFile, `${logFile}.1`)
    } catch {
      /* ignore */
    }
  }
}

let activeHandle: LoggerHandle | null = null
let activeOptions: Required<Omit<LoggerOptions, 'echoConsole'>> = {
  maxBytes: 10 * 1024 * 1024,
  backupCount: 5,
  consoleLevel: 'warn'
}
let echoConsole = true

/** 写出一条日志到文件（含轮转），并按级别回显控制台 */
function writeEntry(entry: AppLogInput): void {
  if (activeHandle === null) return
  const { logFile, logDir } = activeHandle

  if (!existsSync(logDir)) {
    try {
      mkdirSync(logDir, { recursive: true })
    } catch {
      /* ignore */
    }
  }

  if (needsRotate(logFile, activeOptions.maxBytes)) {
    rotateLogFile(logFile, activeOptions.backupCount)
  }

  const line = `${formatLogLine(entry)}\n`
  try {
    appendFileSync(logFile, line, 'utf-8')
  } catch {
    /* 写盘失败：静默（避免把日志系统自身变成崩溃源） */
  }

  if (echoConsole && LEVEL_WEIGHT[entry.level] >= LEVEL_WEIGHT[activeOptions.consoleLevel]) {
    const fn =
      entry.level === 'error'
        ? console.error
        : entry.level === 'warn'
          ? console.warn
          : entry.level === 'debug'
            ? console.debug
            : console.log
    fn(`[${LEVEL_NAME[entry.level]}] ${entry.message}`, entry.meta ?? '')
  }
}

/**
 * 初始化主进程日志（在 app.whenReady 内尽早调用）。
 * 幂等：重复调用仅更新目录与选项。
 */
export function initLogger(logDir: string, options: LoggerOptions = {}): LoggerHandle {
  activeHandle = { logDir, logFile: join(logDir, 'app.log') }
  activeOptions = {
    maxBytes: options.maxBytes ?? 10 * 1024 * 1024,
    backupCount: options.backupCount ?? 5,
    consoleLevel: options.consoleLevel ?? 'warn'
  }
  echoConsole = options.echoConsole !== false

  setLogSink(writeEntry)
  return activeHandle
}
