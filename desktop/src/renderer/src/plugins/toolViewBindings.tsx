import type { ReactNode } from 'react'

import type { DigitalStep } from '../../../shared/agent/panel'

/**
 * 工具视图的 React 绑定层（P2 keyed slot）。
 *
 * 契约里 `PluginToolViewCapability` 只声明「哪个插件为哪个工具提供视图」（可序列化）；
 * 真正的 React 组件在此按**能力 id** 注册——与 panel/view/mainView 的
 * `registerReactBinding` 同一套原则：契约宿主无关，富 UI 绑定外置。
 *
 * 解析链：`DigitalPanel` 拿 `pluginHost.toolViews()` 找到 `tool` 对应的能力 →
 * `getToolViewBinding(capability.id)` 取渲染器 → 交给执行步骤卡片。
 * 未注册（或非 React 宿主）时回退到内置 text/code/json 视图。
 */
export type ToolViewRender = (step: DigitalStep) => ReactNode

const bindings = new Map<string, ToolViewRender>()

export function registerToolViewBinding(id: string, render: ToolViewRender): void {
  bindings.set(id, render)
}

export function getToolViewBinding(id: string): ToolViewRender | undefined {
  return bindings.get(id)
}
