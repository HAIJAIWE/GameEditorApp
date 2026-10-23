import { defaultSettingsStorage, readSetting, writeSetting, type StorageLike } from './settingsStore'

/**
 * 中间窗口的页签状态（编辑器 / 代码编辑 / 浏览器窗口）。
 *
 * 为什么独立成模块而不是塞在 App.tsx：与 theme/gameStyle 同构——纯逻辑 +
 * StorageLike 注入，可单测；App.tsx 已经太重（全仓最重的共享接线文件），
 * 少加一处状态逻辑少一分回归面。
 */

export type MiddleTab = 'editor' | 'code' | 'browser'

export interface MiddleTabDef {
  id: MiddleTab
  /** 页签短标签（顶部空间有限） */
  label: string
  /** 悬浮说明 */
  title: string
}

/** 页签定义与顺序（单一真源，App 的页签条与快捷键提示都从这里取） */
export const MIDDLE_TABS: ReadonlyArray<MiddleTabDef> = [
  { id: 'editor', label: '编辑器', title: '游戏数据与策划书编辑器' },
  { id: 'code', label: '代码编辑', title: '代码查看（只读）' },
  { id: 'browser', label: '浏览器', title: '内置浏览器（预览 Demo / 查资料）' }
]

export const MIDDLE_TAB_KEY = 'mb.middleTab'

const VALID = new Set<string>(MIDDLE_TABS.map((tab) => tab.id))

/** 读取页签状态：损坏/未知值回落 'editor'（与 loadTheme 的兜底一致） */
export function loadMiddleTab(storage: StorageLike | null = defaultSettingsStorage()): MiddleTab {
  const raw = readSetting(MIDDLE_TAB_KEY, storage)
  return raw !== null && VALID.has(raw) ? (raw as MiddleTab) : 'editor'
}

export function saveMiddleTab(tab: MiddleTab, storage: StorageLike | null = defaultSettingsStorage()): void {
  writeSetting(MIDDLE_TAB_KEY, tab, storage)
}
