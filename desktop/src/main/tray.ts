/**
 * 托盘与全局热键（A1-5）：Electron `Tray` + `globalShortcut`。
 *
 * 对应 Python 的 `ui/digital_employee.py` / `ui/digital_panel_tasks.py` 里「常驻入口」的语义，
 * 但实现换成 Electron 原生能力。
 *
 * 设计：**全部操作防御式包装并返回是否成功**——托盘/热键在无桌面会话、被其它应用占用、
 * 或图标资源缺失时都会失败，**不应阻塞应用启动**。
 *
 * 图标说明：正式托盘图标资源待补，这里用原始位图现场生成一个 16x16 实心方块
 * （避免为了一个图标引入打包资产与路径问题）。
 */

import { Menu, Tray, app, globalShortcut, nativeImage, type NativeImage } from 'electron'

/** 显示主窗口的全局热键 */
export const SHOW_WINDOW_SHORTCUT = 'CommandOrControl+Shift+M'

const ICON_SIZE = 16

/** 现场生成 16x16 实心图标（BGRA；Electron `createFromBitmap` 的约定） */
function buildTrayIcon(): NativeImage {
  const bitmap = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4)
  for (let index = 0; index < ICON_SIZE * ICON_SIZE; index++) {
    const offset = index * 4
    bitmap[offset] = 0x78 // B
    bitmap[offset + 1] = 0xdc // G
    bitmap[offset + 2] = 0x0f // R
    bitmap[offset + 3] = 0xff // A
  }
  return nativeImage.createFromBitmap(bitmap, { width: ICON_SIZE, height: ICON_SIZE })
}

export interface TrayCallbacks {
  /** 显示并聚焦主窗口 */
  showWindow: () => void
}

/** 创建托盘；失败返回 null（不抛错，不阻塞启动） */
export function setupTray(callbacks: TrayCallbacks): Tray | null {
  try {
    const tray = new Tray(buildTrayIcon())
    tray.setToolTip('墨白可视化编辑')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主窗口', click: callbacks.showWindow },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ])
    )
    tray.on('click', callbacks.showWindow)
    return tray
  } catch {
    return null
  }
}

/** 注册全局热键；返回是否注册成功（被占用时返回 false） */
export function registerShortcuts(callbacks: TrayCallbacks): boolean {
  try {
    return globalShortcut.register(SHOW_WINDOW_SHORTCUT, callbacks.showWindow)
  } catch {
    return false
  }
}

/** 注销全部全局热键（退出前调用） */
export function unregisterShortcuts(): void {
  try {
    globalShortcut.unregisterAll()
  } catch {
    // 退出路径上不需要处理
  }
}

/** 销毁托盘 */
export function disposeTray(tray: Tray | null): void {
  try {
    tray?.destroy()
  } catch {
    // 退出路径上不需要处理
  }
}
