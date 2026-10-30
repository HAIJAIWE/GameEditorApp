/**
 * `system.code` 内置技能（A1-5）：在 QuickJS WASM 沙箱里执行不可信 JS。
 *
 * 对应 旧版 `core/agent/skills/code_skill`，但**实现整体替换**（见 `docs/a-tier-plan.md` §2.2/§2.4）：
 * 旧版 是 `subprocess.run([sys.executable, script])` + 正则黑名单（可绕），
 * TS 侧用已预演的 `runInSandbox`——WASM 沙箱、默认零宿主能力（无 require/process/fs/网络）、
 * 带 CPU 超时与内存上限。
 *
 * 风险等级：`TOOL_RISK_MAP['system.code'] = SYSTEM` → **每次调用都必须经用户确认**
 * （这也是 A1-4 遗留的「审批端到端拦截」得以补齐的原因）。
 */

import { runInSandbox } from '../../security/jsSandbox'
import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/config/protocol'

/** 默认执行超时（毫秒） */
export const CODE_DEFAULT_TIMEOUT_MS = 2000
/** 默认内存上限（MB） */
export const CODE_DEFAULT_MEMORY_MB = 64
/** 超时上限（避免 LLM 传超大值绕过保护） */
export const CODE_MAX_TIMEOUT_MS = 10_000
/** 内存上限的最大值（MB） */
export const CODE_MAX_MEMORY_MB = 256

function clampPositive(raw: unknown, fallback: number, max: number): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.trunc(value), max)
}

/** 把沙箱返回值折成可读文本 */
function describeValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function createCodeSkill(): SkillProtocol {
  async function runCode(params: Record<string, unknown>): Promise<SkillResult> {
    const code = typeof params.code === 'string' ? params.code : ''
    if (code.trim() === '') {
      return { success: false, error: '缺少 code 参数', message: '' }
    }

    const timeoutMs = clampPositive(params.timeout_ms, CODE_DEFAULT_TIMEOUT_MS, CODE_MAX_TIMEOUT_MS)
    const memoryLimitMb = clampPositive(params.memory_limit_mb, CODE_DEFAULT_MEMORY_MB, CODE_MAX_MEMORY_MB)

    const result = await runInSandbox(code, { timeoutMs, memoryLimitMb })
    if (!result.ok) {
      return {
        success: false,
        error: `沙箱执行失败: ${result.error ?? '未知错误'}`,
        message: ''
      }
    }
    return {
      success: true,
      message: `执行成功: ${describeValue(result.value)}`,
      data: result.value
    }
  }

  function run(params: Record<string, unknown>, _ctx: SkillExecutionContext): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'execute') {
      return Promise.resolve({ success: false, error: `未知动作: ${action}`, message: '' })
    }
    return runCode(params)
  }

  return {
    id: 'system.code',
    description: '在隔离沙箱中执行 JavaScript 片段（无宿主能力，用于计算/数据整理等）。',
    version: '1.0.0',
    // 高危：每次调用都需用户确认（TOOL_RISK_MAP['system.code'] = SYSTEM）
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['execute'], description: '操作类型: execute=执行代码' },
        code: {
          type: 'string',
          description: '要执行的 JS 片段，需 `return` 一个可 JSON 序列化的值（无 require/process/fs/网络）'
        },
        timeout_ms: { type: 'integer', description: '超时毫秒数', default: CODE_DEFAULT_TIMEOUT_MS },
        memory_limit_mb: { type: 'integer', description: '内存上限 MB', default: CODE_DEFAULT_MEMORY_MB }
      },
      required: ['action', 'code']
    },
    execute: run
  }
}
