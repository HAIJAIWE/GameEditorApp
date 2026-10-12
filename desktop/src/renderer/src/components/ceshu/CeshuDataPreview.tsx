import { useEffect, useState } from 'react'

import { CHAPTER_LABELS } from '../../../../shared/ceshuConstants'
import type { CeshuChapters, EnabledEditor } from '../../../../shared/ceshuConstants'
import { findCountConstraint } from '../../../../shared/util/dataCountConstraint'
import type { DataTypeDef } from '../../../../shared/types'

import DataEditorTab from '../DataEditorTab'
import CeshuDataRefsPanel from './CeshuDataRefsPanel'

/** 跳转目标（由「高级搜索 / 引用关系」的 onJump 触发；nonce 递增以支持重复跳转同一类型） */
export interface PreviewJumpTarget {
  type: string
  itemId: string
  name: string
  nonce: number
}

interface CeshuDataPreviewProps {
  /** 由策划书 systems 派生的启用编辑器（computeEnabledEditors 的输出） */
  enabledEditors: readonly EnabledEditor[]
  /** 全部数据类型定义（下发给 DataEditorTab 渲染条目表单） */
  types: readonly DataTypeDef[]
  /** 整本策划书章节数据（本面板内嵌「📊 数据引用」概览据此解析 `@data[...]`；宿主直接传 doc） */
  chapters: CeshuChapters | null
  /** 活跃术语风格 id（透传给条目表单的字段标签术语替换） */
  gameStyle?: string
  /**
   * 数据纪元（`CeshuView` 透传；App 在「清空所有数据」成功后递增）。
   * 并入 `DataEditorTab` 的 key → 强制重挂载 → 重新 `listItems`，
   * 避免条目页签继续列着已被清空的条目（对齐 PyQt `clear_all_data` 的 `_refresh_all_tabs()`）。
   */
  dataEpoch?: number
  /** 空状态「去勾选游戏系统」按钮回调（跳到第四章） */
  onGotoSystems?: () => void
  /** 任一数据编辑器发生数据变更后的回调 */
  onDataChanged?: () => void
  /** 外部跳转目标：命中启用编辑器时定位到对应条目标签页 */
  jumpTarget?: PreviewJumpTarget | null
  /** 打开「字段结构编辑器」编辑指定类型（透传给条目表单的「更多 ▸」） */
  onEditType?: (typeId: string) => void
  /** 打开「数据关联预览」查看某条目引用关系（透传给条目表单的「更多 ▸」） */
  onShowReferences?: (target: { type: string; id: string; name: string }) => void
  /** 打开「AI 数据生成」面板（透传给条目表单；typeId = 当前条目类型，用于预选） */
  onAiGenerate?: (typeId: string) => void
  /** 跳转已处理（用户点击任意标签页，或目标未命中被驳回）——宿主据此清空 jumpTarget */
  onJumpHandled?: () => void
  /** 跳转目标所属类型不在当前启用编辑器中（未命中）——宿主据此给出提示 */
  onJumpMissed?: (name: string) => void
}

/**
 * 空状态引导文案（对齐 PyQt preview_panel.py:55-63；配合 CSS white-space: pre-line 渲染换行）。
 * 章号**一律引用 `CHAPTER_LABELS`**：此处曾硬编码 systems 的旧章号（分区重组前它是第五章、
 * 现为第四章），而 typecheck / eslint / vitest 全绿也抓不到——没有任何断言读它，只能靠截图发现
 * ⇒ 现由 `ceshuChapterLabelDrift.test.ts` 守卫。
 */
const EMPTY_HINT =
  '设计游戏数据前，先启用游戏系统\n\n' +
  `数据编辑器由策划书驱动：在左侧「${CHAPTER_LABELS.systems}」\n` +
  '勾选要做的系统后，对应的数据编辑器就会出现在这里。'

