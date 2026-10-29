/**
 * 会话轨迹的纯逻辑层（借 dsh `ui-trajectory` 的「按轮次组织的事件表 + 概览」）。
 *
 * dsh 的 Trajectory 是**主区页签**：把一轮里的 user / assistant / tool / 子工具 /
 * compaction 记录按时间线摊开，配 token 用量与耗时概览，点行看详情。
 * 我们没有 compaction，子智能体也不挂在步骤里，所以这里只做**能诚实地做**的部分：
 * 概览（状态/消息/轮数/步骤/失败/token/耗时）+ 按轮次分组的步骤表 + 消息序列。
 *
 * 单独成模块的原因与 `toolDetail.ts` 相同：分组与计数是纯函数，组件只负责画。
 */

import type { DigitalPanelState, DigitalStep } from './panel'

/** 轨迹里的一行步骤（只保留展示需要的字段，不透传整个事件） */
export interface TrajectoryStepRow {
  /** 在整轮序列里的序号（从 0 起，跨轮累加） */
  index: number
  tool: string
  kind: DigitalStep['kind']
  status: DigitalStep['status']
  /** 结果首行截断（详情仍在对话面板的步骤列表里） */
  summary: string
}

/** 一轮（`order` 相同即同一轮） */
export interface TrajectoryTurn {
  order: number
  steps: TrajectoryStepRow[]
  done: number
  failed: number
}

/** 顶部概览：一次运行的成本与规模 */
export interface TrajectoryOverview {
  status: DigitalPanelState['status']
  messageCount: number
  turnCount: number
  stepCount: number
  failedCount: number
  runningSubagents: number
  totalTokens: number
  latencyMs: number
  model: string
}

export interface TrajectoryModel {
  overview: TrajectoryOverview
  turns: TrajectoryTurn[]
  /** 消息序列（原文交给组件截断，这里不丢信息） */
  messages: Array<{ role: 'user' | 'assistant'; text: string }>
}

/** 摘要截断长度：轨迹是「扫一眼」的视图，长输出留给对话面板 */
export const TRAJECTORY_SUMMARY_LIMIT = 80

function summarize(result: string | undefined): string {
  const first = (result ?? '').trim().split('\n')[0] ?? ''
  if (first === '') return ''
  return first.length > TRAJECTORY_SUMMARY_LIMIT ? `${first.slice(0, TRAJECTORY_SUMMARY_LIMIT)}…` : first
}

/**
 * 把面板状态投影成轨迹模型。
 *
 * `turns` 按 `order` **连续分组**（与 `DigitalStepList` 同口径：order 变化即新的一轮），
 * 不排序——排序会把「同一 order 但中间插入别的 order」的真实顺序打乱。
 */
export function buildTrajectory(state: DigitalPanelState): TrajectoryModel {
  const turns: TrajectoryTurn[] = []
  let index = 0
  for (const step of state.steps) {
    const last = turns.at(-1)
    const row: TrajectoryStepRow = {
      index: index++,
      tool: step.tool,
      kind: step.kind,
      status: step.status,
      summary: summarize(step.result)
    }
    if (last !== undefined && last.order === step.order) {
      last.steps.push(row)
      if (step.status === 'done') last.done += 1
      if (step.status === 'failed') last.failed += 1
    } else {
      turns.push({
        order: step.order,
        steps: [row],
        done: step.status === 'done' ? 1 : 0,
        failed: step.status === 'failed' ? 1 : 0
      })
    }
  }

  return {
    overview: {
      status: state.status,
      messageCount: state.messages.length,
      turnCount: turns.length,
      stepCount: state.steps.length,
      failedCount: state.steps.filter((step) => step.status === 'failed').length,
      runningSubagents: state.subagents.filter((sub) => sub.status === 'running').length,
      totalTokens: state.runStats.totalTokens,
      latencyMs: state.runStats.latencyMs,
      model: state.runStats.model
    },
    turns,
    messages: state.messages.map((message) => ({ role: message.role, text: message.text }))
  }
}

/** 毫秒 → 人类可读耗时（`1.2s` / `850ms`）；0 视为「未开始」返回空串 */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m${Math.round(seconds % 60)}s`
}
