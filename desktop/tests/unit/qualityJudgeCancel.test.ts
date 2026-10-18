import { afterEach, describe, expect, it, vi } from 'vitest'

import { LlmClient } from '../../src/main/llm/client'
import { runLlmJudge } from '../../src/main/agent/qualityJudge'
import type { LlmCallOptions } from '../../src/main/llm/client'

/**
 * `runLlmJudge` 的**取消 vs 降级**守卫（main 层，此前无直接覆盖）。
 *
 * ## 为什么必须有测试（铁律：安全字段要有用例证明「它真的在拦」）
 * judge 是**辅助**维度，业务失败（网络/解析/超时）必须降级为 `null`、绝不阻断正文生成
 * —— 但**取消不是业务失败**。用户点「停止」后若被吞成 `null`，整次生成会显示「成功」，
 * 而判官这步最长可占满 180s 超时窗口 ⇒ 正文白跑、停止按钮失灵。
 * 故 `AbortError` 必须**向上抛**，由单发 harness 如实报「已停止」。
 *
 * 这三条用例分别钉住：取消会抛、业务失败会降级、未配置不调模型。
 */

const configuredOpts = { config: { provider: 'ollama' } } as unknown as LlmCallOptions

function abortError(): Error {
  const err = new Error('The operation was aborted')
  err.name = 'AbortError'
  return err
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runLlmJudge：取消必须抛、业务失败才降级', () => {
  it('AbortError ⇒ 向上抛（不吞成 null）：点「停止」要如实报已停止', async () => {
    const spy = vi.spyOn(LlmClient.prototype, 'generate').mockRejectedValue(abortError())
    await expect(runLlmJudge(configuredOpts, 'meta', { a: 1 })).rejects.toThrow('aborted')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('取消时 signal 真正下传到 generate（否则这条路径根本不会 abort）', async () => {
    const controller = new AbortController()
    const spy = vi.spyOn(LlmClient.prototype, 'generate').mockRejectedValue(abortError())
    await expect(runLlmJudge(configuredOpts, 'meta', {}, controller.signal)).rejects.toThrow()
    // 第三参即 generate 的 opts，须携带同一个 signal
    const passedOpts = spy.mock.calls[0]?.[2] as { signal?: AbortSignal } | undefined
    expect(passedOpts?.signal).toBe(controller.signal)
  })

  it('业务失败（网络错误）⇒ 降级 null，绝不阻断正文生成', async () => {
    vi.spyOn(LlmClient.prototype, 'generate').mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(runLlmJudge(configuredOpts, 'meta', { a: 1 })).resolves.toBeNull()
  })

  it('未配置（config undefined）⇒ 直接 null，且不发起任何模型调用', async () => {
    const spy = vi.spyOn(LlmClient.prototype, 'generate')
    await expect(runLlmJudge({} as LlmCallOptions, 'meta', { a: 1 })).resolves.toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('合法 judge JSON ⇒ 返回规整 verdict（回归：加 signal 没破坏主路径）', async () => {
    vi.spyOn(LlmClient.prototype, 'generate').mockResolvedValue({
      model: 'test-model',
      content: JSON.stringify({ toxicity: 'safe', readability: 8, creativity: 7, score: 80, comment: '通顺' })
    })
    const verdict = await runLlmJudge(configuredOpts, 'meta', { a: 1 })
    expect(verdict).toMatchObject({ toxicity: 'safe', readability: 8, creativity: 7, score: 80 })
  })
})