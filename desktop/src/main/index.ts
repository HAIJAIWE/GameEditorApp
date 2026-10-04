import { join } from 'node:path'

import { app, BrowserWindow, shell, type Tray } from 'electron'

import { AgentApprovalBroker } from './agent/approvalBroker'
import { AgentBrainService } from './agent/brainService'
import { AgentMemoryStore } from './agent/memoryStore'
import { AgentSessionStore } from './agent/sessionStore'
import { SkillDispatcher } from './agent/dispatcher'
import { createAskUserSkill } from './agent/skills/askUserSkill'
import { createCeshuSkill } from './agent/skills/ceshuSkill'
import { createCodeSkill } from './agent/skills/codeSkill'
import { createGameDataSkill } from './agent/skills/gameDataSkill'
import { AttrSystemStore } from './attr/attrSystemStore'
import { exportCeshuDocument } from './ceshu/export/exporter'
import { CeshuManager } from './ceshu/manager'
import { CeshuDataSync } from './ceshu/dataSync'
import { CeshuNotesStore } from './ceshu/notesStore'
import { CeshuTemplateStore } from './ceshu/templateStore'
import { CeshuStorage } from './ceshu/storage'
import { DataService } from './data/service'
import { SqliteItemsRepository } from './data/sqliteRepo'
import { disposeIpcHandlers, registerIpcHandlers } from './ipc'
import { LibraryManager } from './library/manager'
import { migrateFlatToLibraries } from './library/migrate'
import { INITIAL_LIBRARY_NAME } from './library/store'
import { LlmClient } from './llm/client'
import { TypeSchemaStore } from './schema/store'
import { disposeTray, registerShortcuts, setupTray, unregisterShortcuts } from './tray'

// E2E / 便携模式：允许外部指定 userData 目录（隔离测试数据）
const userDataOverride = process.env['MB_USER_DATA_DIR']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

/** 一套随活跃库重建的 store 组合（A2-1） */
interface AppStores {
  dbPath: string
  dataService: DataService
  ceshuManager: CeshuManager
  typeSchemaStore: TypeSchemaStore
  ceshuNotesStore: CeshuNotesStore
  ceshuTemplateStore: CeshuTemplateStore
  attrSystemStore: AttrSystemStore
  dataSync: CeshuDataSync
  agentDispatcher: SkillDispatcher
  agentBrain: AgentBrainService
  agentSessionStore: AgentSessionStore
  approvalBroker: AgentApprovalBroker
  llmClient: LlmClient
}

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
 * 由**活跃库目录**构造全部 store（A2-1：切换库时整体重建）。
 * 各 store 不再自己算路径，统一由库服务给出的 `libDir` 派生 —— 避免 Python 那种双源全局态。
 */
function buildStores(libDir: string): AppStores {
  const dbPath = join(libDir, 'mb-editor.db')
  const data = new DataService(new SqliteItemsRepository(dbPath))
  const ceshu = new CeshuManager(new CeshuStorage(join(libDir, 'ceshu')))
  const schema = new TypeSchemaStore(join(libDir, 'type_schema.json'))

  // Agent 技能调度器：注册内置技能，服务在构造时注入
  const dispatcher = new SkillDispatcher()
  dispatcher.register(createGameDataSkill({ dataService: data, typeSchemaStore: schema }))
  dispatcher.register(
    createCeshuSkill({
      ceshuManager: ceshu,
      exportDocument: exportCeshuDocument,
      exportDir: join(libDir, 'exports')
    })
  )
  dispatcher.register(createAskUserSkill())
  // 沙箱代码技能：SYSTEM 级风险，每次调用都需用户确认
  dispatcher.register(createCodeSkill())

  // Agent 会话与记忆随库隔离（A2-1 起落在 <库>/agent 下）
  const agentDir = join(libDir, 'agent')
  const sessionStore = new AgentSessionStore(agentDir)

  return {
    dbPath,
    dataService: data,
    ceshuManager: ceshu,
    typeSchemaStore: schema,
    ceshuNotesStore: new CeshuNotesStore(join(libDir, 'ceshu_notes')),
    ceshuTemplateStore: new CeshuTemplateStore(join(libDir, 'ceshu_templates')),
    attrSystemStore: new AttrSystemStore(join(libDir, 'attr_system.json')),
    dataSync: new CeshuDataSync(ceshu, data, schema),
    agentDispatcher: dispatcher,
    agentBrain: new AgentBrainService({
      dispatcher,
      sessionStore,
      memoryStore: new AgentMemoryStore(agentDir)
    }),
    agentSessionStore: sessionStore,
    approvalBroker: new AgentApprovalBroker(),
    llmClient: new LlmClient()
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

  // A2-1 一次性搬迁：平铺旧存储 → libraries/<初始库>/
  try {
    const migration = migrateFlatToLibraries(userDataDir, INITIAL_LIBRARY_NAME)
    if (migration !== null) {
      console.log(`[Library] 旧数据已搬入「${INITIAL_LIBRARY_NAME}」: ${migration.moved.join(', ')}`)
    }
  } catch (error) {
    // 搬迁失败：原文件保留，仍以新结构启动（该库从空开始），把原因打出来供排障
    console.error('[Library]', error instanceof Error ? error.message : String(error))
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