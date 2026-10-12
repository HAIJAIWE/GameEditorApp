import { BrowserWindow } from 'electron'

import type { CeshuDocument } from '../../../shared/ceshuConstants'

import { renderCeshuHtml } from './html'

/**
 * PDF 渲染：隐藏窗口加载导出 HTML，用 Electron 内置 Chromium printToPDF 输出。
 * 由 Chromium 排版，天然支持中文与与 HTML 导出完全一致的版式（Phase 1 预演结论）。
 */
export async function renderCeshuPdf(doc: CeshuDocument): Promise<Buffer> {
  const html = renderCeshuHtml(doc)
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    return await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  } finally {
    win.destroy()
  }
}