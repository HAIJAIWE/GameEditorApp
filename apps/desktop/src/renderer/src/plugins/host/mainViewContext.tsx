import { createContext, useContext, type ReactNode } from 'react'

import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
import { PluginHost } from '@mobai/shared/plugin/host'
import type { DataTypeDef } from '@mobai/shared/types'
import type { PreviewJumpTarget } from '../../components/ceshu'
import type { ReferenceTarget } from '../../components/ceshuField'

/**
 * 主区视图共享状态（Slice 23/24）。
 *
 * 为什么**单独开一个 context**、不并进面板的 `appContext`：
 * - 面板的 `appContext` 刻意保持克制（types/跳转/撤销），避免膨胀成「第二个 App」；
 * - 主区视图（编辑器/数据）吃的是 App 的核心状态与动作，量更大；
 * - 拆成两个 context ⇒ 主区状态变化只重渲染主区视图，**不会连带所有面板重渲染**（性能隔离）。
 */
export interface MainViewContextValue {
  // —— 数据页签（Slice 23）——
  /** 全部数据类型定义（数据页签条目表单按 type 取 formFields） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（字段标签术语替换；'' = 原始术语） */
  gameStyle: string
  /** 打开「字段结构编辑器」编辑当前数据类型 */
  onEditType: (typeId: string) => void
  /** 打开「数据关联预览」查看某条目引用关系 */
  onShowReferences: (target: ReferenceTarget) => void

  // —— 编辑器页签（Slice 24）——
  /** 编辑器页签内：true=策划书首页（列表），false=具体某份策划书 */
  ceshuHomeVisible: boolean
  /** 策划书列表 */
  ceshuList: readonly CeshuSummary[]
  /** 当前打开的策划书 id */
  activeCeshuId: string | null
  /** 打开某份策划书 */
  onOpenCeshu: (id: string) => void
  /** 策划书列表发生变化后重新加载 */
  onReloadCeshuList: () => void
  /** 某份策划书被删除（清掉失效选中态） */
  onDeleteCeshu: (id: string) => void
  /** 打开策划书时回填活跃术语风格 */
  onGameStyleChange: (styleId: string) => void
  /** 编辑器返回策划书首页 */
  onBackToHome: () => void
  /** 跳转定位目标（透传给内嵌数据预览面板） */
  jumpTarget: PreviewJumpTarget | null
  /** 数据纪元（清空数据后递增，强制内嵌数据编辑器重挂载） */
  dataEpoch: number
  /** 类型 schema 被改动后刷新类型列表 */
  onTypesChanged: (next: DataTypeDef[]) => void
  /** 跳转已处理（清空 jumpTarget） */
  onJumpHandled: () => void
  /** 跳转未命中（目标类型未被启用系统覆盖） */
  onJumpMissed: (name: string) => void
  /** 插件宿主（编辑器内的 ViewMount / 面板入口需要） */
  host: PluginHost
}

/** 空实现：未提供 provider 时（如只测挂载器本体的单测）的安全默认 */
export const EMPTY_MAIN_VIEW_CONTEXT: MainViewContextValue = {
  types: [],
  gameStyle: '',
  onEditType: () => undefined,
  onShowReferences: () => undefined,
  ceshuHomeVisible: true,
  ceshuList: [],
  activeCeshuId: null,
  onOpenCeshu: () => undefined,
  onReloadCeshuList: () => undefined,
  onDeleteCeshu: () => undefined,
  onGameStyleChange: () => undefined,
  onBackToHome: () => undefined,
  jumpTarget: null,
  dataEpoch: 0,
  onTypesChanged: () => undefined,
  onJumpHandled: () => undefined,
  onJumpMissed: () => undefined,
  // 安全占位：真实调用方（App）一定注入真宿主；空宿主仅供未提供 provider 的单测兜底
  host: new PluginHost()
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
