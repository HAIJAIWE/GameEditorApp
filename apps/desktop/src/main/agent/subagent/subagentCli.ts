/**
 * CLI 子智能体 provider（Slice 31）。
 *
 * 把子任务交给一个本地 CLI 编码智能体（如 `claude` / `codex` / 任意命令）执行，
 * 捕获其 stdout 作为结果。实现 `SubAgentProvider` 接口 ⇒ 主循环零改动即可接入
 * （见 `RunBrainLoopOptions.subAgentProvider`）。
 *
 * 安全边界（刻意收窄）：
 * - **不用 shell**（`shell: false`），命令与参数分开传，任务文本不会被 shell 解释；
 * - 必须显式配置 `command`（缺省不启用，不会自己跑东西）；
 * - 有超时与取消（父循环 abort 会 kill 子进程）。
 */

import { spawn } from 'node:child_process'

import type { SubAgentOutcome, SubAgentProvider, SubAgentTask } from '@mobai/shared/agent/brain'
import { isAclSandboxSupported, withReadOnlyDir } from '../ops/windowsSandbox'

export interface CliSubAgentOptions {
  /** provider 名称（默认 `cli`） */
  id?: string
  /** 可执行文件（如 `claude`、`codex`、`node`）；必填 */
  command: string
  /** 固定参数（如 `['-p']`）；任务按 `inputMode` 追加或走 stdin */
  args?: string[]
  /** 任务如何传给 CLI：`arg`（追加为最后一个参数，默认）| `stdin` */
  inputMode?: 'arg' | 'stdin'
  /** 子进程工作目录 */
  cwd?: string
  /** 超时（毫秒，默认 120000）；超时 kill 并返回失败 */
  timeoutMs?: number
  /** 追加环境变量 */
  env?: Record<string, string>
}

/** 把 CLI 执行结果折成 provider 结果（stdout 优先，空则回退 stderr） */
function toOutcome(stdout: string, stderr: string, code: number | null): SubAgentOutcome {
  const out = stdout.trim()
  const err = stderr.trim()
  const text = out !== '' ? out : err !== '' ? err : `CLI 子智能体无输出（退出码 ${code ?? 'null'}）`
  return { text, success: code === 0 }
}

export function createCliSubAgentProvider(options: CliSubAgentOptions): SubAgentProvider {
  const inputMode = options.inputMode ?? 'arg'
  const timeoutMs = options.timeoutMs ?? 120_000
  const id = options.id ?? 'cli'

  return {
    id,
    run: (task: SubAgentTask): Promise<SubAgentOutcome> => {
      const runProcess = (): Promise<SubAgentOutcome> =>
        new Promise<SubAgentOutcome>((resolve) => {
        const args = [...(options.args ?? [])]
        if (inputMode === 'arg') args.push(task.task)

        let settled = false
        // 用 ref 对象承载定时器：`finish` 需要提前引用它，而 `let` 只赋值一次会被 prefer-const 拦
        const timerRef: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined }
        let child: ReturnType<typeof spawn> | undefined

        const finish = (outcome: SubAgentOutcome): void => {
          if (settled) return
          settled = true
          if (timerRef.current !== undefined) clearTimeout(timerRef.current)
          task.signal.removeEventListener('abort', onAbort)
          resolve(outcome)
        }

        const onAbort = (): void => {
          child?.kill('SIGTERM')
          finish({ text: 'CLI 子智能体已取消', success: false })
        }

        if (task.signal.aborted) {
          finish({ text: 'CLI 子智能体已取消', success: false })
          return
        }

        try {
          child = spawn(options.command, args, {
            ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
            env: { ...process.env, ...(options.env ?? {}) },
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe']
          })
        } catch (error) {
          finish({
            text: `CLI 子智能体启动失败：${error instanceof Error ? error.message : String(error)}`,
            success: false
          })
          return
        }

        task.signal.addEventListener('abort', onAbort, { once: true })
        timerRef.current = setTimeout(() => {
          child?.kill('SIGTERM')
          finish({ text: `CLI 子智能体超时（${timeoutMs}ms）`, success: false })
        }, timeoutMs)

        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (chunk: unknown) => {
          stdout += String(chunk)
        })
        child.stderr?.on('data', (chunk: unknown) => {
          stderr += String(chunk)
        })
        child.on('error', (error: Error) => {
          finish({ text: `CLI 子智能体启动失败：${error.message}`, success: false })
        })
        child.on('close', (code: number | null) => {
          finish(toOutcome(stdout, stderr, code))
        })

          if (inputMode === 'stdin') child.stdin?.end(task.task)
        })

      // 沙箱（read-only）：开启 OS ACL 沙箱且有显式 cwd ⇒ 真·OS 级只读（icacls 拒绝写入）；
      // 否则拒绝运行（诚实边界：不假装有隔离）。
      if (task.sandboxPolicy === 'read-only') {
        if (options.cwd !== undefined && process.env.MB_SANDBOX_ACL === '1' && isAclSandboxSupported()) {
          return withReadOnlyDir(options.cwd, runProcess)
        }
        return Promise.resolve({
          text: '[STOP] 沙箱策略 read-only：不运行外部 CLI 子智能体（未启用 OS ACL 沙箱）',
          success: false
        })
      }
      return runProcess()
    }
  }
}
