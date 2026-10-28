import { createContext, useContext, type ReactNode } from 'react'

import type { DataTypeDef } from '../../../shared/types'
import type { ReferenceTarget } from '../components/ReferencesPanel'

/**
 * 主区视图共享状态（Slice 23）。
 *
 * 为什么**单独开一个 context**、不并进面板的 `appContext`：
 * - 面板的 `appContext` 刻意保持克制（types/跳转/撤销），避免膨胀成「第二个 App」；
 * - 主区视图（编辑器/数据/数字员工）吃的是 App 的核心状态与动作，量更大；
 * - 拆成两个 context ⇒ 主区状态变化只重渲染主区视图，**不会连带所有面板重渲染**（性能隔离）。
 *
 * 范围按需增长：本片只放「数据」页签需要的 4 项，后续迁编辑器/数字员工再补。
 */
export interface MainViewContextValue {
  /** 全部数据类型定义（数据页签条目表单按 type 取 formFields） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（字段标签术语替换；'' = 原始术语） */
  gameStyle: string
  /** 打开「字段结构编辑器」编辑当前数据类型 */
  onEditType: (typeId: string) => void
  /** 打开「数据关联预览」查看某条目引用关系 */
  onShowReferences: (target: ReferenceTarget) => void
}

/** 空实现：未提供 provider 时（如只测挂载器本体的单测）的安全默认 */
export const EMPTY_MAIN_VIEW_CONTEXT: MainViewContextValue = {
  types: [],
  gameStyle: '',
  onEditType: () => undefined,
  onShowReferences: () => undefined
}

const MainViewContext = createContext<MainViewContextValue | null>(null)

export function MainViewProvider({ value, children }: {
  value: MainViewContextValue
  children: ReactNode
}) {
  return <MainViewContext.Provider value={value}>{children}</MainViewContext.Provider>
}

/** 取主区共享状态；必须在 `<MainViewProvider>` 内调用（缺失即抛错，避免静默拿空数据）。 */
export function useMainViewContext(): MainViewContextValue {
  const ctx = useContext(MainViewContext)
  if (ctx === null) throw new Error('useMainViewContext 必须在 <MainViewProvider> 内使用')
  return ctx
}
