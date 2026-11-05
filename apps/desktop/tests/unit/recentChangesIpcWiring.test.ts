import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `agent:recentChanges` 的**接线守卫**。
 *
 * 为什么用读源码的方式：`toRecentChangeViews` 是纯函数，单测能证明它自己正确，
 * 却证明不了 IPC handler 真的调了它 —— TypeScript 结构类型允许把 `OperationRecord[]`
 * （`RecentChangeView` 的超集）直接赋给契约，忘了投影照样 tsc 全绿、密钥照样外泄。
 *
 * 又为什么不用 e2e：操作日志只在**真实 chat 轮次**里记（`operationRecorder` 要求
 * context 带 sessionId），`agent:executeTool` 传的是 `{}`，造不出记录；
 * 让 e2e 跑一轮带数据改动的 AI 对话需要 mock 模型，成本远大于这条守卫。
 */
const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')
const AGENT_IPC = join(REPO_ROOT, 'apps/desktop/src/main/ipc/agentIpc.ts')

describe('agent:recentChanges 出口必须做展示投影', () => {
  it('handler 用 toRecentChangeViews 包住取数，不直接下发 OperationRecord', () => {
    const src = readFileSync(AGENT_IPC, 'utf8')
    const start = src.indexOf("handle('agent:recentChanges'")
    expect(start, '找不到 agent:recentChanges handler').toBeGreaterThan(-1)
    const next = src.indexOf("handle('agent:deliveries'", start)
    const block = src.slice(start, next === -1 ? src.length : next)

    // 精确锁定：投影函数必须包住取数调用，而不是在旁边摆着没用
    expect(block).toMatch(/toRecentChangeViews\(\s*agentOperationLog\.listRecentFiltered/u)
    // 不能把原始记录直接塞进 changes（那会连回滚快照一起下发）
    expect(block).not.toMatch(/changes:\s*agentOperationLog\.listRecentFiltered/u)
  })
})
