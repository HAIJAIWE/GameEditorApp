/**
 * 键盘快捷键**单一事实来源**（对齐 dsh `ui-shortcuts` 的诚实子集：只读参考，不做录制/改键）。
 *
 * 只收录**代码里真实存在**的快捷键（见 `App.tsx` 的撤销/重做、`Sidebar.tsx` 的 Mod+B、
 * `DigitalPanel.tsx` 的 Enter/Shift+Enter/`/`/`@`/Esc）。加新快捷键时同步这里，
 * 弹窗即可自动列出——不做「注册表 + 改键」那套运行时系统（我们只有硬编码监听）。
 */

export interface ShortcutEntry {
  id: string
  /** 展示用的按键组合（Windows 口径；macOS 上 Ctrl 对应 ⌘） */
  keys: string
  label: string
  group: 'composer' | 'app'
}

export const SHORTCUTS: readonly ShortcutEntry[] = [
  { id: 'send', keys: 'Enter', label: '发送消息', group: 'composer' },
  { id: 'newline', keys: 'Shift + Enter', label: '输入换行', group: 'composer' },
  { id: 'command', keys: '/', label: '斜杠命令', group: 'composer' },
  { id: 'reference', keys: '@', label: '引用数据表', group: 'composer' },
  { id: 'close', keys: 'Esc', label: '关闭菜单 / 弹层', group: 'composer' },
  { id: 'sidebar', keys: 'Ctrl + B', label: '切换侧栏', group: 'app' },
  { id: 'undo', keys: 'Ctrl + Z', label: '撤销', group: 'app' },
  { id: 'redo', keys: 'Ctrl + Shift + Z', label: '重做（或 Ctrl + Y）', group: 'app' }
]
