import { join } from 'node:path'

import { app, BrowserWindow, screen, shell, type Tray } from 'electron'

import { log } from '../shared/util/logger'
import type { DataService } from './data/service'
import { disposeIpcHandlers, registerIpcHandlers } from './ipc'
import { initLogger } from './logger'
import { LibraryManager } from './library/manager'
import { migrateFlatToLibraries } from './library/migrate'
import { INITIAL_LIBRARY_NAME } from './library/store'
import { buildStores, type AppStores } from './stores'
import { getSecretStore } from './settings/secretStoreInstance'
import { disposeTray, registerShortcuts, setupTray, unregisterShortcuts } from './tray'
import { DEFAULT_WINDOW_STATE, fitBoundsToDisplays, readWindowState, writeWindowState } from './windowState'

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

/**
 * 关窗行为：真实用户「关窗 = 收进托盘常驻」，托盘里的「退出」才真退。
 *
 * E2E / 便携模式（`MB_USER_DATA_DIR`）保持**关窗即退** —— 否则 Playwright 的
 * `app.close()` 会被常驻逻辑挂住，整套 e2e 的 teardown 都会超时。
 */
const residentClose = process.env['MB_USER_DATA_DIR'] === undefined

/** 是否正在真正退出（托盘「退出」/ 系统关机）：为 true 时才放行 close */
let isQuitting = false

/** 首次收进托盘时提示一次，避免用户以为程序被关掉了 */
let trayHintShown = false
function showTrayHintOnce(): void {
  if (trayHintShown || appTray === null) return
  trayHintShown = true
  try {
    appTray.displayBalloon({
      title: '墨白可视化编辑仍在后台运行',
      content: '点击托盘图标可恢复窗口；托盘菜单里的「退出」才会真正退出。'
    })
  } catch {
    // 平台不支持 balloon（或托盘已销毁）时静默忽略
  }
}

/*
 * 单实例锁：同一 userData 只允许一个实例。
 *
 * 为什么必须：两个实例会同时读写同一份 SQLite（`libraries/<库>/data.db`）与
 * `type_schema.json`，后写覆盖前写 —— 这是会丢数据的架构级风险，不是 UI 小毛病。
 *
 * 必须在 `MB_USER_DATA_DIR` 覆盖之后调用：锁按 userData 路径区分，E2E 每个用例
 * 用独立临时目录、且 playwright `workers: 1` 串行，互不影响。
 */
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

/** 第二个实例被拒绝时，把已有窗口唤到前台（而不是让用户以为「点了没反应」） */
app.on('second-instance', () => {
  if (mainWindow === null || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow(): void {
  // 恢复上次窗口几何（无状态文件时用默认；坏数据已由 normalizeWindowState 逐字段兜底）
  const saved = readWindowState(app.getPath('userData'))
  // 旧坐标可能落在已拔掉的副屏上（窗口「打开了但看不见」）⇒ 用当前显示器校正到可见位置。
  const bounds = fitBoundsToDisplays(
    saved ?? DEFAULT_WINDOW_STATE,
    screen.getAllDisplays().map((display) => display.workArea),
    screen.getPrimaryDisplay().workArea
  )
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
      sandbox: true,
      // 中间窗口「浏览器」页签需要 <webview> 加载外部页面（预览 Demo / 查资料）。
      // webview 是独立 guest 进程：nodeIntegration 默认关、与渲染层上下文隔离，
      // 不因本标志获得 Node 能力；加载什么由用户在面板里输入，与主窗口同权。
      webviewTag: true
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
  mainWindow.on('close', (event) => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    persistWindowState()
    // 常驻模式：关窗只是收进托盘（窗口不销毁），托盘「退出」经 before-quit 放行。
    if (residentClose && !isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      showTrayHintOnce()
    }
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
  // 没拿到锁的实例已在上方 `app.quit()`；这里再兜一层，避免竞态下仍去建库/建窗。
  if (!hasSingleInstanceLock) return
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

/** 真正退出（托盘「退出」/ 系统关机）时放行 close —— 常驻模式下否则窗口关不掉 */
app.on('before-quit', () => {
  isQuitting = true
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