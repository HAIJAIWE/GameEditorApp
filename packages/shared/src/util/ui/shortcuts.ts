/**
 * 应用级快捷键清单 —— **唯一事实源**。
 *
 * ## 三方都从本文件派生，因此「清单 vs 实现」的漂移在结构上不可能发生
 *
 * 1. **实现**：`src/renderer/src/App.tsx` 的 keydown effect 不再手写 `if (key === 'z') …`，
 *    而是把事件丢给下面的 `matchShortcut()`，按返回的 action 调 `performUndo` / `performRedo`。
 * 2. **状态栏提示**：`App.tsx` 的 `statusbar-shortcuts` 渲染 `APP_SHORTCUTS_STATUS_TEXT`
 *    （由 `APP_SHORTCUTS` 派生），不再手写一份键位文案。
 * 3. **参考面板**：`components/common/ShortcutsPanel.tsx` 直接遍历 `APP_SHORTCUTS`。
 *
 * 改快捷键 = 只改本文件（必要时同步 `matchShortcut` 的键位判定）：
 * - 新增/删除条目 → 面板与状态栏自动跟随；
 * - 新增**按键语义**（如再加 `Ctrl+Shift+Y`）→ 改 `matchShortcut`，单测
 *   `tests/unit/appShortcuts.test.ts` 用行为断言覆盖它，不读任何源码文本。
 *
 * ## 本清单**不是** 旧版 `src/common/shortcuts::DEFAULT_SHORTCUTS`（35 条）的移植
 *
 * 而是「TS 版**实际注册了哪些键**」的如实罗列。当前只有 3 个绑定：
 * `Ctrl+Z`（撤销）、`Ctrl+Shift+Z` / `Ctrl+Y`（重做，等价的第二入口）。
 *
 * 为什么不照抄 旧版 的 35 条：其中 32 条在 TS 侧没有对应实现（`Ctrl+S` 整文档保存、
 * `F5` 刷新、`Ctrl+F` 查找、`Ctrl+Space` AI 助手、标签导航……），
 * 照抄等于给 32 个「按了没反应」的键做广告。
 *
 * 另注：`Escape`（关闭浮层/下拉）**刻意不在本表**——它属交互键而非命令键，
 * 旧版 的快捷键表里也没有它。
 */

/** 单条快捷键 */
export interface AppShortcut {
  /**
   * 按键组合（展示用）。与 `matchShortcut` 的判定等价；
   * macOS 的 `Cmd` 走同一分支（`ctrlKey || metaKey`），故不再单列。
   */
  keys: string
  /** 动作标识。与 `App.tsx` 里调用的 `performUndo` / `performRedo` 一一对应 */
  action: 'undo' | 'redo'
  /** 中文说明（面板「说明」列） */
  description: string
  /**
   * 是否作为状态栏紧凑提示的**代表入口**（同一动作至多一条）。
   * 状态栏只有一行，重做的两个等价入口里只展示 `Ctrl+Y` 这个更通用的。
   */
  primary?: boolean
}

/** TS 版真实注册的全局快捷键（按面板展示顺序：撤销在前，重做的两个入口在后） */
export const APP_SHORTCUTS: readonly AppShortcut[] = [
  { keys: 'Ctrl+Z', action: 'undo', description: '撤销上一步操作', primary: true },
  { keys: 'Ctrl+Shift+Z', action: 'redo', description: '重做被撤销的操作' },
  { keys: 'Ctrl+Y', action: 'redo', description: '重做（Ctrl+Shift+Z 的等价入口）', primary: true }
]

/** 快捷键能触发的动作（= 清单里 `action` 的取值域） */
export type ShortcutAction = AppShortcut['action']

/**
 * 把一次按键映射成动作；无匹配返回 `null`。纯函数，便于直接单测。
 *
 * 语义（与历史内联实现逐字等价）：
 * - 非 ctrl 且非 meta → `null`（macOS 的 Cmd 与 Ctrl 同权）
 * - `z`（不按 Shift）→ `'undo'`
 * - `z` + Shift，或 `y` → `'redo'`（`Ctrl+Shift+Y` 也算重做，与内联实现一致）
 * - 其余 → `null`
 */
export function matchShortcut(input: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}): ShortcutAction | null {
  if (!input.ctrlKey && !input.metaKey) return null
  const key = input.key.toLowerCase()
  if (key === 'z' && !input.shiftKey) return 'undo'
  if ((key === 'z' && input.shiftKey) || key === 'y') return 'redo'
  return null
}

/**
 * 把展示用键位串转成 `aria-keyshortcuts` 的可读形式。
 *
 * 规范用 `Control` / `Alt` / `Shift` / `Meta` 四个名字（对齐 dsh `shortcuts/src/binding.ts`），
 * 而界面上习惯写 `Ctrl`。两者不能混用，否则读屏软件念不出来。
 * 例：`'Ctrl+Shift+Z'` → `'Control+Shift+Z'`。
 */
export function shortcutAria(keys: string): string {
  return keys
    .split('+')
    .map((part) => part.trim())
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === 'ctrl' || lower === 'control') return 'Control'
      if (lower === 'alt' || lower === 'option') return 'Alt'
      if (lower === 'shift') return 'Shift'
      if (lower === 'meta' || lower === 'cmd' || lower === 'command') return 'Meta'
      return part
    })
    .join('+')
}

/** 动作在状态栏里的短名（`description` 是面板用的长句，塞不进状态栏） */
const ACTION_SHORT_LABELS: Record<ShortcutAction, string> = {
  undo: '撤销',
  redo: '重做'
}

/**
 * 状态栏紧凑提示，由清单派生（`primary` 条目 + 动作短名）：
 * `Ctrl+Z 撤销 · Ctrl+Y 重做`。
 */
export const APP_SHORTCUTS_STATUS_TEXT = APP_SHORTCUTS.filter((shortcut) => shortcut.primary === true)
  .map((shortcut) => `${shortcut.keys} ${ACTION_SHORT_LABELS[shortcut.action]}`)
  .join(' · ')
