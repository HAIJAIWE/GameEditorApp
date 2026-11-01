/**
 * `system.workflow` 内置技能：把一组工具步骤按**依赖关系**执行（dsh `workflow` 的有界子集）。
 *
 * 与 agent 循环的区别：一次调用跑完固定步骤，确定性、省往返；适合「把已知的 N 步串起来」。
 *
 * ## 依赖模型（DAG，但**串行执行**）
 * 每个步骤可声明 `id` 与 `dependsOn`：
 * - 不写 `dependsOn` 且 `continue_on_error=false` ⇒ 隐式「依赖上一步」（= 原来的顺序执行，
 *   失败即停）；
 * - `continue_on_error=true` ⇒ 不建隐式链，各步互不依赖（原来的"继续"语义）；
 * - 显式 `dependsOn` ⇒ 按拓扑序执行；**依赖失败的步骤会被跳过**（而不是整条 workflow 崩），
 *   与失败分支无关的步骤照常跑。
 *
 * **为什么不并行**：审批门是**单令牌**（`dangerConfirmed` 一次只够一个 SYSTEM 步骤），
 * 并行跑同层会互相串审批——那不是提速，是把审批门变成摆设。故同层也串行，
 * 只保留"依赖关系"这一层语义。要并行得先给审批门加多令牌，属独立议题。
 *
 * ## 步骤间传值
 * `params` 里可写 `{{steps.<id>.data.<路径>}}`（整串占位则保留原类型，嵌在文本里则转字符串），
 * 于是"建条目 → 用它的 id 再改"这类链式操作能在一次调用里完成。
 *
 * **安全**：每一步都经 `executeGated`——风险 ≥ SYSTEM 的子步骤会**再问一次审批**，
 * 不会因为「包了一层 workflow」就绕过审批门。没有审批通道时 fail-closed。
 * 禁止嵌套 workflow（防递归）。
 */

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillExecutionContext, SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** 单次 workflow 的步骤上限 */
export const WORKFLOW_MAX_STEPS = 20

export interface WorkflowStep {
  /** 步骤 id（供 `dependsOn` 与 `{{steps.<id>…}}` 引用）；缺省 `#<序号>` */
  id: string
  tool: string
  params: Record<string, unknown>
  /** 依赖的步骤 id；空数组表示无依赖 */
  dependsOn: string[]
}

export interface WorkflowSkillOptions {
  /** 带审批的子工具执行（由 dispatcher.executeGated 提供） */
  executeGated: (
    tool: string,
    params: Record<string, unknown>,
    ctx: SkillExecutionContext
  ) => Promise<SkillResult>
}

/** 一步的执行结局 */
export type WorkflowStepStatus = 'ok' | 'failed' | 'skipped'

export interface WorkflowStepResult {
  index: number
  id: string
  tool: string
  status: WorkflowStepStatus
  message: string
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `workflow 失败：${message}`, error }
}

/**
 * 解析并校验步骤（结构 + id 唯一 + 依赖存在）；不合法返回错误文案。
 *
 * ## 隐式依赖只在整个 workflow 都是"线性"时才生效
 * 先扫一遍"有没有任何一步显式写了 `dependsOn`"：
 * - **有** ⇒ DAG 模式：没写 `dependsOn` 的步骤就是**根节点**（无依赖），
 *   否则"独立分支"会被上一步悄悄串住（踩过：c 没写依赖却被 b 拖死）；
 * - **没有** ⇒ 线性模式：默认依赖上一步（`continue_on_error=true` 时退化成互不依赖）。
 */
export function parseSteps(
  raw: unknown,
  continueOnError: boolean
): { steps: WorkflowStep[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > WORKFLOW_MAX_STEPS) {
    return { error: `steps 必须是非空数组（最多 ${WORKFLOW_MAX_STEPS} 步，每步含 tool）` }
  }
  const draft: Array<{ id: string; tool: string; params: Record<string, unknown>; declared: string[] | null }> = []
  const seen = new Set<string>()
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    if (item === null || typeof item !== 'object') return { error: `第 ${index + 1} 步不是对象` }
    const record = item as { id?: unknown; tool?: unknown; params?: unknown; dependsOn?: unknown }
    if (typeof record.tool !== 'string' || record.tool.trim() === '') {
      return { error: `第 ${index + 1} 步缺 tool` }
    }
    const id = typeof record.id === 'string' && record.id.trim() !== '' ? record.id.trim() : `#${index + 1}`
    if (seen.has(id)) return { error: `步骤 id 重复：${id}` }
    seen.add(id)
    const params =
      record.params !== null && typeof record.params === 'object'
        ? (record.params as Record<string, unknown>)
        : {}
    let declared: string[] | null = null
    if (record.dependsOn !== undefined) {
      if (!Array.isArray(record.dependsOn) || record.dependsOn.some((dep) => typeof dep !== 'string')) {
        return { error: `第 ${index + 1} 步的 dependsOn 必须是字符串数组` }
      }
      declared = (record.dependsOn as string[]).map((dep) => dep.trim()).filter((dep) => dep !== '')
    }
    draft.push({ id, tool: record.tool.trim(), params, declared })
  }

  const isDag = draft.some((step) => step.declared !== null)
  const steps: WorkflowStep[] = draft.map((step, index) => {
    if (step.declared !== null) return { id: step.id, tool: step.tool, params: step.params, dependsOn: step.declared }
    if (isDag || continueOnError) return { id: step.id, tool: step.tool, params: step.params, dependsOn: [] }
    const previous = draft[index - 1]
    return { id: step.id, tool: step.tool, params: step.params, dependsOn: previous === undefined ? [] : [previous.id] }
  })

  const ids = new Set(steps.map((step) => step.id))
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) return { error: `步骤 ${step.id} 依赖了不存在的 id：${dep}` }
      if (dep === step.id) return { error: `步骤 ${step.id} 不能依赖自己` }
    }
  }
  return { steps }
}

