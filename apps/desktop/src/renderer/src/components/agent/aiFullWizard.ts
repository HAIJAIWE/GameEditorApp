import { CESHU_STAGE_ORDER, stageOfChapter, type CeshuStage } from '@mobai/shared/ceshu/workflow'
import type { ChapterKey } from '@mobai/shared/ceshu/reference'

/**
 * 分步生成向导的纯逻辑（2026-11-11，用户原话「可以，但不一键生成，要步骤都来」）。
 *
 * 为什么单独抽一个模块而不是塞进面板：流程推进是「一格一格走」的状态机，
 * 最容易写错的两处是**跨阶段要停下来问**和**关窗恢复后该停在哪一章**。
 * 这两件事都是纯函数，抽出来就能用单测锁死，不必渲染 1000 行面板去验证。
 */

/** 跨阶段时先过阶段门；null 表示可以直接生成下一章 */
export interface NextStep {
  /** 下一章在 order 中的下标；等于 order.length 表示已跑完 */
  cursor: number
  /** 非 null ⇒ 停在阶段门，等人确认后才进入该阶段 */
  stageGate: CeshuStage | null
}

/**
 * 刚保存完 `finishedChapter`，算出下一步停在哪里。
 *
 * ## 为什么不能只看「相邻两章阶段不同」
 * plan.order 是**依赖顺序**，不是阶段顺序：`buildChapterOrder` 的真实形态是
 * meta, vision, [market], story, gameplay, combat, systems, economy, ... ——
 * market_analysis 属发行阶段却排在第 3，gameplay 属立项却排在 story 后面。
 * 若按「下一章阶段更晚就设门」，一次制作档生成会反复弹门（vision→story 一次、
 * combat→systems 一次……），门就从「决策点」退化成噪音。
 *
 * ## 现在的判定
 * 只有当**当前阶段的章在剩余顺序里已经没有了**、且下一章属于更晚的阶段时，才设门。
 * 也就是「这一阶段真写完了，接下来要投入下一阶段」，这正是需要人拍板的时刻。
 *
 * 实测三档的行为（按 `buildFullGeneratePlan` 的真实过滤结果）：
 *   - 立项档 7 章全是 concept ⇒ **一个门都不设**，只在第 7 章后收尾；
 *   - 制作档 16 章 ⇒ 在 mvp（最后的 concept 章）之后设一道 production 门；
 *   - 全量档 24 章 ⇒ mvp 之后下一位是 resources（release）⇒ 门报 release，
 *     但后续仍会跑 uiux / level_design / qa（production）。这是依赖顺序与阶段
 *     不同序导致的既成事实，不为它重排生成顺序（前序章要点会因此改变）。
 */
export function planNextStep(
  order: readonly string[],
  finishedIndex: number,
  finishedChapter: string
): NextStep {
  const next = finishedIndex + 1
  if (next >= order.length) return { cursor: next, stageGate: null }
  const fromStage = stageOfChapter(finishedChapter as ChapterKey)
  const fromIndex = CESHU_STAGE_ORDER.indexOf(fromStage)
  // 当前阶段还有没跑的章（依赖顺序里散落着）⇒ 还在同一阶段里，不设门
  for (let i = next; i < order.length; i += 1) {
    if (stageOfChapter(order[i] as ChapterKey) === fromStage) return { cursor: next, stageGate: null }
  }
  const toStage = stageOfChapter(order[next] as ChapterKey)
  const crossed = CESHU_STAGE_ORDER.indexOf(toStage) > fromIndex
  return { cursor: next, stageGate: crossed ? toStage : null }
}

/**
 * 恢复草稿时定位到「用户当时该看的那一章」。
 *
 * 规则：从快照记下的 cursor 出发，跳过**已写盘**的章（它们的正文已经在策划书里，
 * 不该再让人确认一次）；停下时若该章已有生成结果 ⇒ 直接进入 review 态，
 * 否则从这一章开始生成。cursor 越界时收敛到末尾，避免旧快照把面板卡死。
 */
export function locateWizardPosition(
  order: readonly string[],
  generated: readonly string[],
  applied: readonly string[],
  savedCursor = 0
): { cursor: number; reviewing: boolean } {
  const generatedSet = new Set(generated)
  const appliedSet = new Set(applied)
  let cursor = Math.max(0, Math.min(Math.trunc(savedCursor), order.length))
  while (cursor < order.length && appliedSet.has(order[cursor] as string)) cursor += 1
  const current = order[cursor]
  return { cursor, reviewing: current !== undefined && generatedSet.has(current) }
}

/** 该阶段还剩几章没写盘（用于阶段门文案；只数本阶段新增的章） */
export function countRemainingInStage(
  order: readonly string[],
  applied: readonly string[],
  stage: CeshuStage
): number {
  const appliedSet = new Set(applied)
  let remaining = 0
  for (const chapter of order) {
    if (stageOfChapter(chapter as ChapterKey) !== stage) continue
    if (!appliedSet.has(chapter)) remaining += 1
  }
  return remaining
}
