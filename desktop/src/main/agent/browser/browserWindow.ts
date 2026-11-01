/**
 * 隐藏浏览器窗口驱动（对齐 dsh `browser-use` 的可用子集，替代 Playwright）。
 *
 * 用 Electron 的 `BrowserWindow({ show: false })` 加载页面，经 `webContents` 做：
 * 读标题/正文/HTML、执行页面 JS（点击/填表）、截图。**不引 Playwright、不装浏览器**。
 *
 * 复用同一个隐藏窗口（每次调用 `loadURL` 导航）；窗口被销毁时重建。
 * 注意：`executeJavaScript` 在页面上下文执行，能力等同该页脚本——风险由技能层（SYSTEM）把关。
 */

import { writeFileSync } from 'node:fs'
import { BrowserWindow } from 'electron'

let hidden: BrowserWindow | null = null

function getWindow(): BrowserWindow {
  if (hidden === null || hidden.isDestroyed()) {
    hidden = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
  }
  return hidden
}

/** 关闭隐藏窗口（退出/切换时调用） */
export function closeBrowserWindow(): void {
  if (hidden !== null && !hidden.isDestroyed()) hidden.destroy()
  hidden = null
}

export interface LoadedPage {
  title: string
  text: string
  html: string
}

/** 加载页面并取标题/正文/HTML */
export async function loadPage(url: string): Promise<LoadedPage> {
  const win = getWindow()
  await win.loadURL(url)
  const [title, text, html] = await Promise.all([
    win.webContents.executeJavaScript('document.title'),
    win.webContents.executeJavaScript('document.body ? document.body.innerText : ""'),
    win.webContents.executeJavaScript('document.documentElement ? document.documentElement.outerHTML : ""')
  ])
  return {
    title: typeof title === 'string' ? title : '',
    text: typeof text === 'string' ? text : '',
    html: typeof html === 'string' ? html : ''
  }
}

/** 加载页面后执行 JS（点击/填表/取值），返回可 JSON 化的结果 */
export async function evalPage(url: string, code: string): Promise<unknown> {
  const win = getWindow()
  await win.loadURL(url)
  return win.webContents.executeJavaScript(code)
}

/** 加载页面并截图保存 PNG */
export async function screenshotPage(url: string, path: string): Promise<void> {
  const win = getWindow()
  await win.loadURL(url)
  const image = await win.webContents.capturePage()
  writeFileSync(path, image.toPNG())
}
