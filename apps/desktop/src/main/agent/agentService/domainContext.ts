/**
 * 域上下文与默认评估器（从 `brainService.ts` 拆出）。
 *
 * 放在 `main` 层而非 `shared/agent`：`shared/agent` 必须保持领域无关（分层铁律），
 * 而这里要读本项目的策划书章节结构（`shared/ceshu/reference/ceshuConstants`）。
 */

import type { AgentEvalVerdict } from '@mobai/shared/agent/brain'
import { CHAPTER_KEYS, CHAPTER_NAMES } from '@mobai/shared/ceshu/reference'

/**
 * 域上下文块（F8 / DD-18）：把本项目的策划书章节结构作为常驻 grounding 注入，
 * 让模型知道「一份 GDD 由哪些章构成」，产出才贴合本结构。作为 `extraBlocks` 注入，
 * 不计入 30 行核心区（DD-6）。
 */
export function buildDomainContextBlock(): string {
  const lines = CHAPTER_KEYS.map((key) => {
    const name = CHAPTER_NAMES[key]
    return key === 'meta' ? `- ${name}（文档信息段，不占章号）` : `- ${name}`
  })
  return `## 策划书结构（GDD 章节）\n你是游戏策划 AI 助手，协助管理游戏数据表（职业/技能/装备/怪物/道具/条目）与撰写策划书。一份策划书包含以下章节：\n${lines.join('\n')}`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const

/**
 * 当前时间块（对齐 dsh `context/time-context`）：把「今天几号/星期几」注入提示词，
 * 让模型不靠猜测日期（如写变更日志、排期）。作为 `extraBlocks` 注入，不计入 30 行核心区。
 * 纯函数、时间由调用方传入，便于测试（不依赖真实时钟）。
 */
export function buildTimeContextBlock(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  return `【当前时间】${date} ${time}（${WEEKDAYS[now.getDay()]}）`
}

/**
 * 对话产出默认评估器（F4 评估闭环，云端档挂）：仅做确定性底线检查（空产出），
 * 不阻断生成。后续可扩为复用 `qualityGate` 思路的多维判定。
 */
export function defaultDialogueEvaluator(text: string): AgentEvalVerdict | null {
  if (text.trim().length === 0) return { level: 'flagged', reason: '空产出' }
  return { level: 'ok' }
}
