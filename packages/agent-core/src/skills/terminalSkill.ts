/**
 * `system.terminal` 内置技能：**持久 shell 会话**（优先真 PTY，缺失时回落管道模式）。
 *
 * 与 `system.shell`（一次性命令）的区别：会话跨多次调用存活，`cd` / 环境变量 / 后台进程
 * 都会保留。适合需要交互式输入或连续上下文的场景。
 *
 * 模型：`start` 起一个 shell → `send` 写 stdin → `read` 排空输出 → `resize`（仅 PTY）→ `stop`。
 *
 * ## 为什么 PTY 是"可选能力"而不是硬依赖
 * 真 PTY 要 native 模块（`node-pty`，需按 Electron ABI 重编）。把这种依赖写成硬
 * `dependencies` + postinstall 强编，会在没有 VS Build Tools 的机器上**把整仓 install 弄挂**。
 * 所以：
 * 1. 依赖放在 `optionalDependencies`（装失败不阻断 install）；
 * 2. 加载走 `createRequire` + try/catch（**不经 bundler 静态解析**，装没装都能启动）；
 * 3. 拿不到就回落管道模式，并在 `start` 的返回里**明说**当前是哪种模式——
 *    模型据此知道"交互式 TUI 跑不了"，而不是对着乱码猜。
 *
 * 装了 node-pty 但没按 Electron ABI 重编时，`require` 会抛 `NODE_MODULE_VERSION` 不匹配，
 * 同样被 catch 成"回落"，不会崩主进程。
 *
 * 风险：`SYSTEM`（每次调用需确认）。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** read 默认等待（毫秒） */
export const TERMINAL_DEFAULT_WAIT_MS = 300
/** read 等待上限（毫秒） */
export const TERMINAL_MAX_WAIT_MS = 5_000
/** 单次 read 回灌上限（字符） */
export const TERMINAL_MAX_CHARS = 200_000
/** PTY 默认列数 / 行数 */
export const TERMINAL_DEFAULT_COLS = 120
export const TERMINAL_DEFAULT_ROWS = 30

export interface TerminalShellSpec {
  command: string
  args: string[]
}

/** PTY 句柄（只声明用到的五个方法，便于测试注入假实现） */
export interface PtyHandle {
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(handler: (chunk: string) => void): void
  onExit(handler: () => void): void
}

export interface PtyLoader {
  spawn(options: { command: string; args: string[]; cwd: string; cols: number; rows: number }): PtyHandle
}

export interface TerminalSkillOptions {
  /** 工作区根目录（会话 cwd） */
  root: () => string
  /** 覆盖 shell 命令（测试用）；缺省按平台选 cmd.exe / $SHELL */
  shell?: TerminalShellSpec
  /**
   * `auto`（缺省）= 有 node-pty 就用、没有就回落；`pipe` = 强制管道（测试用）；
   * `pty` = 强制 PTY，不可用时报错（用来验证"确实能起 PTY"）。
   */
  mode?: 'auto' | 'pipe' | 'pty'
  /** 注入 PTY 加载器（测试用）；缺省 `loadNodePty` */
  pty?: () => PtyLoader | null
}

function defaultShell(): TerminalShellSpec {
  if (process.platform === 'win32') return { command: 'cmd.exe', args: [] }
  return { command: process.env.SHELL ?? '/bin/bash', args: [] }
}

function clampWait(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return TERMINAL_DEFAULT_WAIT_MS
  return Math.min(Math.trunc(value), TERMINAL_MAX_WAIT_MS)
}

/** 取正整数参数（带范围钳制） */
function intInRange(raw: unknown, fallback: number, min: number, max: number): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 终止 shell（Windows 连同子进程） */
function killShell(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) {
    child.kill()
    return
  }
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
      return
    } catch {
      child.kill()
      return
    }
  }
  child.kill('SIGTERM')
}

/**
 * 默认 PTY 加载器：`createRequire` + try/catch。
 *
 * 模块名走变量而不是字面量：Vite/Rollup 看到 `require('node-pty')` 的字面量会尝试
 * 静态解析并在缺失时报构建错误；变量形式让它变成纯运行时查找。
 */
