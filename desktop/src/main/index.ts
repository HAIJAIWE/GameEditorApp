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
import { getSecretStore } from './settings/secretStoreInstance'
import { disposeTray, registerShortcuts, setupTray, unregisterShortcuts } from './tray'
import { DEFAULT_WINDOW_STATE, readWindowState, writeWindowState } from './windowState'

/** 最后停留的界面模式（data/ceshu/digital），由渲染层经 `app:setWindowMode` 上报，仅用于窗口状态落盘 */
let lastWindowMode = DEFAULT_WINDOW_STATE.lastMode

/** 供 IPC handler 调用的 setter（渲染层切模式时上报，落进 window-state.json）。
 *  注意：不要 `export` —— `ipc.ts` 已在本模块 import，顶层 export 会形成循环依赖；
 *  通过 `registerIpcHandlers({ setWindowMode })` 依赖注入传给 handler。 */
function setWindowMode(mode: string): void {
  if (mode !== '') {
    lastWindowMode = mode
  }
}

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
  // 恢复上次窗口几何（无状态文件时用默认；坏数据已由 normalizeWindowState 逐字段兜底）
  const saved = readWindowState(app.getPath('userData'))
  const bounds = saved ?? DEFAULT_WINDOW_STATE
  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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

  if (bounds.maximized) {
    mainWindow.maximize()
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 窗口状态持久化（迁移 ui/window_state.py）：resize/move 防抖 500ms 落盘，关闭时强制落一次。
  // 用 getNormalBounds() 而非 getBounds()：最大化/最小化时 getBounds 会被系统改写，
  // 存它会导致「取消最大化后窗口恢复成全屏尺寸」。
  let persistTimer: NodeJS.Timeout | null = null
  const persistWindowState = (): void => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      return
    }
    const normal = mainWindow.getNormalBounds()
    writeWindowState(app.getPath('userData'), {
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: mainWindow.isMaximized(),
      lastMode: lastWindowMode
    })
  }
  const schedulePersist = (): void => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistWindowState()
    }, 500)
  }
  mainWindow.on('resize', schedulePersist)
  mainWindow.on('move', schedulePersist)
  mainWindow.on('close', () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    persistWindowState()
  })

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
    // 敏感配置（API Key）走 safeStorage 加密的钥匙串；懒加载单例，首次取值在 whenReady 之后
    secretStore: getSecretStore(),
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
    }),
    setWindowMode
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
}).catch((error) => {
  // 启动链路（旧数据搬迁 / 建库 / 建窗）任一环节抛错，此前会变成「无窗口 + 无提示」的**静默失败**。
  // 这里落日志（userData/logs，initLogger 是回调首行 ⇒ 之后失败必已可落盘）并优雅退出，
  // 让用户与排障至少有据可查，而不是看着一个什么都没发生的进程。
  log.error('[Startup] 应用启动失败', error instanceof Error ? error : String(error))
  app.quit()
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