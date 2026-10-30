import { useEffect, useRef, useState, type ReactElement } from 'react'

import LucideIcon from '../LucideIcon'
import { SHORTCUTS, type ShortcutEntry } from './shortcutsData'

/**
 * 键盘快捷键参考弹窗（对齐 dsh `ui-shortcuts` 的**只读子集**）。
 *
 * 与 dsh `Reference.tsx` 对齐的部分：**可搜索**（按动作名或按键过滤；dsh 是按动作/别名/按键），
 * 打开即聚焦搜索框。刻意不做：录制 / 清除 / 恢复绑定（我们只有硬编码监听，
 * 没有可改写的键位注册表，做录制就是假按钮）。Esc / 点遮罩 / 关闭按钮都能收起。
 */

const GROUP_LABELS: Record<ShortcutEntry['group'], string> = {
  composer: '输入框',
  app: '全局'
}

const GROUPS: ShortcutEntry['group'][] = ['composer', 'app']

export function ShortcutsDialog({ onClose }: { onClose: () => void }): ReactElement {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 打开即聚焦搜索框（对齐 dsh Reference 的 focusRequest）
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const normalized = query.trim().toLowerCase()
  const matches =
    normalized === ''
      ? SHORTCUTS
      : SHORTCUTS.filter(
          (shortcut) =>
            shortcut.label.toLowerCase().includes(normalized) || shortcut.keys.toLowerCase().includes(normalized)
        )

  return (
    <div className="digital-shortcuts-overlay" data-testid="digital-shortcuts-overlay" onClick={onClose}>
      <div
        className="digital-shortcuts-card"
        role="dialog"
        aria-label="键盘快捷键"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="digital-shortcuts-head">
          <span className="digital-shortcuts-title">键盘快捷键</span>
          <button
            type="button"
            className="btn slim"
            data-testid="digital-shortcuts-close"
            aria-label="关闭"
            title="关闭（Esc）"
            onClick={onClose}
          >
            <LucideIcon name="x" size={14} />
          </button>
        </div>
        <input
          ref={searchRef}
          className="form-input digital-shortcuts-search"
          data-testid="digital-shortcuts-search"
          placeholder="搜索动作或按键…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索快捷键"
        />
        {matches.length === 0 ? (
          <p className="digital-shortcuts-empty" data-testid="digital-shortcuts-empty">
            没有匹配的快捷键
          </p>
        ) : (
          GROUPS.map((group) => {
            const rows = matches.filter((shortcut) => shortcut.group === group)
            if (rows.length === 0) return null
            return (
              <div className="digital-shortcuts-group" key={group}>
                <div className="digital-shortcuts-group-label">{GROUP_LABELS[group]}</div>
                <dl className="digital-shortcuts-list">
                  {rows.map((shortcut) => (
                    <div className="digital-shortcuts-row" key={shortcut.id} data-testid="digital-shortcut-row">
                      <dt>{shortcut.label}</dt>
                      <dd>
                        <kbd className="digital-shortcut-key">{shortcut.keys}</kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })
        )}
        <p className="digital-shortcuts-note">macOS 上 Ctrl 对应 ⌘。</p>
      </div>
    </div>
  )
}
