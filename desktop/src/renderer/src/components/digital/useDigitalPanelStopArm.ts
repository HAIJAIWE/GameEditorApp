import { useCallback, useRef, useState } from 'react'

import { toErrorMessage } from '../../../../shared/util/system'

/**
 * 「停止本轮」的两段式二次确认（对齐 dsh JobView 的两段式 kill：先 arm 再确认）。
 *
 * 第一次点只把按钮切到「再点一次确认」，3 秒内不点则自动解除；第二次点才真正取消本轮。
 * 只持有确认态与定时器；`runId` 由调用方持有（发送时写入），这里只读它来精确定位本轮。
 */
export interface DigitalPanelStopArm {
  stopArmed: boolean
  /** 解除确认态并清掉定时器（新一轮发送时顺手调用，避免新按钮一出现就是红色警告） */
  disarm: () => void
  /** 停止按钮点击：第一次 arm（3 秒自动解除），第二次才真正取消本轮 */
  onStopClick: () => void
}

export function useDigitalPanelStopArm({
  activeRunId,
  setLocalError,
  setNotice
}: {
  /** 当前进行中那一轮的 runId（「停止」按钮据此精确取消） */
  activeRunId: { current: string | null }
  setLocalError: (message: string | null) => void
  setNotice: (message: string | null) => void
}): DigitalPanelStopArm {
  const [stopArmed, setStopArmed] = useState(false)
  const stopArmTimer = useRef<number | null>(null)
  const clearStopArm = useCallback((): void => {
    if (stopArmTimer.current !== null) {
      window.clearTimeout(stopArmTimer.current)
      stopArmTimer.current = null
    }
  }, [])

  const disarm = useCallback((): void => {
    clearStopArm()
    setStopArmed(false)
  }, [clearStopArm])

  /** 用户点「停止」：让循环优雅中止并保留已产出的部分结果 */
  const handleStop = useCallback((): void => {
    const runId = activeRunId.current
    setLocalError(null)
    // 走通用取消通道（对话循环与单发 AI 共用一条，见 `main/task/taskRegistry.ts`）
    void window.mbApi.task
      .cancel(runId === null ? {} : { taskId: runId })
      .then((result) => {
        if (!result.cancelled) setNotice('本轮已结束，无需停止')
      })
      .catch((error: unknown) => {
        setLocalError(toErrorMessage(error))
      })
  }, [activeRunId, setLocalError, setNotice])

  /** 停止按钮点击：第一次 arm（3 秒自动解除），第二次才真正取消本轮 */
  const onStopClick = useCallback((): void => {
    if (stopArmed) {
      clearStopArm()
      setStopArmed(false)
      handleStop()
    } else {
      setStopArmed(true)
      clearStopArm()
      stopArmTimer.current = window.setTimeout(() => setStopArmed(false), 3000)
    }
  }, [stopArmed, clearStopArm, handleStop])

  return { stopArmed, disarm, onStopClick }
}
