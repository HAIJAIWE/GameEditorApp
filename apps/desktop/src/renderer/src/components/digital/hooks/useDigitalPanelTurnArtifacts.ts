import { useCallback, useEffect, useRef, useState } from 'react'

import type { OperationRecord } from '@mobai/shared/agent/observability'
import type { DeliveryRecord } from '@mobai/shared/agent/observability'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
import type { ChatApi } from '../api/digitalPanelApi'

/**
 * 「本轮产物」簇：运行结束后一次性拉取本轮的改动（操作日志）与交付文件（交付日志）。
 *
 * **不做轮询**：只在 `done` 之后按发送时记下的 `since` 拉一次，供对话流内联改动卡 / 交付卡。
 * 拉取失败静默降级——改动卡不出现即可，绝不能因为「查日志失败」打断对话。
 */
export interface DigitalPanelTurnArtifacts {
  changes: OperationRecord[]
  deliveries: DeliveryRecord[]
  /** 新一轮发送：重置锚点与上一轮结果，避免运行中看到旧卡 */
  beginTurn: () => void
  /** 新建对话：只清展示，不动锚点（下一次发送会覆盖） */
  reset: () => void
}

export function useDigitalPanelTurnArtifacts({
  status,
  api
}: {
  status: DigitalPanelState['status']
  api: ChatApi
}): DigitalPanelTurnArtifacts {
  const [changes, setChanges] = useState<OperationRecord[]>([])
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([])
  /** 本轮开始时间（`since` 过滤锚点）。只读不触发渲染，故用 ref 而非 state */
  const startedAt = useRef<number | null>(null)

  /**
   * 本轮结束（`done`）后拉「本轮改动」：`since` 取发送时记下的开始时间。
   *
   * effect 内**不能同步 setState**（`react-hooks/set-state-in-effect`），故先 await 再 set。
   * 拉取失败静默降级：改动卡不出现即可，绝不能因为「查日志失败」打断对话。
   */
  useEffect(() => {
    if (status !== 'done') return
    const since = startedAt.current
    if (since === null) return
    let cancelled = false
    void (async () => {
      try {
        const [changesRes, deliveriesRes] = await Promise.all([
          api.recentChanges({ limit: 50, since }),
          api.deliveries({ limit: 50, since })
        ])
        if (!cancelled) {
          setChanges(changesRes.changes)
          setDeliveries(deliveriesRes.deliveries)
        }
      } catch (error: unknown) {
        console.warn('读取本轮改动/交付失败（不影响对话）：', error)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status, api])

  const beginTurn = useCallback((): void => {
    startedAt.current = Date.now()
    setChanges([])
    setDeliveries([])
  }, [])

  const reset = useCallback((): void => {
    setChanges([])
    setDeliveries([])
  }, [])

  return { changes, deliveries, beginTurn, reset }
}
