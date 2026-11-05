/**
 * 超长工具输出落盘（对齐 dsh `spill-local` + `spill-policy/retention` 的简化版）。
 *
 * 与 dsh 的差别（有意）：dsh 按 token 预算做头尾保留、启动清扫时校验目录所有权；
 * 墨白是单用户桌面应用、spill 只在工作区 `.mb-spill/` 内，故用**字符预算**并
 * 只认自己生成的精确文件名形状。三条硬约束：
 *
 * 1. **单文件有上限**：一次 100MB 的工具输出不能把磁盘写满；截断必须在给模型的
 *    提示里明说，不能假称「完整内容已落盘」。
 * 2. **头尾都给**：只有头会让模型看不到结论/错误堆栈；只有头是既有实现的缺陷。
 * 3. **数量 + 时间双清理**：每次写入顺带清扫，启动时再扫一次。清扫**只删匹配
 *    命名形状的普通文件**，绝不递归、绝不碰同目录下的其他文件。
 *
 * 所有 IO 异常都吞掉并告警：spill 是可观测性设施，不能反过来打断一次答复。
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 只认本模块写出的文件：`<毫秒时间戳>-<安全工具名>-<6位随机>.txt` */
const SPILL_FILE_RE = /^\d+-[A-Za-z0-9_.-]+-[a-z0-9]{6}\.txt$/
/** 上一代文件名（无随机后缀）：也要纳入清扫，否则历史堆积永远清不掉 */
const LEGACY_FILE_RE = /^\d+-[A-Za-z0-9_.-]+\.txt$/

/** 默认保留策略 */
export const SPILL_DEFAULTS = {
  maxFiles: 40,
  retentionMs: 7 * 24 * 60 * 60 * 1000,
  /** 单文件上限（字符）；按 utf8 估算约 800KB */
  maxFileChars: 400_000,
  headChars: 800,
  tailChars: 300
} as const

export interface SpillWriterOptions {
  /**
   * spill 根目录（通常是工作区 `.mb-spill/`）。
   * 支持函数是因为工作区可运行时切换（`setWorkspaceRoot`），切库后必须写进新库，
   * 不能沿用启动时定死的路径。
   */
  dir: string | (() => string)
  maxFiles?: number
  retentionMs?: number
  maxFileChars?: number
  headChars?: number
  tailChars?: number
  /** 可注入时钟，便于测试时间清理而不真的改文件 mtime 等 7 天 */
  now?: () => number
  warn?: (message: string) => void
}

export interface PruneReport {
  removed: number
  kept: number
}

export interface SpillWriter {
  /** 落盘并返回给模型的「头 + 省略说明 + 尾 + 文件引用」 */
  write(tool: string, text: string): string
  /** 按数量 + 时间清扫；可被启动时单独调用 */
  prune(): PruneReport
}

/**
 * 把切点挪出 UTF-16 代理对中间，避免头/尾切出半个 emoji。
 * dsh `spill-policy/retention.ts` 的 `textSlice` 同源思路。
 */
function safeCut(text: string, index: number, fromEnd: boolean): number {
  if (index <= 0 || index >= text.length) return index
  const previous = text.charCodeAt(index - 1)
  const current = text.charCodeAt(index)
  const splitsSurrogate = previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff
  return splitsSurrogate ? (fromEnd ? index + 1 : index - 1) : index
}

function isSpillFile(name: string): boolean {
  return SPILL_FILE_RE.test(name) || LEGACY_FILE_RE.test(name)
}

export function createSpillWriter(options: SpillWriterOptions): SpillWriter {
  const {
    dir,
    maxFiles = SPILL_DEFAULTS.maxFiles,
    retentionMs = SPILL_DEFAULTS.retentionMs,
    maxFileChars = SPILL_DEFAULTS.maxFileChars,
    headChars = SPILL_DEFAULTS.headChars,
    tailChars = SPILL_DEFAULTS.tailChars,
    now = Date.now,
    warn = (message: string) => console.warn(message)
  } = options
  const dirOf = (): string => (typeof dir === 'function' ? dir() : dir)

  const safeWarn = (message: string, error?: unknown): void => {
    try {
      warn(`${message}${error === undefined ? '' : `：${error instanceof Error ? error.message : String(error)}`}`)
    } catch {
      // 告警通道自己坏了也不能影响主流程
    }
  }

  const prune = (): PruneReport => {
    const root = dirOf()
    // 清扫不建目录：启动时空工作区不该凭空多出 `.mb-spill/`（写入时才创建）
    if (!existsSync(root)) return { removed: 0, kept: 0 }
    let entries: string[]
    try {
      entries = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && isSpillFile(entry.name))
        .map((entry) => entry.name)
    } catch (error) {
      safeWarn('[spill] 无法读取 spill 目录，跳过本次清扫', error)
      return { removed: 0, kept: 0 }
    }

    const stamped = entries.flatMap((name) => {
      try {
        const stats = statSync(join(root, name))
        return [{ name, mtimeMs: stats.mtimeMs }]
      } catch {
        // 并发删除 / 权限问题：跳过这一条，不影响其余
        return []
      }
    })
    stamped.sort((a, b) => b.mtimeMs - a.mtimeMs)

    const current = now()
    let removed = 0
    let kept = 0
    stamped.forEach((entry, index) => {
      const expired = current - entry.mtimeMs > retentionMs
      const overflow = index >= maxFiles
      if (!expired && !overflow) {
        kept += 1
        return
      }
      try {
        unlinkSync(join(root, entry.name))
        removed += 1
      } catch (error) {
        // 文件被占用 / 已删：保留它，下次再试
        kept += 1
        safeWarn(`[spill] 无法清理 ${entry.name}`, error)
      }
    })
    return { removed, kept }
  }

  const write = (tool: string, text: string): string => {
    const safe = tool.replace(/[^\w.-]/g, '_')
    const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, '0')
    const fileName = `${now()}-${safe}-${suffix}.txt`
    const relative = `.mb-spill/${fileName}`

    let diskText = text
    let diskNote = ''
    if (text.length > maxFileChars) {
      diskText = text.slice(0, maxFileChars)
      diskNote = `；落盘内容已截断到前 ${maxFileChars} 字符（原文 ${text.length} 字符）`
    }
    try {
      const root = dirOf()
      mkdirSync(root, { recursive: true })
      writeFileSync(join(root, fileName), diskText, 'utf8')
    } catch (error) {
      // 落盘失败不能让工具结果消失：退化为纯头尾截断，并如实说明
      safeWarn('[spill] 落盘失败，退化为内存截断', error)
      const headEnd = safeCut(text, headChars, false)
      const tailStart = safeCut(text, text.length - tailChars, true)
      return [
        text.slice(0, headEnd),
        `\n…[中间省略 ${Math.max(0, tailStart - headEnd)} 字符；落盘失败，完整内容未保留]…\n`,
        text.slice(tailStart)
      ].join('')
    }
    prune()

    const headEnd = safeCut(text, headChars, false)
    const tailStart = safeCut(text, Math.max(headEnd, text.length - tailChars), true)
    const omitted = Math.max(0, tailStart - headEnd)
    const head = text.slice(0, headEnd)
    const tail = text.slice(tailStart)
    return [
      head,
      `\n…[中间省略 ${omitted} 字符]…\n`,
      tail,
      `\n\n[输出过长（${text.length} 字符），内容已落盘：${relative}（相对工作区）。`
      + `可用 system.file_ops read 读取${diskNote}；目录保留最近 ${maxFiles} 个 / `
      + `${Math.round(retentionMs / 86_400_000)} 天]`
    ].join('')
  }

  return { write, prune }
}
