/**
 * 目标（goal）内存存储（对齐 dsh `goal` 包的生命周期，但**不做事件溯源投影**）。
 *
 * dsh 的 goal 是 Cordis 插件 + session 投影（create/edit/pause/resume/complete/block/clear +
 * `maxGoalRounds` 轮次上限 + `roundsStarted` 计数 + goal-round-driver 自动续跑）。我们产品已有
 * 自由文本 `options.goal` 锚点，这里补的是**结构化生命周期 + 轮次安全闸**。
 *
 * 设计取舍：
 * - 内存 `Map<sessionId, GoalState>` 单例（对齐 dsh 进程内激活态；持久化留待会话日志派生）。
 * - 不做事件溯源投影（与 todo v1 同路：状态在 `messages` 里，模型下一轮可见）。
 * - `maxRounds` 由服务层钳到循环 `maxTurns`，实现「轮次上限」安全闸（dsh `maxGoalRounds` 的核心价值）。
 */

/** 目标阶段（取值与 dsh `GoalPhase` 一致） */
export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'

/** 阻塞原因（机器可路由 code + 人类可读 message） */
export interface GoalBlockReason {
  code: string
  message: string
}

/** 一条目标的可持久状态 */
export interface GoalState {
  objective: string
  phase: GoalPhase
  /** 轮次上限（dsh `maxGoalRounds`）；服务层据此钳 maxTurns */
  maxRounds: number
  /** 已开始的轮次数（每次 chat 调用 +1，对应 dsh `roundsStarted`） */
  roundsStarted: number
  blockReason?: GoalBlockReason
  createdAt: number
}

/** 默认轮次上限 */
export const DEFAULT_GOAL_MAX_ROUNDS = 10

/** 一族校验/转换错误，技能统一收敛为 `success:false` */
export class GoalError extends Error {}

function assertObjective(objective: unknown): string {
  if (typeof objective !== 'string' || objective.trim() === '') {
    throw new GoalError('objective 必须是非空字符串')
  }
  return objective.trim()
}

function assertMaxRounds(value: unknown): number {
  if (value === undefined) return DEFAULT_GOAL_MAX_ROUNDS
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new GoalError('maxRounds 必须是正整数')
  }
  return value
}

/**
 * 目标存储：按 sessionId 维护当前唯一目标（dsh 同款「一会话一当前目标」约束）。
 * 进程内单例；每会话一份状态。
 */
export class GoalStore {
  private readonly goals = new Map<string, GoalState>()

  /** 当前目标（无则为 null） */
  get(sessionId: string): GoalState | null {
    return this.goals.get(sessionId) ?? null
  }

  /** 创建目标（已存在则报错，需先 clear） */
  create(sessionId: string, objective: string, maxRounds?: number): GoalState {
    if (this.goals.has(sessionId)) {
      throw new GoalError('该会话已存在目标，请先 clear 或 edit')
    }
    const state: GoalState = {
      objective: assertObjective(objective),
      phase: 'active',
      maxRounds: assertMaxRounds(maxRounds),
      roundsStarted: 0,
      createdAt: Date.now()
    }
    this.goals.set(sessionId, state)
    return state
  }

  /** 编辑目标（仅 active/paused 可改 objective/maxRounds） */
  edit(sessionId: string, patch: { objective?: unknown; maxRounds?: unknown }): GoalState {
    const current = this.require(sessionId)
    if (current.phase === 'complete' || current.phase === 'blocked') {
      throw new GoalError(`无法编辑处于 ${current.phase} 状态的目标`)
    }
    if (patch.objective !== undefined) current.objective = assertObjective(patch.objective)
    if (patch.maxRounds !== undefined) current.maxRounds = assertMaxRounds(patch.maxRounds)
    return current
  }

  pause(sessionId: string): GoalState {
    const current = this.require(sessionId)
    if (current.phase !== 'active') throw new GoalError('只有 active 目标可暂停')
    current.phase = 'paused'
    return current
  }

  resume(sessionId: string): GoalState {
    const current = this.require(sessionId)
    if (current.phase !== 'paused') throw new GoalError('只有 paused 目标可恢复')
    current.phase = 'active'
    return current
  }

  complete(sessionId: string): GoalState {
    const current = this.require(sessionId)
    current.phase = 'complete'
    current.blockReason = undefined
    return current
  }

  block(sessionId: string, code: string, message: string): GoalState {
    const current = this.require(sessionId)
    if (current.phase === 'complete') throw new GoalError('已完成目标无法阻塞')
    const trimmedCode = code.trim()
    const trimmedMessage = message.trim()
    if (trimmedCode === '' || trimmedMessage === '') {
      throw new GoalError('block 需提供非空的 code 与 message')
    }
    current.phase = 'blocked'
    current.blockReason = { code: trimmedCode, message: trimmedMessage }
    return current
  }

  /** 清除目标（会话回到无目标态） */
  clear(sessionId: string): void {
    this.goals.delete(sessionId)
  }

  /** 每次 chat 调用开始时调用：active 目标轮次 +1；非 active 不动 */
  bumpRound(sessionId: string): number | null {
    const current = this.goals.get(sessionId)
    if (current === undefined || current.phase !== 'active') return null
    current.roundsStarted += 1
    return current.roundsStarted
  }

  private require(sessionId: string): GoalState {
    const current = this.goals.get(sessionId)
    if (current === undefined) throw new GoalError('该会话尚无目标，请先 create')
    return current
  }
}

/** 进程内单例（技能直接引用；测试可 new GoalStore() 隔离） */
export const goalStore = new GoalStore()

/** 把目标渲染成模型/用户可读的一行（含阶段与轮次进度） */
export function formatGoalStatus(goal: GoalState): string {
  const phaseLabel: Record<GoalPhase, string> = {
    active: '进行中',
    paused: '已暂停',
    blocked: '已阻塞',
    complete: '已完成'
  }
  let line = `目标[${phaseLabel[goal.phase]}]（轮次 ${goal.roundsStarted}/${goal.maxRounds}）：${goal.objective}`
  if (goal.phase === 'blocked' && goal.blockReason !== undefined) {
    line += ` — 阻塞原因：${goal.blockReason.code}：${goal.blockReason.message}`
  }
  return line
}
