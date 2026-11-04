import { Fragment } from 'react'

/**
 * 键帽展示（借 dsh `ui-primitives/src/ShortcutKeys.tsx` 的形态）。
 *
 * 只负责**画**键帽，不判定键位、不注册监听——键位事实源在
 * `@mobai/shared/util/ui/shortcuts`（`APP_SHORTCUTS`）。
 *
 * 无障碍：整块 `aria-hidden`，语义由宿主元素的 `aria-keyshortcuts`
 * （`shortcutAria(keys)` 派生）承担。两者都画会读屏读两遍。
 */
export interface ShortcutKeysProps {
  /** 展示用键位串，如 `'Ctrl+Shift+Z'`；内部按 `+` 拆成键帽 */
  keys: string
  /** `plain` 无底色（菜单项右侧）；`boxed` 带键帽底（设置/参考面板） */
  variant?: 'plain' | 'boxed'
  className?: string
}

export function ShortcutKeys({ keys, variant = 'plain', className }: ShortcutKeysProps): React.JSX.Element {
  const parts = keys
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part !== '')

  const classes = ['shortcut-keys', `shortcut-keys-${variant}`, className].filter(Boolean).join(' ')

  return (
    <span className={classes} aria-hidden="true">
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {index > 0 && <span className="shortcut-separator">+</span>}
          <kbd className="shortcut-key">{part}</kbd>
        </Fragment>
      ))}
    </span>
  )
}
