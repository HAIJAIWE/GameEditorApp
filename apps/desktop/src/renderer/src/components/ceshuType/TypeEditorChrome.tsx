import type { DataTypeDef } from '@mobai/shared/types'

/**
 * 字段结构编辑器的两处「外框」：左侧类型列表 + 顶部动作条。
 *
 * 从 `TypeEditorPanel.tsx` 原样抽出。两者都只吃「当前选中 / 是否保存中」这类展示态，
 * 点击一律回调给父组件 —— 编辑器的草稿状态（draft / selectedId / saving）仍只在父组件里。
 *
 * ⚠️ className / data-testid 逐字保留（`te-new-type` / `te-type-tab` / `te-reset` /
 * `te-save` / `te-close` 都被 e2e 与单测直接命中）；根元素仍是原来的
 * `<aside className="te-side">` 与 `<div className="changelog-header">`，不包额外 div。
 */

/** 左栏：数据类型列表（点选切换编辑对象，末尾「新建类型」追加一份草稿） */
export function TypeSideList({
  draft,
  selectedId,
  onSelect,
  onAddType
}: {
  /** 草稿里的全部类型（未保存也算，列表长度即显示条数） */
  draft: DataTypeDef[]
  selectedId: string
  onSelect: (id: string) => void
  onAddType: () => void
}) {
  return (
    <aside className="te-side">
      <div className="form-label">数据类型（{draft.length}）</div>
      <button type="button" className="btn" data-testid="te-new-type" onClick={onAddType}>
        新建类型
      </button>
      <div className="te-type-list">
        {draft.map((def, index) => (
          <button
            key={index}
            type="button"
            className={`type-tab${def.id === selectedId ? ' active' : ''}`}
            data-testid="te-type-tab"
            onClick={() => onSelect(def.id)}
          >
            <span className="type-dot" style={{ background: def.color || '#607D8B' }} />
            <span className="item-name">{def.name || def.id || '未命名类型'}</span>
            <span className="item-meta">{def.formFields.length} 字段</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

/** 顶部动作条：标题 + 重置 / 保存结构 / 关闭 */
export function TypeEditorHeader({
  saving,
  canSave,
  onReset,
  onSave,
  onClose
}: {
  /** 保存中：三个按钮全部禁用，避免重复提交 */
  saving: boolean
  /** 有选中类型才可保存（无选中时保存没有对象） */
  canSave: boolean
  onReset: () => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div className="changelog-header">
      <span className="chapter-form-title">字段结构编辑器</span>
      <div className="editor-actions">
        <button type="button" className="btn" data-testid="te-reset" disabled={saving} onClick={onReset}>
          重置
        </button>
        <button
          type="button"
          className="btn primary"
          data-testid="te-save"
          disabled={saving || !canSave}
          onClick={onSave}
        >
          保存结构
        </button>
        <button type="button" className="btn" data-testid="te-close" disabled={saving} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
