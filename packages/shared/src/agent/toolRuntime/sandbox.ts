/**
 * 沙箱升级阶梯（对齐 dsh `sandbox/escalation.ts`）。
 *
 * 三条同源设计：
 * 1. **严格更宽**：只能往更宽的模式升级（`read-only → workspace-write → danger-full-access`），
 *    不存在"升级到更窄"或平级升级。
 * 2. **参数成对**：`sandbox_permissions` 与 `justification` 必须同时出现，理由必须非空句子——
 *    没有理由的审批请求、或理由驱动不了任何东西，都是畸形请求。
 * 3. **审批先于执行**：`approveEscalation` 在任何副作用发生**之前**完成审批（fail-closed）。
 *
 * 通道是**结构函数**（`EscalationAsk`），不是具体的审批服务类型：
 * 工具层拥有 agent/callId/toolName，自己闭包出 `requestApproval`，本模块不依赖它们。
 *
 * @module agent/tools/sandbox
 */

/** 沙箱模式（比现有 `SandboxPolicy` 多一档 `danger-full-access`） */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

/**
 * 严格更宽表：当前模式 → 允许升级到的模式。
 * 在**执行期**判定，绝不写进工具 schema（schema 是注册表全局的，实际模式是每次调用的真值）。
 */
export const WIDER_MODES: Record<string, readonly SandboxMode[]> = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access']
}

/**
 * 封闭的升级目标词表（`read-only` 是地板，没人能升到它）。
 * 只要挂载的能力有围栏，就完整广告这两个——按默认模式裁剪会把"当前更窄的会话"卡死。
 */
export const ESCALATION_TARGETS: readonly SandboxMode[] = ['workspace-write', 'danger-full-access']

/**
 * 校验 schema 表达不了的参数配对。
 * @param sandboxPermissions - 原始 `sandbox_permissions`
 * @param justification - 原始 `justification`
 */
export function validateEscalationArgs(sandboxPermissions: string | undefined, justification: string | undefined): void {
  if (sandboxPermissions !== undefined && justification === undefined) {
    throw new Error('invalid escalation: sandbox_permissions requires a justification')
  }
  if (justification !== undefined && sandboxPermissions === undefined) {
    throw new Error('invalid escalation: justification is only valid together with sandbox_permissions')
  }
  if (justification !== undefined && justification.trim().length === 0) {
    throw new Error('invalid justification: expected a non-empty sentence')
  }
}

/**
 * 模型可见的拒绝标记（两类执行族共用同一词表，模型能一致识别）。
 * @param mode - 被拒绝那次调用所处的模式
 */
export function sandboxDenialMarker(mode: SandboxMode): string {
  return `[sandbox: file access denied under ${mode} mode]`
}

/**
 * 同轮升级提示：随拒绝一起给模型，让"被允许的重试"不依赖它记住工具描述。
 * @param subject - 被拒动作的名词（bash 用 `command`，文件写用 `operation`）
 */
export function escalationHintMarker(subject: string): string {
  return `[sandbox: escalation available — retry this exact ${subject} once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`
}

/** 审批通道：结构函数，由工具层闭包实现（不依赖审批服务类型） */
export type EscalationAsk = (request: {
  mode: SandboxMode
  justification: string
  subject: string
}) => Promise<boolean>

/** 升级审批结果 */
export type EscalationOutcome =
  | { ok: true; mode: SandboxMode }
  | { ok: false; reason: string }

/**
 * 按序、fail-closed 地处理一次升级请求：**先校验 → 再审批 → 才返回可用模式**。
 * @param args - 当前模式、请求的目标、理由、动作名词、审批通道
 * @returns 允许时给出实际生效模式；否则给出拒绝原因
 */
export async function approveEscalation(args: {
  current: SandboxMode
  requested: string | undefined
  justification: string | undefined
  subject: string
  ask: EscalationAsk
}): Promise<EscalationOutcome> {
  try {
    validateEscalationArgs(args.requested, args.justification)
  } catch (error: unknown) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
  // 没请求升级：按当前模式继续（不审批）
  if (args.requested === undefined) return { ok: true, mode: args.current }

  const target = args.requested as SandboxMode
  if (!ESCALATION_TARGETS.includes(target)) {
    return { ok: false, reason: `invalid escalation target: ${args.requested}` }
  }
  if (!(WIDER_MODES[args.current] ?? []).includes(target)) {
    return { ok: false, reason: `cannot escalate from ${args.current} to ${target} (must be strictly wider)` }
  }
  const approved = await args.ask({
    mode: target,
    justification: args.justification ?? '',
    subject: args.subject
  })
  return approved ? { ok: true, mode: target } : { ok: false, reason: 'escalation denied by user' }
}
