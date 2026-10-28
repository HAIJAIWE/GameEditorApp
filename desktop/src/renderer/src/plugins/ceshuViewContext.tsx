import { createContext, useContext, type ReactNode } from 'react'

import type { CeshuDocument } from '../../../shared/ceshuConstants'
import type { DataTypeDef } from '../../../shared/types'

/**
 * 编辑器（CeshuView）向**内部视图**下发的上下文。
 *
 * 为什么需要它：挂载在编辑器上的 view（开发路线 / 体检 / 影响面 / 版本对比 / 时间线…）需要
 * **当前文档**与编辑器级能力（类型列表、切换版本），而这些都是 CeshuView 的 state / props，
 * 不在宿主里。view 又不能走 `panel` 的打开参数（`doc` 是活对象、每次编辑都变），
 * 故由 `ViewMount` 把上下文放进 context，绑定组件用 `useCeshuView()` 取——
 * 与 `useAppContext()` 同一思路，只是作用域在编辑器内。
 */
export const CESHU_VIEW_MOUNT = 'ceshu.overlay'
export const CESHU_CONTENT_MOUNT = 'ceshu.content'

export interface CeshuViewContextValue {
  doc: CeshuDocument
  /** 全部数据类型定义（数据引用等视图需要） */
  types: readonly DataTypeDef[]
  /** 切换当前策划书（版本时间线「切到某版本」用；来自 App 的 handleOpenCeshu） */
  onSelect: (id: string) => void
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
