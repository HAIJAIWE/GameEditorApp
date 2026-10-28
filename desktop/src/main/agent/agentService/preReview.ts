/**
 * 执行预审 Provider（#27，对齐 dsh 的执行前审查）。
 *
 * 主进程侧的可选 provider：渲染层「执行预审」插件经 IPC `agent:setPreReviewEnabled`
 * 开/关本开关，主进程在 `agent:chat` 处理时若开关打开则装配 `makePreExecReview()`。
 *
 * 设计铁律（见 `PreExecReviewFn` 注释）：**只收紧、不放开**——
 * - 风险等级 ≥ `RISK_LEVEL.SYSTEM` ⇒ `approve:false`（确定性 [STOP]，不再走人工）；
 * - 其余 ⇒ `approve:true`（放行至人工审批，人类仍是最终闸）。
 *
 * 当前实现是**确定性启发式**（复用 `resolveRiskLevel`，离线、零延迟），作为 experimental
 * 插件的 MVP；后续可升级为「LLM 判读参数意图」的 provider（同接口替换即可，循环无需改动）。
 */

import { resolveRiskLevel, RISK_LEVEL } from '../../../shared/agent/protocol'
import type { PreExecReviewFn } from '../../../shared/agent/brain'

let enabled = false

/** 渲染层开关：是否启用执行预审 */
export function setPreReviewEnabled(value: boolean): void {
  enabled = value
}

/** 读取当前开关状态（插件 UI 回显用） */
export function isPreReviewEnabled(): boolean {
  return enabled
}

/**
 * 构造执行预审函数。
 *
 * 启发式口径：依据（tool, action）的风险等级——达到 SYSTEM 级（shell/code/scheduler 等）
 * 视为「模型先拦一道」，避免无人值守时这类高危操作直接进人工审批队列。
 */
export function makePreExecReview(): PreExecReviewFn {
  return ({ tool, action, risk }) => {
    // 循环已算好 risk；兜底再算一次以防调用方未传
    const level = typeof risk === 'number' && risk > 0 ? risk : resolveRiskLevel(tool, action)
    if (level >= RISK_LEVEL.SYSTEM) {
      return {
        approve: false,
        reason: `风险等级=SYSTEM(${level})：高危操作(${tool}${action ? `/${action}` : ''})被执行预审拦截`
      }
    }
    return { approve: true, reason: `风险等级=${level}：未触发预审红线` }
  }
}
