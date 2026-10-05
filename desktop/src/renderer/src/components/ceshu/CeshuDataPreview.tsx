import { useState } from 'react'

import type { EnabledEditor } from '../../../../shared/ceshuConstants'
import type { DataTypeDef } from '../../../../shared/types'

import DataEditorTab from '../DataEditorTab'

interface CeshuDataPreviewProps {
  /** 由策划书 systems 派生的启用编辑器（computeEnabledEditors 的输出） */
  enabledEditors: readonly EnabledEditor[]
  /** 全部数据类型定义（下发给 DataEditorTab 渲染条目表单） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（透传给条目表单的字段标签术语替换） */
  gameStyle?: string
  /** 空状态「去勾选游戏系统」按钮回调（跳到第五章） */
  onGotoSystems?: () => void
  /** 任一数据编辑器发生数据变更后的回调 */
  onDataChanged?: () => void
}

/** 空状态引导文案（对齐 PyQt preview_panel.py:55-63；配合 CSS white-space: pre-line 渲染换行） */
const EMPTY_HINT =
  '设计游戏数据前，先启用游戏系统\n\n' +
  '数据编辑器由策划书驱动：在左侧「第五章·游戏系统设计」\n' +
  '勾选要做的系统后，对应的数据编辑器就会出现在这里。'

/**
 * 策划书内嵌数据预览面板（对齐 PyQt `ui/ceshu/preview_panel.py::EditorPreviewPanel`）。
 *
 * 顶部标签行：每个启用的游戏系统一个标签（标签文字 = 系统显示名，指向其 data_type 数据编辑器），
 * 末尾固定一个「📊 数据引用」标签；无启用系统时显示空状态引导。
 */
export default function CeshuDataPreview({
  enabledEditors,
  types,
  gameStyle,
  onGotoSystems,
  onDataChanged
}: CeshuDataPreviewProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  /** 「📊 数据引用」标签是否选中（与系统标签互斥） */
  const [showRefs, setShowRefs] = useState(false)

  // 默认选中第一个启用系统；activeKey 失效（对应系统被取消启用）时由 `?? enabledEditors[0]`
  // 自动回退到第一个，无需额外 effect（effect 内同步 setState 会触发级联渲染，被 lint 禁止）
  const activeEditor = enabledEditors.find((editor) => editor.key === activeKey) ?? enabledEditors[0] ?? null
  const isEmpty = enabledEditors.length === 0

  return (
    <div className="ceshu-preview">
      <div className="ceshu-preview-tabs">
        {enabledEditors.map((editor) => (
          <button
            key={editor.key}
            type="button"
            data-testid="ceshu-preview-tab"
            className={`ceshu-preview-tab${!showRefs && activeEditor?.key === editor.key ? ' active' : ''}`}
            title={editor.data_type}
            onClick={() => {
              setActiveKey(editor.key)
              setShowRefs(false)
            }}
          >
            {editor.name}
          </button>
        ))}
        <button
          type="button"
          data-testid="ceshu-preview-refs"
          className={`ceshu-preview-tab${showRefs ? ' active' : ''}`}
          onClick={() => setShowRefs(true)}
        >
          📊 数据引用
        </button>
      </div>

      <div className="ceshu-preview-body">
        {isEmpty ? (
          <div className="ceshu-preview-empty">
            <div>{EMPTY_HINT}</div>
            <button
              type="button"
              className="btn"
              data-testid="ceshu-preview-goto-systems"
              title="跳转到第五章，勾选游戏系统后对应的数据编辑器会出现在这里"
              onClick={() => onGotoSystems?.()}
            >
              去「第五章·游戏系统设计」勾选
            </button>
          </div>
        ) : showRefs ? (
          <div className="empty">数据引用解析（@data[...]）尚未迁移到 TS 版，此标签页暂时为空。</div>
        ) : activeEditor ? (
          <DataEditorTab
            key={activeEditor.data_type}
            type={activeEditor.data_type}
            types={types}
            gameStyle={gameStyle}
            onDataChanged={onDataChanged}
          />
        ) : null}
      </div>
    </div>
  )
}