/**
 * 拓扑排序；有环返回 null。
 *
 * Kahn 算法：反复取"依赖都已排出"的节点。剩余节点数 > 0 即为环
 * （不另做 DFS 判环——Kahn 的剩余集合本身就是证据，省一次遍历）。
 */
export function topoOrder(steps: WorkflowStep[]): WorkflowStep[] | null {
  const byId = new Map(steps.map((step) => [step.id, step]))
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const step of steps) {
    indegree.set(step.id, step.dependsOn.length)
    for (const dep of step.dependsOn) {
      const list = dependents.get(dep)
      if (list === undefined) dependents.set(dep, [step.id])
      else list.push(step.id)
    }
  }
  // 用原顺序做稳定选择：同层按声明顺序执行，结果可复现
  const ready = steps.filter((step) => (indegree.get(step.id) ?? 0) === 0).map((step) => step.id)
  const ordered: WorkflowStep[] = []
  while (ready.length > 0) {
    const id = ready.shift() as string
    const step = byId.get(id)
    if (step === undefined) continue
    ordered.push(step)
    for (const next of dependents.get(id) ?? []) {
      const left = (indegree.get(next) ?? 1) - 1
      indegree.set(next, left)
      if (left === 0) ready.push(next)
    }
  }
  return ordered.length === steps.length ? ordered : null
}

