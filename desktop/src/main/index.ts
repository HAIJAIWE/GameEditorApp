import { join } from 'node:path'

import { app, BrowserWindow, shell, type Tray } from 'electron'

import { AgentApprovalBroker } from './agent/approvalBroker'
import { AgentBrainService } from './agent/brainService'
import { AgentMemoryStore } from './agent/memoryStore'
import { AgentSessionStore } from './agent/sessionStore'
import { SkillDispatcher } from './agent/dispatcher'
import { createCeshuSkill } from './agent/skills/ceshuSkill'
import { createCodeSkill } from './agent/skills/codeSkill'
import { createGameDataSkill } from './agent/skills/gameDataSkill'
import { AttrSystemStore } from './attr/attrSystemStore'
import { CeshuManager } from './ceshu/manager'
import { CeshuDataSync } from './ceshu/dataSync'
import { CeshuNotesStore } from './ceshu/notesStore'
import { CeshuTemplateStore } from './ceshu/templateStore'
import { CeshuStorage } from './ceshu/storage'
import { DataService } from './data/service'
import { SqliteItemsRepository } from './data/sqliteRepo'
import { registerIpcHandlers } from './ipc'
import { LlmClient } from './llm/client'
import { TypeSchemaStore } from './schema/store'
import { disposeTray, registerShortcuts, setupTray, unregisterShortcuts } from './tray'

// E2E / 便携模式：允许外部指定 userData 目录（隔离测试数据）
const userDataOverride = process.env['MB_USER_DATA_DIR']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
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

app.whenReady().then(() => {
  const dbPath = join(app.getPath('userData'), 'mb-editor.db')
  dataService = new DataService(new SqliteItemsRepository(dbPath))
  const ceshuManager = new CeshuManager(new CeshuStorage(join(app.getPath('userData'), 'ceshu')))
  const typeSchemaStore = new TypeSchemaStore(join(app.getPath('userData'), 'type_schema.json'))

  // Agent 技能调度器（A1-1）：注册最小内置技能，服务在构造时注入
  const agentDispatcher = new SkillDispatcher()
  agentDispatcher.register(createGameDataSkill({ dataService, typeSchemaStore }))
  agentDispatcher.register(createCeshuSkill({ ceshuManager }))
  // 沙箱代码技能（A1-5）：SYSTEM 级风险，每次调用都需用户确认
  agentDispatcher.register(createCodeSkill())
  // Agent 会话与记忆（A1-3）：统一落在 userData/agent 下；A2-1 引入多库后只改这一处
  const agentDir = join(app.getPath('userData'), 'agent')
  const agentSessionStore = new AgentSessionStore(agentDir)
  const agentBrain = new AgentBrainService({
    dispatcher: agentDispatcher,
    sessionStore: agentSessionStore,
    memoryStore: new AgentMemoryStore(agentDir)
  })
  const approvalBroker = new AgentApprovalBroker()

  registerIpcHandlers({
    dataService,
    ceshuManager,
    ceshuNotesStore: new CeshuNotesStore(join(app.getPath('userData'), 'ceshu_notes')),
    ceshuTemplateStore: new CeshuTemplateStore(join(app.getPath('userData'), 'ceshu_templates')),
    typeSchemaStore,
    attrSystemStore: new AttrSystemStore(join(app.getPath('userData'), 'attr_system.json')),
    dataSync: new CeshuDataSync(ceshuManager, dataService, typeSchemaStore),
    agentDispatcher,
    agentBrain,
    agentSessionStore,
    approvalBroker,
    llmClient: new LlmClient(),
    getAppInfo: () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      dbPath
    })
  })

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