/**
 * `system.shell` 内置技能（对齐 dsh `shell` 的可用子集）。
 *
 * 让智能体在**工作区根目录**里跑命令（构建/测试/脚本），这是「能做编程开发」的另一半地基。
 *
 * 安全取向（诚实说明）：
 * - 风险等级 `SYSTEM`（见 `TOOL_RISK_MAP['system.shell']`）⇒ **每次调用都需用户确认**，
 *   这是主安全闸。
 * - `cwd` 固定为工作区根；`read-only` 沙箱**直接拒绝**（对齐 dsh CLI 沙箱）。
 * - **进程树终止**：超时/结束时用 `taskkill /T`（Windows）或进程组 kill（POSIX）终止整棵树，
 *   避免孤儿进程逃逸与占用工作区（此前只杀 shell，孙进程会残留）。
 * - **库保护（Windows icacls）**：跑命令期间对游戏库的 `data`/`ceshu`/`design` 目录加「拒绝写入」
 *   ACE，越界命令也无法破坏游戏库；结束恢复。这是「保护库」而非「完全限制写」。
 * - **未做完整写围栏**：任意命令仍可写到工作区之外的用户目录（dsh 用 bwrap/landlock/seatbelt/
 *   windows-acl 做内核级隔离）。我们暂以「审批门 + 工作区 cwd + 库保护」为主，完整隔离列为后续。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'
import { withReadOnlyDirs } from '../ops/windowsSandbox'
import { resolveInsideRoot } from './fsContainment'
import type { FileOpsPolicy } from './fileOpsSkill'

/** 默认超时（毫秒） */
export const SHELL_DEFAULT_TIMEOUT_MS = 30_000
/** 超时上限（毫秒） */
export const SHELL_MAX_TIMEOUT_MS = 120_000
/** stdout/stderr 缓冲上限（字节） */
export const SHELL_MAX_BUFFER = 4 * 1024 * 1024
/** 回灌给模型的输出上限（字符） */
export const SHELL_OUTPUT_MAX_CHARS = 200_000
/** 跑命令期间保护的游戏库子目录（相对库根） */
export const SHELL_PROTECTED_LIB_DIRS = ['data', 'ceshu', 'design'] as const

export interface ShellSkillOptions {
  /** 工作区根目录（动态读取，支持运行时切换） */
  root: () => string
  /** 沙箱策略（缺省 workspace-write） */
  policy?: FileOpsPolicy
  /** 游戏库根目录（可选；提供则在跑命令期间保护 data/ceshu/design） */
  libraryDir?: () => string
}

interface ShellOutcome {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
  error?: string
}

function clampTimeout(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return SHELL_DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(value), SHELL_MAX_TIMEOUT_MS)
}

function capOutput(text: string): string {
  if (text.length <= SHELL_OUTPUT_MAX_CHARS) return text
  return `${text.slice(0, SHELL_OUTPUT_MAX_CHARS)}\n…（输出截断，共 ${text.length} 字符）`
}

/** 终止整个进程树（不只是 shell 本身） */
function killTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid === undefined) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
    } catch {
      child.kill('SIGKILL')
    }
    return
  }
  // POSIX：detached 让子进程成为新进程组组长，-pid 即整组
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // 已退出
    }
  }
}

