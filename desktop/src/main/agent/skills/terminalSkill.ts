/**
 * `system.terminal` 内置技能（对齐 dsh `terminal` 的可用子集）：**持久 shell 会话**。
 *
 * 与 `system.shell`（一次性命令）的区别：会话跨多次调用存活，`cd` / 环境变量 / 后台进程
 * 都会保留。适合需要交互式输入或连续上下文的场景。
 *
 * 模型：`start` 起一个 shell → `send` 写 stdin → `read` 排空 stdout/stderr → `stop` 终止。
 * **不是真 PTY**（dsh 用 node-pty）：没有终端回显/光标/交互式 TUI，输出是管道流。
 *
 * 风险：`SYSTEM`（每次调用需确认）。
 */

import { spawn, type ChildProcess } from 'node:child_process'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'

/** read 默认等待（毫秒） */
export const TERMINAL_DEFAULT_WAIT_MS = 300
/** read 等待上限（毫秒） */
export const TERMINAL_MAX_WAIT_MS = 5_000
/** 单次 read 回灌上限（字符） */
export const TERMINAL_MAX_CHARS = 200_000

export interface TerminalShellSpec {
  command: string
  args: string[]
}

export interface TerminalSkillOptions {
  /** 工作区根目录（会话 cwd） */
  root: () => string
  /** 覆盖 shell 命令（测试用）；缺省按平台选 cmd.exe / $SHELL */
  shell?: TerminalShellSpec
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

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `terminal 失败：${message}`, error }
}

export function createTerminalSkill(options: TerminalSkillOptions): SkillProtocol {
  let child: ChildProcess | null = null
  let outBuffer = ''
  let errBuffer = ''
  let exited = true

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

  async function start(): Promise<SkillResult> {
    if (child !== null && !exited) return { success: true, message: '会话已在运行' }
    const spec = options.shell ?? defaultShell()
    try {
      const spawned = spawn(spec.command, spec.args, { cwd: options.root(), windowsHide: true })
      child = spawned
      exited = false
      spawned.stdout?.on('data', (chunk: Buffer) => {
        outBuffer += chunk.toString('utf8')
      })
      spawned.stderr?.on('data', (chunk: Buffer) => {
        errBuffer += chunk.toString('utf8')
      })
      spawned.on('exit', () => {
        exited = true
      })
      return { success: true, message: `会话已启动（${spec.command}）`, data: { command: spec.command } }
    } catch (error) {
      child = null
      exited = true
      return fail(error instanceof Error ? error.message : String(error), 'ESPAWN')
    }
  }

  function send(input: string): SkillResult {
    if (child === null || exited) return fail('会话未启动或已退出，请先 start', 'ENOSESSION')
    if (input.trim() === '') return fail('input 不能为空', 'EBADARG')
    child.stdin?.write(input.endsWith('\n') ? input : `${input}\n`)
    return { success: true, message: '已发送' }
  }

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action === 'start') return start()
    if (action === 'send') return send(typeof params.input === 'string' ? params.input : '')
    if (action === 'stop') {
      if (child === null) return { success: true, message: '无运行中的会话' }
      killShell(child)
      child = null
      exited = true
      outBuffer = ''
      errBuffer = ''
      return { success: true, message: '会话已终止' }
    }
    if (action === 'read') {
      if (child === null) return fail('会话未启动，请先 start', 'ENOSESSION')
      await delay(clampWait(params.wait_ms))
      const text = drain()
      return { success: true, message: text === '' ? '（暂无新输出）' : text, data: { running: !exited } }
    }
    if (action === 'status') {
      return {
        success: true,
        message: child === null ? '未启动' : exited ? '已退出' : '运行中',
        data: { running: child !== null && !exited }
      }
    }
    return fail(`未知 action: ${action}（支持 start/send/read/stop/status）`, 'EBADACTION')
  }

  return {
    id: 'system.terminal',
    description:
      '持久 shell 会话（cwd/env 跨调用保留）：start 启动 / send 写命令 / read 取新输出 / '
      + 'stop 终止 / status 状态。非真 PTY，无交互式 TUI；一次性命令请用 system.shell。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['start', 'send', 'read', 'stop', 'status'], description: '操作类型' },
        input: { type: 'string', description: 'send 时写入 stdin 的内容（自动补换行）' },
        wait_ms: { type: 'integer', description: `read 等待毫秒（默认 ${TERMINAL_DEFAULT_WAIT_MS}）` }
      },
      required: ['action']
    },
    tags: ['system', 'terminal'],
    execute: run
  }
}
