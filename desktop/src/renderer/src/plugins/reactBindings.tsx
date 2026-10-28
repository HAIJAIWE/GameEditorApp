import type { ComponentType } from 'react'

import type { PluginPanelCapability, PluginViewCapability, UiNode } from '../../../shared/plugin/types'

/**
 * React 绑定层（宿主相关，不进共享契约）。
 *
 * dsh 把「注册（cordis，宿主无关）」和「UI 模块（dsh.client，客户端相关）」分开；这里同理：
 * 插件在 `PluginManifest` 里只声明 `ui`（可序列化），**富 React 组件作为可选绑定**在此注册。
 * React 宿主渲染面板时优先用绑定，缺失则回退到 `renderUiNode` 画声明式 UI——
 * 这样同一份 manifest 既能跑在富 React 主机，也能跑在只认 `UiNode` 的 CLI / 引擎宿主。
 */

/**
 * React 绑定收到的 props（宿主侧约定，**不进共享契约**）。
 * - `onClose`：面板生命周期契约，由宿主下发；
 * - `params`：`host.openPanel(id, params)` 的打开参数，契约层是 `unknown`，
 *   绑定自行断言成业务类型（如 `ReferenceTarget`）——类型安全留在渲染层，契约保持宿主无关。
 */
export interface PanelBindingProps {
  onClose: () => void
  params?: unknown
}

/** panel id → React 组件（可选绑定；非 React 宿主忽略此表） */
const reactPluginBindings = new Map<string, ComponentType<PanelBindingProps>>()

export function registerReactBinding(id: string, component: ComponentType<PanelBindingProps>): void {
  reactPluginBindings.set(id, component)
}

export function getReactBinding(id: string): ComponentType<PanelBindingProps> | undefined {
  return reactPluginBindings.get(id)
}

/** 取面板/视图的声明式 UI（支持惰性函数形式） */
export function uiOf(cap: PluginPanelCapability | PluginViewCapability): UiNode {
  return typeof cap.ui === 'function' ? cap.ui() : cap.ui
}

/**
 * 把 `UiNode` 画成 React（最低公共分母渲染器）。任何宿主照此实现几十行即可对接契约。
 * `onAction` 在按钮带 `action` 时被调用（传入 command 能力 id），由调用方决定如何派发。
 */
export function renderUiNode(node: UiNode, onAction: (id: string) => void) {
  switch (node.type) {
    case 'text':
      return <p key={node.text}>{node.text}</p>
    case 'button':
      return (
        <button
          type="button"
          className="btn"
          key={node.label}
          onClick={() => {
            if (node.action !== undefined) onAction(node.action)
          }}
        >
          {node.label}
        </button>
      )
    case 'input':
      return (
        <label key={node.name} className="plugin-input">
          {node.label !== undefined ? `${node.label}：` : ''}
          <input name={node.name} defaultValue={node.value} />
        </label>
      )
    case 'container':
      return (
        <div key="container" className="plugin-ui-container">
          {node.children.map((child, index) => (
            <span key={index}>{renderUiNode(child, onAction)}</span>
          ))}
        </div>
      )
  }
}
