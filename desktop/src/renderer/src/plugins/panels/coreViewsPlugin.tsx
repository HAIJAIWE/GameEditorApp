import type { PluginManifest } from '../../../../shared/plugin/types'
import { BrowserPanel } from '../../components/browser'
import { CeshuHomePanel } from '../../components/ceshuDoc'
import { CeshuView } from '../../components/ceshuDoc'
import { CodePanel } from '../../components/browser'
import { DataEditorPanel } from '../../components/data'
import { TechDocPanel } from '../../components/techDoc/TechDocPanel'
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
    description: 'App 主区页签：策划书 / 数据 / 代码 / 浏览器',
    meta: {
      label: '主区视图',
      icon: '🗂️',
      description: '中间页签里的策划书、数据、代码与浏览器'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'editor.mainView',
        label: '策划书',
        title: '策划书编辑器（游戏设计文档：24 章 / AI 生成 / 校验评分）',
        order: 0,
        lazy: false,
        ui: { type: 'text', text: '策划书' }
      },
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
        id: 'techDoc.mainView',
        label: '技术设计',
        title: '技术设计文档（怎么实现：架构 / 模块 / 数据模型 / 接口 / 时序）',
        order: 20,
        lazy: true,
        ui: { type: 'text', text: '技术设计' }
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
