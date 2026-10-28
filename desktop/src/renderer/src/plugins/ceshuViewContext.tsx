import { createContext, useContext, type ReactNode } from 'react'

import type { CeshuDocument } from '../../../shared/ceshuConstants'

/**
 * 编辑器（CeshuView）向**内部视图**下发的上下文。
 *
 * 为什么需要它：挂载在 `ceshu.overlay` 上的 view（开发路线 / 体检 / 影响面）需要**当前文档**，
 * 而文档是 CeshuView 的 state，不在宿主里。view 又不能走 `panel` 的打开参数
 * （`doc` 是活对象、每次编辑都变），故由 `ViewMount` 把 `doc` 放进 context，
 * 绑定组件用 `useCeshuView()` 取——与 `useAppContext()` 同一思路，只是作用域在编辑器内。
 */
/**
 * 编辑器内视图的挂载点名（Slice 11）。
 * 由 `CeshuView` 用 `<ViewMount mount={CESHU_VIEW_MOUNT} …>` 挂载，插件侧把 view 声明到这个挂载点。
 * 放在这里（而非插件里）是为了让「宿主」与「插件」都引用同一常量、且 CeshuView 不必 import 插件模块。
 */
export const CESHU_VIEW_MOUNT = 'ceshu.overlay'

export interface CeshuViewContextValue {
  doc: CeshuDocument
}

const CeshuViewContext = createContext<CeshuViewContextValue | null>(null)

export function CeshuViewProvider({
  value,
  children
}: {
  value: CeshuViewContextValue
  children: ReactNode
}) {
  return <CeshuViewContext.Provider value={value}>{children}</CeshuViewContext.Provider>
}

export function useCeshuView(): CeshuViewContextValue {
  const ctx = useContext(CeshuViewContext)
  if (ctx === null) {
    throw new Error('useCeshuView 必须在 ViewMount 子树内使用')
  }
  return ctx
}
