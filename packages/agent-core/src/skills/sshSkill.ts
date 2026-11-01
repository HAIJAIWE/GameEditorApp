/**
 * `system.ssh` 内置技能（对齐 dsh `ssh` 的可用子集）：在远端主机执行一条命令。
 *
 * 薄包装 `ssh` 命令（非交互：`BatchMode=yes`），返回退出码与输出。
 * 认证依赖用户已配置的 SSH key / agent；本技能不管理密钥。
 *
 * 安全：风险 `SYSTEM`（每次审批）；远端执行无法用本地围栏约束，审批是唯一闸。
 */

import { spawn } from 'node:child_process'

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** 默认超时（毫秒） */
export const SSH_DEFAULT_TIMEOUT_MS = 30_000
/** 超时上限（毫秒） */
export const SSH_MAX_TIMEOUT_MS = 120_000
/** 输出上限（字符） */
export const SSH_MAX_CHARS = 200_000

export interface SshOptions {
  target: string
  command: string
  port?: number
  identityFile?: string
  connectTimeout?: number
}

/** 构造 ssh 参数（纯函数，便于单测） */
export function buildSshArgs(options: SshOptions): string[] {
  const args = ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${options.connectTimeout ?? 10}`]
  if (options.port !== undefined && Number.isInteger(options.port) && options.port > 0) {
    args.push('-p', String(options.port))
  }
  if (options.identityFile !== undefined && options.identityFile.trim() !== '') {
    args.push('-i', options.identityFile.trim())
  }
  args.push(options.target, options.command)
  return args
}

function clampTimeout(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return SSH_DEFAULT_TIMEOUT_MS
  return Math.min(Math.trunc(value), SSH_MAX_TIMEOUT_MS)
}

function capOutput(text: string): string {
  return text.length <= SSH_MAX_CHARS ? text : `${text.slice(0, SSH_MAX_CHARS)}\n…（输出截断）`
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `ssh 失败：${message}`, error }
}

export function createSshSkill(): SkillProtocol {
  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'run') return fail(`未知 action: ${action}（当前仅支持 run）`, SKILL_ERRORS.BAD_ACTION)

    const target = typeof params.target === 'string' ? params.target.trim() : ''
    const command = typeof params.command === 'string' ? params.command : ''
    if (target === '') return fail('缺少 target（user@host 或 host）', SKILL_ERRORS.BAD_ARG)
    if (command.trim() === '') return fail('缺少 command', SKILL_ERRORS.BAD_ARG)

    const portRaw = params.port
    const port = typeof portRaw === 'number' ? portRaw : undefined
    const identityFile = typeof params.identity_file === 'string' ? params.identity_file : undefined
    const timeout = clampTimeout(params.timeout_ms)
    const args = buildSshArgs({ target, command, ...(port !== undefined ? { port } : {}), ...(identityFile !== undefined ? { identityFile } : {}) })

    return await new Promise<SkillResult>((resolve) => {
      let settled = false
      const finish = (result: SkillResult): void => {
        if (settled) return
        settled = true
        resolve(result)
      }
      let stdout = ''
      let stderr = ''
      let child
      try {
        child = spawn('ssh', args, { windowsHide: true })
      } catch (error) {
        finish(fail(error instanceof Error ? error.message : String(error), SKILL_ERRORS.SPAWN))
        return
      }
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          // 已退出
        }
        finish(fail(`执行超时（${timeout}ms）`, SKILL_ERRORS.TIMEOUT))
      }, timeout)

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8')
      })
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8')
      })
      child.on('error', (error: Error) => {
        clearTimeout(timer)
        finish(fail(error.message, SKILL_ERRORS.SPAWN))
      })
      child.on('close', (code: number | null) => {
        clearTimeout(timer)
        const parts = [`退出码：${code ?? -1}`]
        if (stdout.trim() !== '') parts.push(`stdout:\n${capOutput(stdout)}`)
        if (stderr.trim() !== '') parts.push(`stderr:\n${capOutput(stderr)}`)
        finish({ success: true, message: parts.join('\n\n'), data: { exitCode: code ?? -1 } })
      })
    })
  }

  return {
    id: 'system.ssh',
    description:
      '在远端主机执行一条命令（ssh -o BatchMode=yes，非交互）。需已配置 SSH key/agent。'
      + '参数 target(user@host) / command；可选 port / identity_file / timeout_ms。返回退出码与输出。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run'], description: '操作类型: run=执行' },
        target: { type: 'string', description: '目标主机（user@host 或 host）' },
        command: { type: 'string', description: '远端要执行的命令' },
        port: { type: 'integer', description: 'SSH 端口（默认 22）' },
        identity_file: { type: 'string', description: '私钥路径（可选）' },
        timeout_ms: { type: 'integer', description: `超时毫秒（默认 ${SSH_DEFAULT_TIMEOUT_MS}）` }
      },
      required: ['action', 'target', 'command']
    },
    tags: ['system', 'ssh'],
    execute: run
  }
}
