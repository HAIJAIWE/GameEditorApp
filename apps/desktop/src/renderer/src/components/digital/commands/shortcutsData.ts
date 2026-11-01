import type { MessageKey } from '@mobai/shared/i18n'

/**
 * 键盘快捷键**单一事实来源**（对齐 dsh `ui-shortcuts` 的诚实子集：只读参考，不做录制/改键）。
 *
 * 只收录**代码里真实存在**的快捷键（见 `App.tsx` 的撤销/重做、`Sidebar.tsx` 的 Mod+B、
 * `DigitalPanel.tsx` 的 Enter/Shift+Enter/`/`/`@`/Esc）。加新快捷键时同步这里，
 * 弹窗即可自动列出——不做「注册表 + 改键」那套运行时系统（我们只有硬编码监听）。
 *
 * 文案存**键**而不是字符串：本文件是模块级常量，拿不到 React context，
 * 翻译在渲染时由 `ShortcutsDialog` 用 `t(labelKey)` 完成。
 */

export interface ShortcutEntry {
  id: string
  /** 展示用的按键组合（Windows 口径；macOS 上 Ctrl 对应 ⌘） */
  keys: string
  labelKey: MessageKey
  group: 'composer' | 'app'
}

export const SHORTCUTS: readonly ShortcutEntry[] = [
  { id: 'send', keys: 'Enter', labelKey: 'agent.shortcut.send', group: 'composer' },
  { id: 'newline', keys: 'Shift + Enter', labelKey: 'agent.shortcut.newline', group: 'composer' },
  { id: 'command', keys: '/', labelKey: 'agent.composer.command', group: 'composer' },
  { id: 'reference', keys: '@', labelKey: 'agent.composer.reference', group: 'composer' },
  { id: 'close', keys: 'Esc', labelKey: 'agent.shortcut.close', group: 'composer' },
  { id: 'sidebar', keys: 'Ctrl + B', labelKey: 'agent.shortcut.sidebar', group: 'app' },
  { id: 'undo', keys: 'Ctrl + Z', labelKey: 'agent.shortcut.undo', group: 'app' },
  { id: 'redo', keys: 'Ctrl + Shift + Z', labelKey: 'agent.shortcut.redo', group: 'app' }
]
