import { describe, expect, it } from 'vitest'

import {
  isPreReviewEnabled,
  makePreExecReview,
  setPreReviewEnabled
} from '../../src/main/agent/agentService/preReview'

describe('preReview provider（#27 执行预审）', () => {
  it('makePreExecReview：SYSTEM 级高危操作被预审拒绝（只收紧不放开）', async () => {
    const review = makePreExecReview()
    const verdict = await review({ tool: 'system.shell', action: 'execute', params: {}, risk: 4 })
    expect(verdict.approve).toBe(false)
    expect(verdict.reason).toContain('SYSTEM')
  })

  it('makePreExecReview：低风险操作放行（approve:true），不拦截正常工具', async () => {
    const review = makePreExecReview()
    const verdict = await review({ tool: 'system.game_data', action: 'list', params: {}, risk: 0 })
    expect(verdict.approve).toBe(true)
  })

  it('makePreExecReview：未传 risk 时自行按 (tool,action) 推断', async () => {
    const review = makePreExecReview()
    const verdict = await review({ tool: 'system.code', action: 'execute', params: {}, risk: 0 })
    expect(verdict.approve).toBe(false) // system.code 本就是 SYSTEM 级
  })

  it('开关可被 setPreReviewEnabled 翻转，并经 isPreReviewEnabled 读回', () => {
    setPreReviewEnabled(true)
    expect(isPreReviewEnabled()).toBe(true)
    setPreReviewEnabled(false)
    expect(isPreReviewEnabled()).toBe(false)
    // 复位，避免污染其它用例（模块级状态）
    setPreReviewEnabled(false)
  })
})
