import { useState } from 'react'

import { useT } from '@mobai/client-ui'
import type { DataTypeDef } from '@mobai/shared/types'
import { resolveVisibilityResult } from '@mobai/shared/config/game'

/**
 * 显示类型选择面板 —— 迁移自 旧版 `ui/dialogs/type_visibility_dialog`
 * 的 `TypeVisibilityDialog`。
 *
 * ⚠️ 当前**未接线**：它原本用于过滤侧栏的类型列表，而侧栏已随顶层 IA 重写一并下线
 * 。组件文件保留以留迁移痕迹，不再有菜单/入口引用。
 *
 * 确认结果语义不变：全选→null（=默认全部显示）、全不选→[]（=全隐藏）、否则为勾选 id 列表。
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
  const t = useT()
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
        <div className="editor-title">{t('typeVisibility.title')}</div>
      </div>

      <div className="editor-body">
        <div className="form-label">{t('typeVisibility.hint')}</div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            data-testid="tv-select-all"
            onClick={() => setChecked(new Set(allIds))}
          >
            {t('typeVisibility.selectAll')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="tv-clear"
            onClick={() => setChecked(new Set<string>())}
          >
            {t('typeVisibility.clear')}
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
          {t('typeVisibility.count', { n: checked.size, total: allIds.length })}
        </div>
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn primary"
          data-testid="tv-confirm"
          onClick={() => onConfirm(resolveVisibilityResult([...checked], allIds))}
        >
          {t('common.ok')}
        </button>
        <button type="button" className="btn" data-testid="tv-cancel" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