/** 执行命令并收集输出（带超时 + 进程树终止） */
function runCommand(command: string, cwd: string, timeoutMs: number): Promise<ShellOutcome> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    let child: ChildProcess
    try {
      child = spawn(command, [], {
        cwd,
        shell: true,
        windowsHide: true,
        // POSIX 用进程组便于整组 kill；Windows 由 taskkill /T 处理
        detached: !isWin
      })
    } catch (error) {
      resolve({ stdout: '', stderr: '', exitCode: -1, timedOut: false, error: String(error) })
      return
    }

    let stdout = ''
    let stderr = ''
    let bytes = 0
    let timedOut = false
    let settled = false

    const finish = (outcome: ShellOutcome): void => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    const append = (chunk: Buffer, toErr: boolean): void => {
      if (bytes >= SHELL_MAX_BUFFER) return
      const text = chunk.toString('utf8')
      bytes += Buffer.byteLength(text)
      if (toErr) stderr += text
      else stdout += text
    }

    child.stdout?.on('data', (chunk: Buffer) => append(chunk, false))
    child.stderr?.on('data', (chunk: Buffer) => append(chunk, true))

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            killTree(child)
          }, timeoutMs)
        : undefined

    child.on('error', (error: Error) => {
      if (timer !== undefined) clearTimeout(timer)
      finish({ stdout, stderr, exitCode: -1, timedOut, error: error.message })
    })
    child.on('close', (code: number | null) => {
      if (timer !== undefined) clearTimeout(timer)
      finish({ stdout, stderr, exitCode: code ?? -1, timedOut })
    })
  })
}

function formatResult(outcome: ShellOutcome): SkillResult {
  if (outcome.timedOut) {
    return { success: false, message: '命令超时已被终止（含子进程）', error: SKILL_ERRORS.TIMEOUT }
  }
  if (outcome.error !== undefined) {
    return { success: false, message: `命令执行失败：${outcome.error}`, error: SKILL_ERRORS.SPAWN }
  }
  const parts: string[] = [`退出码：${outcome.exitCode}`]
  if (outcome.stdout.trim() !== '') parts.push(`stdout:\n${capOutput(outcome.stdout)}`)
  if (outcome.stderr.trim() !== '') parts.push(`stderr:\n${capOutput(outcome.stderr)}`)
  return { success: true, message: parts.join('\n\n'), data: { exitCode: outcome.exitCode } }
}

export function createShellSkill(options: ShellSkillOptions): SkillProtocol {
  const rootFn = options.root
  const policy: FileOpsPolicy = options.policy ?? 'workspace-write'

  /** 跑命令期间要保护的库目录（仅 Windows 生效；不存在则跳过） */
  function protectedDirs(): string[] {
    if (policy !== 'workspace-write' || options.libraryDir === undefined) return []
    const libDir = options.libraryDir()
    if (libDir === '') return []
    return SHELL_PROTECTED_LIB_DIRS.map((name) => join(libDir, name)).filter((path) => existsSync(path))
  }

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'run') {
      return { success: false, message: `未知 action: ${action}`, error: SKILL_ERRORS.BAD_ACTION }
    }
    if (policy === 'read-only') {
      return { success: false, message: '沙箱为 read-only，拒绝执行命令', error: SKILL_ERRORS.SANDBOX_DENIED }
    }
    const command = typeof params.command === 'string' ? params.command : ''
    if (command.trim() === '') {
      return { success: false, message: '缺少 command 参数', error: SKILL_ERRORS.BAD_ARG }
    }
    const timeout = clampTimeout(params.timeout_ms)
    const cwd =
      typeof params.cwd === 'string' && params.cwd.trim() !== ''
        ? await resolveInsideRoot(rootFn(), params.cwd)
        : rootFn()

    try {
      const dirs = protectedDirs()
      const outcome = await withReadOnlyDirs(dirs, () => runCommand(command, cwd, timeout))
      return formatResult(outcome)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, message: `命令执行失败：${message}`, error: SKILL_ERRORS.SPAWN }
    }
  }

  return {
    id: 'system.shell',
    description:
      '在工作区根目录执行 shell 命令（构建/测试/脚本）。每次调用需用户确认；'
      + '返回退出码与 stdout/stderr。超时会终止整个进程树；可选 cwd 指定工作区内子目录。',
    version: '0.2.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run'], description: '操作类型: run=执行命令' },
        command: { type: 'string', description: '要执行的命令（平台 shell）' },
        cwd: { type: 'string', description: '工作区内子目录（可选）' },
        timeout_ms: { type: 'integer', description: `超时毫秒（默认 ${SHELL_DEFAULT_TIMEOUT_MS}）` }
      },
      required: ['action', 'command']
    },
    tags: ['system', 'shell'],
    execute: run
  }
}
