import type { PluginManifest } from '../../../shared/plugin/types'
import BrowserPanel from '../components/BrowserPanel'
import CodePanel from '../components/CodePanel'
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

export function defineCoreViewsPlugin(): PluginManifest {
  registerReactBinding('code.mainView', CodeMainView)
  registerReactBinding('browser.mainView', BrowserMainView)

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
