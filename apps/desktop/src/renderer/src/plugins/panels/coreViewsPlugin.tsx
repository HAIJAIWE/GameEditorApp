import type { PluginManifest } from '@mobai/shared/plugin/types'
import { translate } from '@mobai/shared/i18n'
import { BrowserPanel } from '../../components/browser'
import { CeshuHomePanel } from '../../components/ceshuDoc'
import { CeshuView } from '../../components/ceshuDoc'
import { CodePanel } from '../../components/browser'
import { DataEditorPanel } from '../../components/data'
import { TechDocPanel } from '../../components/techDoc/TechDocPanel'
import { getLocalePreference } from '../../localePreference'
import { useMainViewContext } from '../host'
import { registerReactBinding } from '../host'

/**
 * 主区视图插件化（Slice 22–24）。
 *
 * 中间页签（策划书/数据/代码/浏览器）全部由 `mainView` 能力提供，App 不再内联渲染任何页签内容。
 * 重视图（编辑器/数据）的 props 从独立的 `mainViewContext` 取，与面板 `appContext` 隔离。
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

/**
 * 编辑器页签（Slice 24）：策划书首页 ↔ 具体策划书由 `ceshuHomeVisible` 决定。
 * 常驻挂载（lazy:false）⇒ 切到别的页签再切回，CeshuView 不卸载、草稿/滚动/选中态都不丢。
 */
function EditorMainView() {
  const ctx = useMainViewContext()
  if (ctx.ceshuHomeVisible) {
    return (
      <CeshuHomePanel
        summaries={[...ctx.ceshuList]}
        activeId={ctx.activeCeshuId}
        onOpen={ctx.onOpenCeshu}
        onChanged={ctx.onReloadCeshuList}
        onDeleted={ctx.onDeleteCeshu}
      />
    )
  }
  return (
    <CeshuView
      ceshuId={ctx.activeCeshuId}
      onChanged={ctx.onReloadCeshuList}
      onSelect={ctx.onOpenCeshu}
      onGameStyleChange={ctx.onGameStyleChange}
      types={ctx.types}
      gameStyle={ctx.gameStyle}
      onBack={ctx.onBackToHome}
      jumpTarget={ctx.jumpTarget}
      dataEpoch={ctx.dataEpoch}
      onEditType={ctx.onEditType}
      onTypesChanged={ctx.onTypesChanged}
      onShowReferences={ctx.onShowReferences}
      onJumpHandled={ctx.onJumpHandled}
      onJumpMissed={ctx.onJumpMissed}
      host={ctx.host}
    />
  )
}

export function defineCoreViewsPlugin(): PluginManifest {
  registerReactBinding('editor.mainView', EditorMainView)
  registerReactBinding('data.mainView', DataMainView)
  registerReactBinding('techDoc.mainView', TechDocPanel)
  registerReactBinding('code.mainView', CodeMainView)
  registerReactBinding('browser.mainView', BrowserMainView)

  return {
    id: 'core-views',
    name: 'core-views',
    version: '0.1.0',
    description: 'App main-view tabs: design docs / data / code / browser',
    meta: {
      labelKey: 'coreViews.metaLabel',
      icon: '🗂️',
      descriptionKey: 'coreViews.metaDescription'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'editor.mainView',
        labelKey: 'view.ceshu',
        titleKey: 'view.ceshu.title',
        order: 0,
        lazy: false,
        ui: { type: 'text', text: translate(getLocalePreference(), 'view.ceshu') }
      },
      {
        kind: 'mainView',
        id: 'data.mainView',
        labelKey: 'view.data',
        titleKey: 'view.data.title',
        order: 10,
        lazy: true,
        ui: { type: 'text', text: translate(getLocalePreference(), 'view.data') }
      },
      {
        kind: 'mainView',
        id: 'techDoc.mainView',
        labelKey: 'view.techDoc',
        titleKey: 'view.techDoc.title',
        order: 20,
        lazy: true,
        ui: { type: 'text', text: translate(getLocalePreference(), 'view.techDoc') }
      },
      {
        kind: 'mainView',
        id: 'code.mainView',
        labelKey: 'view.code',
        titleKey: 'view.code.title',
        order: 30,
        lazy: true,
        ui: { type: 'text', text: translate(getLocalePreference(), 'view.code') }
      },
      {
        kind: 'mainView',
        id: 'browser.mainView',
        labelKey: 'view.browser',
        titleKey: 'view.browser.title',
        order: 40,
        lazy: true,
        ui: { type: 'text', text: translate(getLocalePreference(), 'view.browser') }
      }
    ]
  }
}
