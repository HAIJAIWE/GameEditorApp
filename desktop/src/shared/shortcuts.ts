/**
 * 应用级快捷键清单（**唯一事实源 = 渲染层真实注册的 keydown 处理**）。
 *
 * ## ⚠️ 改这里之前必须先 grep `src/renderer/src/App.tsx` 的 keydown handler
 *
 * 本清单**不是** PyQt `src/common/shortcuts.py::DEFAULT_SHORTCUTS`（35 条）的移植，
 * 而是「TS 版**实际注册了哪些键**」的如实罗列。当前只有 3 个绑定：
 * `Ctrl+Z`（撤销）、`Ctrl+Shift+Z` / `Ctrl+Y`（重做，等价的第二入口）。
 *
 * 为什么不照抄 PyQt 的 35 条：其中 32 条在 TS 侧没有对应实现（`Ctrl+S` 整文档保存、
 * `F5` 刷新、`Ctrl+F` 查找、`Ctrl+Space` AI 助手、标签导航……），
 * 照抄等于给 32 个「按了没反应」的键做广告 —— 与状态栏快捷键提示
 * （`App.tsx` 的 `statusbar-shortcuts`，刻意只列 TS 真有的键）同一取舍。
 *
 * 另注：`Escape`（关闭浮层/下拉）**刻意不在本表**——它属交互键而非命令键，
 * PyQt 的快捷键表里也没有它。
 *
 * 单测 `tests/unit/appShortcuts.test.ts` 做双向一致性校验：
 * 清单里每条都能在 `App.tsx` 找到对应注册，且 `App.tsx` 里注册过的键也都必须在本表出现。
 */

/** 单条快捷键 */
export interface AppShortcut {
  /**
   * 按键组合（展示用）。与 `App.tsx` 的 `KeyboardEvent` 判断等价；
   * macOS 的 `Cmd` 走同一分支（源码里是 `event.ctrlKey || event.metaKey`），故不再单列。
   */
  keys: string
  /**
   * 动作标识。取值刻意与 `App.tsx` 里的 handler 同名（`performUndo` / `performRedo`），
   * 这样单测能按名字反查源码，注册与清单不会各说各话。
   */
  action: 'undo' | 'redo'
  /** 中文说明（面板「说明」列） */
  description: string
}

/** TS 版真实注册的全局快捷键（按面板展示顺序：撤销在前，重做的两个入口在后） */
export const APP_SHORTCUTS: readonly AppShortcut[] = [
  { keys: 'Ctrl+Z', action: 'undo', description: '撤销上一步操作' },
  { keys: 'Ctrl+Shift+Z', action: 'redo', description: '重做被撤销的操作' },
  { keys: 'Ctrl+Y', action: 'redo', description: '重做（Ctrl+Shift+Z 的等价入口）' }
]