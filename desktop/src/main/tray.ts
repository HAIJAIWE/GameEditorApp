/**
 * 托盘与全局热键（A1-5）：Electron `Tray` + `globalShortcut`。
 *
 * 对应 Python 的 `ui/digital_employee.py` / `ui/digital_panel_tasks.py` 里「常驻入口」的语义，
 * 但实现换成 Electron 原生能力。
 *
 * 设计：**全部操作防御式包装并返回是否成功**——托盘/热键在无桌面会话、被其它应用占用、
 * 或图标资源缺失时都会失败，**不应阻塞应用启动**。
 *
 * 图标：优先加载 `resources/tray-icon.png`（由 `scripts/gen-tray-icon.cjs` 生成并入库）；
 * 开发态路径为 `out/main/../../resources`。**打包后若资源未随包分发则回落**到
 * 现场生成的 16x16 位图，保证托盘仍能创建（不阻塞启动）。
 */

import { join } from 'node:path'

import { Menu, Tray, app, globalShortcut, nativeImage, type NativeImage } from 'electron'

/** 显示主窗口的全局热键 */
export const SHOW_WINDOW_SHORTCUT = 'CommandOrControl+Shift+M'

const ICON_SIZE = 16

/** 图标资源路径（dev: desktop/resources；打包态如未分发则由兜底位图接管） */
function trayIconPath(): string {
  return join(__dirname, '..', '..', 'resources', 'tray-icon.png')
}

/** 优先用正式资源；加载不到时回落到现场生成的位图 */
function resolveTrayIcon(): NativeImage {
  try {
    const fromFile = nativeImage.createFromPath(trayIconPath())
    if (!fromFile.isEmpty()) return fromFile
  } catch {
    // 落到兜底位图
  }
  return buildFallbackIcon()
}

/** 现场生成 16x16 实心图标（BGRA；Electron `createFromBitmap` 的约定） */
function buildFallbackIcon(): NativeImage {
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
    const tray = new Tray(resolveTrayIcon())
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