/** 占位符：整串即 `{{steps.<id>.<path>}}` */
const REF_WHOLE = /^\{\{steps\.([A-Za-z0-9_#-]+)\.([A-Za-z0-9_.]+)\}\}$/u
/** 占位符：嵌在文本里（会被 String() 后拼进去） */
const REF_EMBED = /\{\{steps\.([A-Za-z0-9_#-]+)\.([A-Za-z0-9_.]+)\}\}/gu

/** 从结果里按路径取值（`data.a.b` / `message`）；取不到返回 undefined */
function readPath(results: Map<string, WorkflowStepResult & { data?: unknown }>, id: string, path: string): unknown {
  const result = results.get(id)
  if (result === undefined) return undefined
  const segments = path.split('.')
  let cursor: unknown = result
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }
  return cursor
}

/** 把 params 里的 `{{steps.<id>…}}` 替换成真实值（整串占位保留原类型） */
export function resolveParams(
  params: Record<string, unknown>,
  results: Map<string, WorkflowStepResult & { data?: unknown }>
): { params: Record<string, unknown>; missing: string[] } {
  const missing: string[] = []
  const resolveString = (text: string): unknown => {
    const whole = REF_WHOLE.exec(text)
    if (whole !== null) {
      const value = readPath(results, whole[1] as string, whole[2] as string)
      if (value === undefined) {
        missing.push(text)
        return text
      }
      return value
    }
    return text.replace(REF_EMBED, (match, id: string, path: string) => {
      const value = readPath(results, id, path)
      if (value === undefined) {
        missing.push(match)
        return match
      }
      return typeof value === 'string' ? value : JSON.stringify(value)
    })
  }
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return resolveString(value)
    if (Array.isArray(value)) return value.map(walk)
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, inner] of Object.entries(value as Record<string, unknown>)) out[key] = walk(inner)
      return out
    }
    return value
  }
  return { params: walk(params) as Record<string, unknown>, missing }
}

export function createWorkflowSkill(options: WorkflowSkillOptions): SkillProtocol {
  async function run(params: Record<string, unknown>, ctx: SkillExecutionContext): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'run') {
      return fail(`未知 action: ${action}（当前仅支持 run）`, SKILL_ERRORS.BAD_ACTION)
    }
    const continueOnError = params.continue_on_error === true
    const parsed = parseSteps(params.steps, continueOnError)
    if ('error' in parsed) return fail(parsed.error, SKILL_ERRORS.BAD_ARG)
    const { steps } = parsed

    if (steps.some((step) => step.tool === 'system.workflow')) {
      return fail('禁止嵌套 workflow', SKILL_ERRORS.NESTED)
    }
    const ordered = topoOrder(steps)
    if (ordered === null) return fail('dependsOn 存在环，无法确定执行顺序', SKILL_ERRORS.BAD_ARG)

    const done = new Map<string, WorkflowStepResult & { data?: unknown }>()
    const results: WorkflowStepResult[] = []
    let failedAt: number | null = null

    for (const step of ordered) {
      const index = steps.indexOf(step) + 1
      // 依赖里有失败/被跳过的 → 本步跳过（下游不再执行，但无关分支照常跑）
      const blockedBy = step.dependsOn.find((dep) => {
        const state = done.get(dep)?.status
        return state !== 'ok'
      })
      if (blockedBy !== undefined) {
        const skipped: WorkflowStepResult = {
          index,
          id: step.id,
          tool: step.tool,
          status: 'skipped',
          message: `跳过：依赖 ${blockedBy} 未成功`
        }
        results.push(skipped)
        done.set(step.id, skipped)
        continue
      }

      const resolved = resolveParams(step.params, done)
      if (resolved.missing.length > 0) {
        const failed: WorkflowStepResult = {
          index,
          id: step.id,
          tool: step.tool,
          status: 'failed',
          message: `参数引用了取不到的步骤结果：${resolved.missing.join(', ')}`
        }
        results.push(failed)
        done.set(step.id, failed)
        if (failedAt === null) failedAt = index
        continue
      }

      const result = await options.executeGated(step.tool, resolved.params, ctx)
      const entry: WorkflowStepResult & { data?: unknown } = {
        index,
        id: step.id,
        tool: step.tool,
        status: result.success ? 'ok' : 'failed',
        message: result.message,
        ...(result.data !== undefined ? { data: result.data } : {})
      }
      results.push(entry)
      done.set(step.id, entry)
      if (!result.success && failedAt === null) failedAt = index
    }

    const icon = (status: WorkflowStepStatus): string =>
      status === 'ok' ? '✓' : status === 'failed' ? '✗' : '⊘'
    const lines = results.map(
      (item) => `${item.index}. [${item.id}] ${item.tool} ${icon(item.status)}\n   ${item.message.slice(0, 300)}`
    )
    const okCount = results.filter((item) => item.status === 'ok').length
    const skippedCount = results.filter((item) => item.status === 'skipped').length
    const header =
      failedAt === null
        ? `workflow 完成（${okCount}/${steps.length} 步${skippedCount > 0 ? `，${skippedCount} 跳过` : ''}）`
        : `workflow 在第 ${failedAt} 步失败（成功 ${okCount}/${steps.length} 步`
          + `${skippedCount > 0 ? `，${skippedCount} 跳过` : ''}）`
    return {
      success: failedAt === null,
      message: `${header}\n${lines.join('\n')}`,
      ...(failedAt === null ? {} : { error: SKILL_ERRORS.STEP_FAILED }),
      data: { results, failedAt }
    }
  }

  return {
    id: 'system.workflow',
    description:
      '按依赖关系执行一组工具步骤（一次调用跑完固定流程，确定性、省往返）。'
      + `steps: [{id?, tool, params?, dependsOn?}]，最多 ${WORKFLOW_MAX_STEPS} 步；每步经审批门（SYSTEM 会再确认）。`
      + '不写 dependsOn 时默认依赖上一步（失败即停）；写 dependsOn 后按拓扑序执行，'
      + '依赖失败的步骤会被跳过而无关分支照常跑。params 可用 {{steps.<id>.data.<路径>}} 引用前序步骤结果。'
      + '禁止嵌套 workflow。',
    version: '0.2.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run'], description: '操作类型: run=执行步骤' },
        steps: {
          type: 'array',
          description: '步骤列表，每步 { id?, tool, params?, dependsOn? }',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: '步骤 id（供 dependsOn / 结果引用）' },
              tool: { type: 'string', description: '工具 id（如 system.file_ops）' },
              params: { type: 'object', description: '该步参数（支持 {{steps.<id>.data.<路径>}}）' },
              dependsOn: {
                type: 'array',
                description: '依赖的步骤 id（拓扑序；依赖失败则本步跳过）',
                items: { type: 'string' }
              }
            },
            required: ['tool']
          }
        },
        continue_on_error: {
          type: 'boolean',
          description: '不建隐式依赖链（各步互不依赖，失败不影响其他步）；显式 dependsOn 时本项无效'
        }
      },
      required: ['action', 'steps']
    },
    tags: ['system', 'workflow'],
    execute: run
  }
}
