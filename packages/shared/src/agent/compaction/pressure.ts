/**
 * 压力预算：由**模型上下文窗口**推导压缩触发阈值（对齐 dsh `compaction-basic` 的思路）。
 *
 * dsh 的做法（`compaction-basic/src/config.ts`）：
 *   messageBudget = contextWindow - reservedCompletionTokens
 *   pressureBudget = messageBudget - headroomTokens
 *   thresholdTokens = min(contextWindow × thresholdRatio, pressureBudget)
 *
 * 我们不做它那套「按 provider/model 逐条覆盖 + 加载期校验」的配置层（无此需求），
 * 只取**核心公式**，并保留一条安全约束：
 *
 *   threshold = min(档位既有阈值, floor(模型窗口 × ratio))
 *
 * 这样：常规情况**完全等于现有行为**（local 6000 / cloud 30000），
 * 只有当模型真实窗口比档位阈值还小时才提前压缩——**小模型被保护，大模型零回归**。
 */

import { modelContextWindow } from '../../config/llm'
import type { AgentRunTier } from '../observability'

/** 窗口的百分之多少算「压力到了」（dsh 默认 0.8） */
export const THRESHOLD_RATIO = 0.8
/** 末尾保留比例（dsh 默认 0.16），只用于估算保留量，实际由配对安全的切点决定 */
export const RETAIN_RATIO = 0.16

/** 本地档假定的有效窗口：×0.8 = 6000，与改造前硬编码的本地阈值一致 */
export const LOCAL_ASSUMED_WINDOW = 7500
/** 云端档既有阈值（改造前硬编码 30000） */
export const CLOUD_TIER_THRESHOLD = 30000
/** 本地档既有阈值（改造前硬编码 6000） */
export const LOCAL_TIER_THRESHOLD = 6000

export interface PressureBudget {
  /** 参与计算的上下文窗口（本地档是假定值，云端档取模型真实窗口） */
  contextWindow: number
  /** 档位既有阈值（安全上限） */
  tierThreshold: number
  /** 由模型窗口推导的阈值 */
  windowThreshold: number
  /** 生效阈值 = min(档位, 窗口推导) */
  thresholdTokens: number
  /** 建议保留的尾部 token 量（只作参考，实际以工具配对为准） */
  retainTokens: number
}

/**
 * 推导压缩阈值。
 * @param tier 运行档位（local / cloud）
 * @param model 实际调用的模型名（首轮可能为空 → 云端按默认窗口）
 */
export function resolvePressureBudget(tier: AgentRunTier, model = ''): PressureBudget {
  // `unconfigured`（未配置 LLM）无从得知模型窗口，按最保守的本地档处理
  const cloud = tier === 'cloud'
  const contextWindow = cloud ? modelContextWindow(model) : LOCAL_ASSUMED_WINDOW
  const windowThreshold = Math.floor(contextWindow * THRESHOLD_RATIO)
  const tierThreshold = cloud ? CLOUD_TIER_THRESHOLD : LOCAL_TIER_THRESHOLD
  const thresholdTokens = Math.max(1, Math.min(tierThreshold, windowThreshold))
  const messageBudget = Math.max(1, contextWindow)
  return {
    contextWindow,
    tierThreshold,
    windowThreshold,
    thresholdTokens,
    retainTokens: Math.floor(messageBudget * RETAIN_RATIO),
  }
}
