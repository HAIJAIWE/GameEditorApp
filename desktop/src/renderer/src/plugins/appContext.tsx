import { createContext, useContext, type ReactNode } from 'react'

import type { DataTypeDef } from '../../../shared/types'

/**
 * 应用级共享状态（宿主注入，面板自供给）。
 *
 * 深层插件化（B 方案）的解耦件：面板不再由 App 以 props 逐个下发业务数据，
 * 而是经 `useAppContext()` 自行取用。这样面板（无论原生还是插件）走同一数据通道，
 * App 不再持有「哪个面板需要哪些 prop」的硬编码清单。
 *
 * 范围克制：只放被多个面板共用的稳定动作/数据（types / 跳转 / 撤销刷新）。
 * 面板专属打开参数（如引用面板的目标条目）走 `host.openPanel(id, params)` / `setPanelParams`
 * 由宿主携带（Slice 3 已落地），不塞进这个共享 context，避免它膨胀成第二个 App。
 */
export interface AppContextValue {
  /** 当前全部数据类型定义（编辑态） */
  types: DataTypeDef[]
  /** 替换数据类型定义（字段结构编辑器保存后回写） */
  setTypes: (next: DataTypeDef[]) => void
  /** 跳转到某个条目（高级搜索 / 引用 / 关系图共用） */
  handleJump: (type: string, itemId: string, name: string) => void
  /** 触发撤销栈刷新（备份恢复等破坏性操作后） */
  refreshUndo: () => void
  /**
   * 整库数据被清空后的收尾（刷新数据版本 + 顶部提示 + 关浮层 + 刷撤销栈）。
   * 与 `refreshUndo` 的区别：`refreshUndo` 只是「刷新撤销可用性」，这个是「数据没了，整套视图要重置」。
   */
  handleDataCleared: (deleted: number) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppContextProvider({ value, children }: {
  value: AppContextValue
  children: ReactNode
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** 取应用级共享状态；必须在 `<AppContextProvider>` 内调用（缺失即抛错，避免静默拿到空数据）。 */
export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (ctx === null) throw new Error('useAppContext 必须在 <AppContextProvider> 内使用')
  return ctx
}
