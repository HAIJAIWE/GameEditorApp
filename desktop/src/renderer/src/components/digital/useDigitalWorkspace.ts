import { useCallback, useEffect, useState } from 'react'

import type { ChatApi } from './digitalPanelApi'

/**
 * 代码工作区数据 hook（对齐 dsh fs-sandbox 的 `cwd`）。
 *
 * 挂载读取当前根目录；`choose()` 弹主进程目录选择并设置（取消则不变）。
 * 测试/无 IPC 环境（api 缺方法）时静默跳过。
 */
export function useDigitalWorkspace(api: ChatApi): { root: string; choose: () => void } {
  const [root, setRoot] = useState('')

  useEffect(() => {
    if (typeof api.getWorkspace !== 'function') return
    let cancelled = false
    void api
      .getWorkspace()
      .then((result) => {
        if (!cancelled) setRoot(result.root)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api])

  const choose = useCallback((): void => {
    if (typeof api.chooseWorkspace !== 'function') return
    void api
      .chooseWorkspace()
      .then((result) => {
        if (!result.cancelled) setRoot(result.root)
      })
      .catch(() => undefined)
  }, [api])

  return { root, choose }
}
