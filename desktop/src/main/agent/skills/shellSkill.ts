/**
 * `system.shell` 内置技能（对齐 dsh `shell` 的可用子集）。
 *
 * 让智能体在**工作区根目录**里跑命令（构建/测试/脚本），这是「能做编程开发」的另一半地基。
 *
 * 安全取向（诚实说明）：
 * - 风险等级 `SYSTEM`（见 `TOOL_RISK_MAP['system.shell']`）⇒ **每次调用都需用户确认**，
 *   这是本版本的主安全闸。
 * - `cwd` 固定为工作区根，命令从该目录启动；`read-only` 沙箱**直接拒绝**（对齐 dsh CLI 沙箱）。
 * - **未做 OS 级围栏**：命令理论上可 `cd ..` 越界。dsh 用 bwrap/landlock/seatbelt/windows-acl 做
 *   内核级隔离；我们暂以「审批门 + 工作区 cwd」为主，OS 级硬化列为后续（复用既有 windowsSandbox 基建）。
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { resolveInsideRoot } from './fsContainment'
import type { FileOpsPolicy } from './fileOpsSkill'

const execAsync = promisify(exec)

/** 默认超时（毫秒） */
export const SHELL_DEFAULT_TIMEOUT_MS = 30_000
/** 超时上限（毫秒） */
export const SHELL_MAX_TIMEOUT_MS = 120_000
/** stdout/stderr 缓冲上限（字节） */
export const SHELL_MAX_BUFFER = 4 * 1024 * 1024
/** 回灌给模型的输出上限（字符） */
export const SHELL_OUTPUT_MAX_CHARS = 200_000

export interface ShellSkillOptions {
  /** 工作区根目录（绝对路径） */
  root: string
  /** 沙箱策略（缺省 workspace-write） */
  policy?: FileOpsPolicy
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

function formatResult(stdout: string, stderr: string, exitCode: number): SkillResult {
  const parts: string[] = [`退出码：${exitCode}`]
  if (stdout.trim() !== '') parts.push(`stdout:\n${capOutput(stdout)}`)
  if (stderr.trim() !== '') parts.push(`stderr:\n${capOutput(stderr)}`)
  return {
    success: true,
    message: parts.join('\n\n'),
    data: { exitCode }
  }
}

export function createShellSkill(options: ShellSkillOptions): SkillProtocol {
  const root = options.root
  const policy: FileOpsPolicy = options.policy ?? 'workspace-write'

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'run') {
      return { success: false, message: `未知 action: ${action}`, error: 'EBADACTION' }
    }
    if (policy === 'read-only') {
      return { success: false, message: '沙箱为 read-only，拒绝执行命令', error: 'FS_SANDBOX_DENIED' }
    }
    const command = typeof params.command === 'string' ? params.command : ''
    if (command.trim() === '') {
      return { success: false, message: '缺少 command 参数', error: 'EBADARG' }
    }
    const timeout = clampTimeout(params.timeout_ms)
    // 可选子目录：仍须位于工作区内
    const cwd =
      typeof params.cwd === 'string' && params.cwd.trim() !== ''
        ? await resolveInsideRoot(root, params.cwd)
        : root

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: SHELL_MAX_BUFFER,
        windowsHide: true
      })
      return formatResult(stdout, stderr, 0)
    } catch (error) {
      const e = error as {
        code?: number | string
        stdout?: string
        stderr?: string
        killed?: boolean
        message?: string
      }
      if (e.killed === true) {
        return { success: false, message: `命令超时（${timeout}ms）已被终止`, error: 'ETIMEDOUT' }
      }
      // 进程跑起来了但非零退出：视为「工具成功、命令失败」，把退出码与输出交回模型判断
      if (typeof e.code === 'number') {
        return formatResult(e.stdout ?? '', e.stderr ?? '', e.code)
      }
      return {
        success: false,
        message: `命令执行失败：${e.message ?? String(error)}`,
        error: 'ESPAWN'
      }
    }
  }

  return {
    id: 'system.shell',
    description:
      '在工作区根目录执行 shell 命令（构建/测试/脚本）。每次调用需用户确认；'
      + '返回退出码与 stdout/stderr。可选 cwd 指定工作区内子目录。',
    version: '0.1.0',
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
