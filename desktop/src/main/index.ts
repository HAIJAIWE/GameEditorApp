import { join } from 'node:path'

import { app, BrowserWindow, shell, type Tray } from 'electron'

import { log } from '../shared/logger'
import type { DataService } from './data/service'
import { disposeIpcHandlers, registerIpcHandlers } from './ipc'
import { initLogger } from './logger'
import { LibraryManager } from './library/manager'
import { migrateFlatToLibraries } from './library/migrate'
import { INITIAL_LIBRARY_NAME } from './library/store'
import { buildStores, type AppStores } from './stores'
import { disposeTray, registerShortcuts, setupTray, unregisterShortcuts } from './tray'

// E2E / 便携模式：允许外部指定 userData 目录（隔离测试数据）
const userDataOverride = process.env['MB_USER_DATA_DIR']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
let stores: AppStores | null = null
let dataService: DataService | null = null
let appTray: Tray | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: '墨白可视化编辑',
    backgroundColor: '#14161a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 安全基线：拒绝应用内开新窗口（https 外链交给系统浏览器），拒绝导航到应用外地址
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || (rendererDevUrl !== undefined && url.startsWith(rendererDevUrl))
    if (!allowed) event.preventDefault()
  })

  if (rendererDevUrl) {
    void mainWindow.loadURL(rendererDevUrl)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * 切换/初始化活跃库：释放旧 store → 重建 → **注销并重注册 IPC**（handler 闭包捕获了 deps，
 * 无法就地替换）→ 广播 `library:changed` 让渲染层清缓存重载。
 */
function activateLibrary(libraryManager: LibraryManager): void {
  stores?.dataService.dispose()
  const next = buildStores(libraryManager.activeDir())
  stores = next
  dataService = next.dataService

  disposeIpcHandlers()
  registerIpcHandlers({
    ...next,
    libraryManager,
    onSwitchLibrary: async (name) => {
      await libraryManager.switch(name)
      activateLibrary(libraryManager)
      mainWindow?.webContents.send('library:changed', { active: libraryManager.active() })
    },
    getAppInfo: () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      dbPath: next.dbPath
    })
  })
}

app.whenReady().then(async () => {
  const userDataDir = app.getPath('userData')
  // 日志先行：主进程日志落盘到 userData/logs，渲染层经 IPC 转发到此
  initLogger(join(userDataDir, 'logs'))

  // A2-1 一次性搬迁：平铺旧存储 → libraries/<初始库>/
  try {
    const migration = migrateFlatToLibraries(userDataDir, INITIAL_LIBRARY_NAME)
    if (migration !== null) {
      log.info(`[Library] 旧数据已搬入「${INITIAL_LIBRARY_NAME}」: ${migration.moved.join(', ')}`)
    }
  } catch (error) {
    // 搬迁失败：原文件保留，仍以新结构启动（该库从空开始），把原因打出来供排障
    log.error('[Library] 搬迁失败', error instanceof Error ? error : String(error))
  }

  const libraryManager = new LibraryManager(userDataDir)
  await libraryManager.ensureReady()
  activateLibrary(libraryManager)

  createWindow()

  // 托盘与全局热键（A1-5）：失败不阻塞启动（无桌面会话 / 热键被占用 / 缺图标资源）
  const trayCallbacks = {
    showWindow: (): void => {
      if (mainWindow === null) return
      mainWindow.show()
      mainWindow.focus()
    }
  }
  appTray = setupTray(trayCallbacks)
  registerShortcuts(trayCallbacks)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  unregisterShortcuts()
  disposeTray(appTray)
  appTray = null
  dataService?.dispose()
  dataService = null
})