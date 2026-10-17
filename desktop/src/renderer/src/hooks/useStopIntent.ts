import { useCallback, useRef } from 'react'

/**
 * 单发 AI 任务的「停止」意图。
 *
 * ## 为什么用本地意图，而不是识别错误文案
 * 主进程中断时抛的是 `TASK_CANCELLED_MESSAGE`，但**只有点过停止的那一次调用**才该按
 * 「已停止」展示：同一个错误也可能来自别处（上层取消整批、窗口关闭），一律吞掉就会把
 * 真错误静默掉。用 ref 记意图，既不触发重渲染，也不依赖错误文案的措辞。
 *
 * ## 为什么要连 `task:cancel` 一起发
 * 面板不需要知道 taskId：主进程按「该窗口当前活跃任务」兜底（见
 * `main/task/taskRegistry.ts`），所以面板上就一个按钮、一次调用。
 */
export interface StopIntent {
  /** 点「停止」时调用：标记意图 + 让主进程中断在途请求 */
  markStop: () => void
  /** 请求失败时问一句「是不是我刚点了停止」 */
  wasStopped: () => boolean
  /** 一次调用收尾时复位（放在 finally） */
  settle: () => void
}

export function useStopIntent(): StopIntent {
  const stopped = useRef(false)

  const markStop = useCallback((): void => {
    stopped.current = true
    // `cancelled: false` = 没有匹配的任务（已经结束了），不是错误，无需提示
    void window.mbApi.task.cancel({})
  }, [])

  const wasStopped = useCallback((): boolean => stopped.current, [])
  const settle = useCallback((): void => {
    stopped.current = false
  }, [])

  return { markStop, wasStopped, settle }
}
