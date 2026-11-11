import { describe, expect, it } from 'vitest'

import {
  countRemainingInStage,
  locateWizardPosition,
  planNextStep
} from '../../src/renderer/src/components/agent/aiFullWizard'

/**
 * 分步生成向导的纯逻辑（2026-11-11，用户原话「可以，但不一键生成，要步骤都来」）。
 *
 * 这里锁的是两件最容易写错的事：
 *   1. **跨阶段要停下来问**——章顺序里阶段并不连续（mvp 属立项、resources 属发行），
 *      所以不能用「下标相邻」判断，必须比阶段序号；
 *   2. **关窗恢复后停在哪一章**——已写盘的章不该再让人确认一次。
 * 这两件事如果是错的，界面上看起来都「像在正常工作」，只有单测能抓住。
 */

/** 立项 3 章 + 研发 2 章 + 发行 2 章的最小顺序，够覆盖两次跨阶段 */
const ORDER = ['meta', 'vision', 'mvp', 'story', 'systems', 'resources', 'publishing'] as const

describe('planNextStep：下一步停在哪一章', () => {
  it('同阶段相邻章：不设门，直接给下一章', () => {
    expect(planNextStep(ORDER, 0, 'meta')).toEqual({ cursor: 1, stageGate: null })
    expect(planNextStep(ORDER, 1, 'vision')).toEqual({ cursor: 2, stageGate: null })
  })

  it('从立项跨到研发：设研发阶段的阶段门', () => {
    // mvp 是立项最后一章（索引 2），下一章 story 属研发
    expect(planNextStep(ORDER, 2, 'mvp')).toEqual({ cursor: 3, stageGate: 'production' })
  })

  it('从研发跨到发行：设发行阶段的阶段门', () => {
    expect(planNextStep(ORDER, 4, 'systems')).toEqual({ cursor: 5, stageGate: 'release' })
  })

  it('最后一章之后：cursor 越界表示已跑完，不设门', () => {
    const next = planNextStep(ORDER, ORDER.length - 1, 'publishing')
    expect(next.cursor).toBe(ORDER.length)
    expect(next.stageGate).toBeNull()
  })

  it('章顺序里阶段不连续也照样判对（mvp 立项 → resources 发行不能只看下标）', () => {
    // 构造真实计划里的「跳阶段」形态：mvp(立项) 紧跟 resources(发行)
    const jumps = ['meta', 'mvp', 'resources'] as const
    expect(planNextStep(jumps, 1, 'mvp')).toEqual({ cursor: 2, stageGate: 'release' })
  })
})

describe('locateWizardPosition：恢复草稿时停在哪一章', () => {
  it('跳过已写盘的章，停在第一个没写盘的章', () => {
    expect(locateWizardPosition(ORDER, ['meta', 'vision'], ['meta', 'vision'], 0)).toEqual({
      cursor: 2,
      reviewing: false
    })
  })

  it('停在「有结果但未写盘」的章时进入 review 态（不重复调模型）', () => {
    expect(locateWizardPosition(ORDER, ['meta', 'vision'], ['meta'], 0)).toEqual({
      cursor: 1,
      reviewing: true
    })
  })

  it('从快照记下的 cursor 继续，不必从第一章重扫', () => {
    expect(locateWizardPosition(ORDER, ['story'], [], 3)).toEqual({ cursor: 3, reviewing: true })
  })

  it('cursor 越界（旧快照 / 计划变短）收敛到末尾，不把面板卡死', () => {
    expect(locateWizardPosition(ORDER, [], [], 99)).toEqual({ cursor: ORDER.length, reviewing: false })
    expect(locateWizardPosition(ORDER, [], [], -5)).toEqual({ cursor: 0, reviewing: false })
  })

  it('全部已写盘：停在末尾，收尾由调用方判定', () => {
    expect(locateWizardPosition(ORDER, [...ORDER], [...ORDER], 0)).toEqual({
      cursor: ORDER.length,
      reviewing: false
    })
  })
})

describe('countRemainingInStage：阶段门文案里的「还剩几章」', () => {
  it('只数本阶段且未写盘的章', () => {
    expect(countRemainingInStage(ORDER, ['meta'], 'concept')).toBe(2)
    expect(countRemainingInStage(ORDER, ['meta', 'vision', 'mvp'], 'concept')).toBe(0)
  })

  it('别的阶段写没写不影响本阶段计数', () => {
    expect(countRemainingInStage(ORDER, ['story', 'systems'], 'release')).toBe(2)
  })
})