export function loadNodePty(): PtyLoader | null {
  const moduleName = 'node-pty'
  try {
    const require = createRequire(import.meta.url)
    const mod = require(moduleName) as {
      spawn?: (
        file: string,
        args: string[],
        options: Record<string, unknown>
      ) => {
        write: (data: string) => void
        resize: (cols: number, rows: number) => void
        kill: () => void
        onData: (handler: (chunk: string) => void) => void
        onExit: (handler: () => void) => void
      }
    }
    if (typeof mod.spawn !== 'function') return null
    return {
      spawn: ({ command, args, cwd, cols, rows }) => {
        const proc = mod.spawn?.(command, args, {
          name: 'xterm-256color',
          cwd,
          cols,
          rows,
          env: process.env
        })
        if (proc === undefined) throw new Error('node-pty spawn 返回空')
        return {
          write: (data) => proc.write(data),
          resize: (nextCols, nextRows) => proc.resize(nextCols, nextRows),
          kill: () => {
            try {
              proc.kill()
            } catch {
              // 已退出：忽略
            }
          },
          onData: (handler) => proc.onData(handler),
          onExit: (handler) => proc.onExit(() => handler())
        }
      }
    }
  } catch {
    // 没装 / ABI 不匹配 / 平台不支持：一律回落管道模式，绝不抛给主进程
    return null
  }
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `terminal 失败：${message}`, error }
}

