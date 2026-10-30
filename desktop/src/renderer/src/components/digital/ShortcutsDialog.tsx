import { useEffect, type ReactElement } from 'react'

import LucideIcon from '../LucideIcon'
import { SHORTCUTS, type ShortcutEntry } from './shortcutsData'

/**
 * 键盘快捷键参考弹窗（对齐 dsh `ui-shortcuts` 的诚实子集）。
 *
 * 只**读**我们的快捷键表（`shortcutsData.ts`），不做 dsh 的录制/清除/恢复绑定——
 * 我们只有硬编码监听，没有可改写的键位注册表，做录制就是假按钮。
 * Esc / 点遮罩 / 关闭按钮都能收起。
 */

const GROUP_LABELS: Record<ShortcutEntry['group'], string> = {
  composer: '输入框',
  app: '全局'
}

const GROUPS: ShortcutEntry['group'][] = ['composer', 'app']

export function ShortcutsDialog({ onClose }: { onClose: () => void }): ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
        {GROUPS.map((group) => (
          <div className="digital-shortcuts-group" key={group}>
            <div className="digital-shortcuts-group-label">{GROUP_LABELS[group]}</div>
            <dl className="digital-shortcuts-list">
              {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                <div className="digital-shortcuts-row" key={shortcut.id} data-testid="digital-shortcut-row">
                  <dt>{shortcut.label}</dt>
                  <dd>
                    <kbd className="digital-shortcut-key">{shortcut.keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="digital-shortcuts-note">macOS 上 Ctrl 对应 ⌘。</p>
      </div>
    </div>
  )
}
