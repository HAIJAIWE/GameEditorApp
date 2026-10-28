import type { PluginManifest } from '../../../shared/plugin/types'
import BrowserPanel from '../components/BrowserPanel'
import CodePanel from '../components/CodePanel'
import DataEditorPanel from '../components/DataEditorPanel'
import { useMainViewContext } from './mainViewContext'
import { registerReactBinding } from './reactBindings'

/**
 * 主区视图插件化（Slice 22）。
 *
 * 先把**零 prop** 的「代码编辑」「浏览器」两个中间页签迁出 App，验证 `mainView` 能力通路；
 * 编辑器 / 数据页签仍由 App 以 `appTabs` 内联传给 `MainViewMount`（重视图，后续片再迁）。
 *
 * 绑定组件定义在模块级（不在工厂/渲染期新建），注册在工厂里由 builtins 调用一次。
 */

function CodeMainView() {
  return <CodePanel />
}

function BrowserMainView() {
  return <BrowserPanel />
}

/** 数据页签：4 个 props 从独立的 mainViewContext 取（不污染面板 appContext） */
function DataMainView() {
  const { types, gameStyle, onEditType, onShowReferences } = useMainViewContext()
  return (
    <DataEditorPanel
      types={types}
      gameStyle={gameStyle}
      onEditType={onEditType}
      onShowReferences={onShowReferences}
    />
  )
}

export function defineCoreViewsPlugin(): PluginManifest {
  registerReactBinding('code.mainView', CodeMainView)
  registerReactBinding('browser.mainView', BrowserMainView)
  registerReactBinding('data.mainView', DataMainView)

  return {
    id: 'core-views',
    name: 'core-views',
    version: '0.1.0',
    description: 'App 主区页签：代码编辑 / 内置浏览器',
    meta: {
      label: '主区视图',
      icon: '🗂️',
      description: '中间页签里的代码编辑与浏览器'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'data.mainView',
        label: '数据编辑',
        title: '数据编辑器（角色/怪物/技能等纯数据，直连 SQLite）',
        order: 10,
        lazy: true,
        ui: { type: 'text', text: '数据编辑' }
      },
      {
        kind: 'mainView',
        id: 'code.mainView',
        label: '代码编辑',
        title: '代码查看（只读）',
        order: 30,
        lazy: true,
        ui: { type: 'text', text: '代码编辑' }
      },
      {
        kind: 'mainView',
        id: 'browser.mainView',
        label: '浏览器',
        title: '内置浏览器（预览 Demo / 查资料）',
        order: 40,
        lazy: true,
        ui: { type: 'text', text: '浏览器' }
      }
    ]
  }
}