export function createTerminalSkill(options: TerminalSkillOptions): SkillProtocol {
  const ptyProvider = options.pty ?? loadNodePty
  const mode = options.mode ?? 'auto'

  let pty: PtyHandle | null = null
  let child: ChildProcess | null = null
  let outBuffer = ''
  let errBuffer = ''
  let exited = true
  /** 当前会话是不是 PTY（status/read 要如实回报，模型据此判断能不能跑 TUI） */
  let usingPty = false

  function drain(): string {
    const out = outBuffer
    const err = errBuffer
    outBuffer = ''
    errBuffer = ''
    const parts: string[] = []
    if (out !== '') parts.push(out)
    if (err !== '') parts.push(`[stderr]\n${err}`)
    const text = parts.join('\n').trimEnd()
    return text.length > TERMINAL_MAX_CHARS ? text.slice(0, TERMINAL_MAX_CHARS) + '\n…（截断）' : text
  }

  function alive(): boolean {
    return pty !== null || (child !== null && !exited)
  }

  function reset(): void {
    pty = null
    child = null
    exited = true
    usingPty = false
    outBuffer = ''
    errBuffer = ''
  }

  /** 尝试用 PTY 起会话；不可用（没装 / 起失败）返回 null 交给管道模式 */
  function startPty(spec: TerminalShellSpec): SkillResult | null {
    if (mode === 'pipe') return null
    const loader = ptyProvider()
    if (loader === null) return null
    const cols = TERMINAL_DEFAULT_COLS
    const rows = TERMINAL_DEFAULT_ROWS
    try {
      const handle = loader.spawn({ command: spec.command, args: spec.args, cwd: options.root(), cols, rows })
      handle.onData((chunk) => {
        outBuffer += chunk
      })
      handle.onExit(() => {
        exited = true
      })
      pty = handle
      child = null
      exited = false
      usingPty = true
      return {
        success: true,
        message: `会话已启动（${spec.command}，PTY ${cols}×${rows}）`,
        data: { command: spec.command, pty: true, cols, rows }
      }
    } catch (error) {
      // 起 PTY 失败不该让整个动作失败：下面还会试管道模式
      pty = null
      errBuffer = error instanceof Error ? error.message : String(error)
      return null
    }
  }

  function startPipe(spec: TerminalShellSpec): SkillResult {
    try {
      const spawned = spawn(spec.command, spec.args, { cwd: options.root(), windowsHide: true })
      child = spawned
      pty = null
      exited = false
      usingPty = false
      spawned.stdout?.on('data', (chunk: Buffer) => {
        outBuffer += chunk.toString('utf8')
      })
      spawned.stderr?.on('data', (chunk: Buffer) => {
        errBuffer += chunk.toString('utf8')
      })
      spawned.on('exit', () => {
        exited = true
      })
      return {
        success: true,
        message: `会话已启动（${spec.command}，管道模式：未装 node-pty，无回显/交互式 TUI）`,
        data: { command: spec.command, pty: false }
      }
    } catch (error) {
      reset()
      return fail(error instanceof Error ? error.message : String(error), SKILL_ERRORS.SPAWN)
    }
  }

  function start(): SkillResult {
    if (alive()) return { success: true, message: '会话已在运行', data: { pty: usingPty } }
    const spec = options.shell ?? defaultShell()
    const viaPty = startPty(spec)
    if (viaPty !== null) return viaPty
    if (mode === 'pty') {
      return fail(
        'node-pty 不可用（未安装或与 Electron ABI 不匹配）。装法：npm i -w apps/desktop node-pty && npx electron-rebuild -f -w node-pty',
        SKILL_ERRORS.UNSUPPORTED
      )
    }
    return startPipe(spec)
  }

  function send(input: string): SkillResult {
    if (!alive()) return fail('会话未启动或已退出，请先 start', SKILL_ERRORS.NO_SESSION)
    if (input.trim() === '') return fail('input 不能为空', SKILL_ERRORS.BAD_ARG)
    const payload = input.endsWith('\n') ? input : `${input}\n`
    if (pty !== null) {
      pty.write(payload)
      return { success: true, message: '已发送' }
    }
    child?.stdin?.write(payload)
    return { success: true, message: '已发送' }
  }

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action === 'start') return start()
    if (action === 'send') return send(typeof params.input === 'string' ? params.input : '')
    if (action === 'resize') {
      if (pty === null) return fail('resize 仅 PTY 会话支持（当前是管道模式）', SKILL_ERRORS.UNSUPPORTED)
      const cols = intInRange(params.cols, TERMINAL_DEFAULT_COLS, 20, 400)
      const rows = intInRange(params.rows, TERMINAL_DEFAULT_ROWS, 5, 200)
      pty.resize(cols, rows)
      return { success: true, message: `已调整到 ${cols}×${rows}`, data: { cols, rows } }
    }
    if (action === 'stop') {
      if (pty !== null) pty.kill()
      if (child !== null) killShell(child)
      if (pty === null && child === null) return { success: true, message: '无运行中的会话' }
      reset()
      return { success: true, message: '会话已终止' }
    }
    if (action === 'read') {
      if (pty === null && child === null) return fail('会话未启动，请先 start', SKILL_ERRORS.NO_SESSION)
      await delay(clampWait(params.wait_ms))
      const text = drain()
      return {
        success: true,
        message: text === '' ? '（暂无新输出）' : text,
        data: { running: alive(), pty: usingPty }
      }
    }
    if (action === 'status') {
      const running = alive()
      const idle = pty === null && child === null
      return {
        success: true,
        message: !running ? (idle ? '未启动' : '已退出') : usingPty ? '运行中（PTY）' : '运行中（管道）',
        data: { running, pty: usingPty }
      }
    }
    return fail(`未知 action: ${action}（支持 start/send/read/resize/stop/status）`, SKILL_ERRORS.BAD_ACTION)
  }

  return {
    id: 'system.terminal',
    description:
      '持久 shell 会话（cwd/env 跨调用保留）：start 启动 / send 写命令 / read 取新输出 / '
      + 'resize 调终端尺寸（仅 PTY）/ stop 终止 / status 状态。'
      + '装了 node-pty 时是真 PTY（支持交互式 TUI）；否则回落管道模式，此时 TUI 跑不了、也没有回显。'
      + '一次性命令请用 system.shell。',
    version: '0.2.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['start', 'send', 'read', 'resize', 'stop', 'status'],
          description: '操作类型'
        },
        input: { type: 'string', description: 'send 时写入 stdin 的内容（自动补换行）' },
        wait_ms: { type: 'integer', description: `read 等待毫秒（默认 ${TERMINAL_DEFAULT_WAIT_MS}）` },
        cols: { type: 'integer', description: 'resize 的列数（20–400）' },
        rows: { type: 'integer', description: 'resize 的行数（5–200）' }
      },
      required: ['action']
    },
    tags: ['system', 'terminal'],
    execute: run
  }
}
