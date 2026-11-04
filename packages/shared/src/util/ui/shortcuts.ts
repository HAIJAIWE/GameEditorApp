/**
 * 应用级快捷键清单 —— **唯一事实源**（2026-11-04 合并）。
 *
 * ## 此前有两份"单一事实源"，现已合并
 * 旧结构：本文件的 `APP_SHORTCUTS`（3 条 app 键，`description` 中文硬编码）
 * 与 `apps/desktop/.../commands/shortcutsData.ts` 的 `SHORTCUTS`（8 条含 composer），
 * 两份都自称唯一源、口径还不一致（一份中文字面量、一份 labelKey）。
 * 现在只有 `SHORTCUT_CATALOG` 一份，其余全是它的派生视图：
 *
 * - **实现**：`App.tsx` 的 keydown effect 用 `matchShortcut()` 派发动作，不手写键位判断。
 * - **状态栏**：`shortcutsStatusText(t)` 由 `primary` 条目派生（文案走字典，中英都跟随）。
 * - **菜单键帽**：`MenuBar` 把 `app.<action>` 命令映射到 `APP_SHORTCUTS`。
 * - **参考面板/弹窗**：`ShortcutsPanel`（app 组表格）与 `ShortcutsDialog`
 *   （全量 + 分组 + 搜索）都直接读 `SHORTCUT_CATALOG`。
 *
 * 改快捷键 = 只改本文件（必要时同步 `matchShortcut` 的键位判定），
 * 上面四处自动跟随。
 *
 * ## 不是 旧版 35 条清单的移植
 * 只列「TS 版**实际注册了哪些键**」。旧版 里 `Ctrl+S` 整文档保存、`F5` 刷新、
 * `Ctrl+F` 查找等 32 条在 TS 侧没有实现，照抄等于给按了没反应的键做广告。
 * `Escape`（关闭浮层）属交互键而非命令键，同样不列。
 */
import type { MessageKey } from '../../i18n'

/** 快捷键分组（参考弹窗按此分节） */
export type ShortcutGroup = 'app' | 'composer'

/** 单条快捷键 */
export interface ShortcutEntry {
  /** 稳定标识（列表 key / 搜索去重）；同一动作的多个入口用不同 id */
  id: string
  /** 展示用键位组合，如 `'Ctrl+Shift+Z'`；`+` 分隔，macOS 上 Ctrl 对应 Cmd */
  keys: string
  /** 说明文案的字典键 —— 不在本文件写死中文，状态栏与面板都由 `t()` 渲染 */
  labelKey: MessageKey
  group: ShortcutGroup
  /** 全局命令标识；有值才参与 `matchShortcut` 派发、菜单键帽与状态栏 */
  action?: ShortcutAction
  /** 是否作为状态栏紧凑提示的代表入口（同一动作至多一条） */
  primary?: boolean
}

/** 快捷键能触发的动作（= 清单里 `action` 的取值域） */
export type ShortcutAction = 'undo' | 'redo'

/**
 * 全量清单（按参考弹窗的展示顺序：composer 组在前，app 组在后）。
 *
 * `redo` 有两个等价入口（`Ctrl+Shift+Z` / `Ctrl+Y`），都列出来 —— 只写一个会让
 * 另一个入口在参考表里消失；状态栏则只用 `primary` 的那条。
 */
export const SHORTCUT_CATALOG: readonly ShortcutEntry[] = [
  { id: 'send', keys: 'Enter', labelKey: 'agent.shortcut.send', group: 'composer' },
  { id: 'newline', keys: 'Shift+Enter', labelKey: 'agent.shortcut.newline', group: 'composer' },
  { id: 'command', keys: '/', labelKey: 'agent.composer.command', group: 'composer' },
  { id: 'reference', keys: '@', labelKey: 'agent.composer.reference', group: 'composer' },
  { id: 'close', keys: 'Esc', labelKey: 'agent.shortcut.close', group: 'composer' },
  { id: 'sidebar', keys: 'Ctrl+B', labelKey: 'agent.shortcut.sidebar', group: 'app' },
  { id: 'undo', keys: 'Ctrl+Z', labelKey: 'agent.shortcut.undo', group: 'app', action: 'undo', primary: true },
  {
    id: 'redo',
    keys: 'Ctrl+Shift+Z',
    labelKey: 'agent.shortcut.redo',
    group: 'app',
    action: 'redo'
  },
  {
    id: 'redo-alt',
    keys: 'Ctrl+Y',
    labelKey: 'agent.shortcut.redo',
    group: 'app',
    action: 'redo',
    primary: true
  }
]

/** 参与全局命令派发的条目（app 组且有 action） */
export const APP_SHORTCUTS = SHORTCUT_CATALOG.filter(
  (entry): entry is ShortcutEntry & { action: ShortcutAction } => entry.action !== undefined
)

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
 * 状态栏紧凑提示：`primary` 条目 + 动作名（走字典，中英跟随）。
 * 形如 `Ctrl+Z 撤销 · Ctrl+Y 重做`。
 *
 * 用函数而不是模块级常量：常量在模块加载时就固定了语言，切到英文后状态栏不会变。
 */
export function shortcutsStatusText(t: (key: MessageKey) => string): string {
  return APP_SHORTCUTS.filter((shortcut) => shortcut.primary === true)
    .map((shortcut) => `${shortcut.keys} ${t(shortcut.labelKey)}`)
    .join(' · ')
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
