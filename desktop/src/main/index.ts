import { join } from 'node:path'

import { app, BrowserWindow, shell } from 'electron'

import { AttrSystemStore } from './attr/attrSystemStore'
import { CeshuManager } from './ceshu/manager'
import { CeshuNotesStore } from './ceshu/notesStore'
import { CeshuTemplateStore } from './ceshu/templateStore'
import { CeshuStorage } from './ceshu/storage'
import { DataService } from './data/service'
import { SqliteItemsRepository } from './data/sqliteRepo'
import { registerIpcHandlers } from './ipc'
import { LlmClient } from './llm/client'
import { TypeSchemaStore } from './schema/store'

// E2E / 便携模式：允许外部指定 userData 目录（隔离测试数据）
const userDataOverride = process.env['MB_USER_DATA_DIR']
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}

const rendererDevUrl = process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
let dataService: DataService | null = null

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

  registerIpcHandlers({
    dataService,
    ceshuManager: new CeshuManager(new CeshuStorage(join(app.getPath('userData'), 'ceshu'))),
    ceshuNotesStore: new CeshuNotesStore(join(app.getPath('userData'), 'ceshu_notes')),
    ceshuTemplateStore: new CeshuTemplateStore(join(app.getPath('userData'), 'ceshu_templates')),
    typeSchemaStore: new TypeSchemaStore(join(app.getPath('userData'), 'type_schema.json')),
    attrSystemStore: new AttrSystemStore(join(app.getPath('userData'), 'attr_system.json')),
    llmClient: new LlmClient(),
    getAppInfo: () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      dbPath
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  dataService?.dispose()
  dataService = null
})