/**
 * 策划书内嵌数据预览面板（对齐 PyQt `ui/ceshu/preview_panel.py::EditorPreviewPanel`）。
 *
 * 顶部标签行：每个启用的游戏系统一个标签（标签文字 = 系统显示名，指向其 data_type 数据编辑器），
 * 末尾固定一个「📊 数据引用」标签；无启用系统时显示空状态引导。
 *
 * 跳转联动（对齐 PyQt `main_window._goto_data_design` / `preview_panel.focus_first_editor`）：
 * 当宿主传入 `jumpTarget` 且其类型命中某个启用编辑器时，优先选中该编辑器的标签页，
 * 并把条目 id / nonce 透传给 DataEditorTab 完成定位；未命中则回调 `onJumpMissed` 交由宿主提示。
 */
export default function CeshuDataPreview({
  enabledEditors,
  types,
  chapters,
  gameStyle,
  dataEpoch = 0,
  onGotoSystems,
  onDataChanged,
  jumpTarget,
  onEditType,
  onShowReferences,
  onAiGenerate,
  onJumpHandled,
  onJumpMissed
}: CeshuDataPreviewProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  /** 「📊 数据引用」标签是否选中（与系统标签互斥） */
  const [showRefs, setShowRefs] = useState(false)

  // 跳转优先：命中的启用编辑器覆盖当前 activeKey；否则按 activeKey 选，最后回退第一个。
  const jumpEditor = jumpTarget ? enabledEditors.find((editor) => editor.data_type === jumpTarget.type) : undefined
  const activeEditor =
    jumpEditor ?? enabledEditors.find((editor) => editor.key === activeKey) ?? enabledEditors[0] ?? null
  const isEmpty = enabledEditors.length === 0

  // 跳转未命中（目标类型未被任何启用系统覆盖）：提示宿主并清空目标。
  // 仅在 effect 内调用宿主回调（不在渲染期产生副作用）；jumpTarget 被清空后本次 effect 自然不再触发。
  useEffect(() => {
    if (!jumpTarget) return
    const hit = enabledEditors.some((editor) => editor.data_type === jumpTarget.type)
    if (!hit) {
      onJumpMissed?.(jumpTarget.name)
      onJumpHandled?.()
    }
  }, [jumpTarget, enabledEditors, onJumpMissed, onJumpHandled])

  /** 命中跳转时，向 DataEditorTab 下发定位参数（用 nonce 参与 key 以支持重复跳转同一类型重挂载） */
  const jumping = jumpEditor !== undefined && activeEditor?.key === jumpEditor.key
  const targetNonce = jumping ? jumpTarget?.nonce : undefined
  const initialSelectedId = jumping ? jumpTarget?.itemId : undefined

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
              onJumpHandled?.()
            }}
          >
            {editor.name}
          </button>
        ))}
        <button
          type="button"
          data-testid="ceshu-preview-refs"
          className={`ceshu-preview-tab${showRefs ? ' active' : ''}`}
          onClick={() => {
            setShowRefs(true)
            onJumpHandled?.()
          }}
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
              title={`跳转到${CHAPTER_LABELS.systems}，勾选游戏系统后对应的数据编辑器会出现在这里`}
              onClick={() => onGotoSystems?.()}
            >
              去「{CHAPTER_LABELS.systems}」勾选
            </button>
          </div>
        ) : showRefs ? (
          <CeshuDataRefsPanel chapters={chapters} types={types} />
        ) : activeEditor ? (
          <DataEditorTab
            key={`${activeEditor.data_type}:${targetNonce ?? ''}:${dataEpoch}`}
            type={activeEditor.data_type}
            types={types}
            gameStyle={gameStyle}
            onDataChanged={onDataChanged}
            initialSelectedId={initialSelectedId}
            targetNonce={targetNonce}
            onEditType={onEditType}
            onShowReferences={onShowReferences}
            onAiGenerate={onAiGenerate}
            countConstraint={findCountConstraint(chapters?.systems, activeEditor.data_type)}
          />
        ) : null}
      </div>
    </div>
  )
}
