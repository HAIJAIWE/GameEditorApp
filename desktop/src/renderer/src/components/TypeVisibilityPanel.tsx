import { useState } from 'react'

import type { DataTypeDef } from '../../../shared/types'
import { resolveVisibilityResult } from '../../../shared/visibleTypes'

/**
 * 显示类型选择面板 —— 迁移自 Python `ui/dialogs/type_visibility_dialog.py`
 * 的 `TypeVisibilityDialog`。
 *
 * 作用域差异：Python 控制「首页数据概览卡片」，TS 侧收敛到**侧栏的类型列表**
 * （接线在 App.tsx，由父代理完成）。确认结果语义不变：
 * 全选→null（=默认全部显示）、全不选→[]（=全隐藏）、否则为勾选 id 列表。
 */

interface TypeVisibilityPanelProps {
  types: DataTypeDef[]
  value: string[] | null
  onConfirm: (next: string[] | null) => void
  onClose: () => void
}

export default function TypeVisibilityPanel({
  types,
  value,
  onConfirm,
  onClose
}: TypeVisibilityPanelProps) {
  const allIds = types.map((def) => def.id)
  // 初始勾选：null → 全勾；否则按 value 勾（只认 allIds 内的 id）
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (value === null) return new Set(allIds)
    const known = new Set(allIds)
    return new Set(value.filter((id) => known.has(id)))
  })

  const toggle = (id: string, on: boolean): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="editor" data-testid="type-visibility-panel">
      <div className="editor-header">
        <div className="editor-title">选择显示的数据类型</div>
      </div>

      <div className="editor-body">
        <div className="form-label">
          勾选要在侧栏显示的类型，未勾选的类型不会丢失数据，只是不在侧栏显示
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            data-testid="tv-select-all"
            onClick={() => setChecked(new Set(allIds))}
          >
            全选
          </button>
          <button
            type="button"
            className="btn"
            data-testid="tv-clear"
            onClick={() => setChecked(new Set<string>())}
          >
            清空
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {types.map((def) => (
            <label key={def.id} className="ai-gen-check">
              <input
                type="checkbox"
                data-testid="tv-check"
                checked={checked.has(def.id)}
                onChange={(event) => toggle(def.id, event.target.checked)}
              />
              {def.name} ({def.id})
            </label>
          ))}
        </div>

        <div className="form-label" data-testid="tv-count">
          已选择 {checked.size}/{allIds.length} 个类型
        </div>
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn primary"
          data-testid="tv-confirm"
          onClick={() => onConfirm(resolveVisibilityResult([...checked], allIds))}
        >
          确定
        </button>
        <button type="button" className="btn" data-testid="tv-cancel" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
