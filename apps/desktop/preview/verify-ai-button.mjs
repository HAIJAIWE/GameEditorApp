/*
 * 行为验证（非生产代码）：点「AI 助手」按钮后，焦点应落到右侧常驻 dock 的输入框
 * `[data-testid="digital-input"]`，而不是只弹一句「已在右侧」的提示。
 * 运行：node preview/verify-ai-button.mjs
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 5289
const BASE = `http://127.0.0.1:${PORT}/`
const HERE = import.meta.dirname

const server = spawn(process.execPath, [join(HERE, 'serve-e51.mjs'), String(PORT)], { stdio: 'ignore' })
await delay(800)

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="ceshu-home-panel"]', { timeout: 15000 })

// 先清空焦点，确保点击前的 activeElement 不是输入框
await page.evaluate(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})
await delay(200)

const before = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName)
await page.click('[data-testid="menubar-ai"]')
await delay(300)
const after = await page.evaluate(() => ({
  testid: document.activeElement?.getAttribute('data-testid') ?? null,
  tag: document.activeElement?.tagName ?? null
}))

console.log('点击前焦点:', before)
console.log('点击后焦点:', JSON.stringify(after))

const focusOk = after.testid === 'digital-input'
console.log(focusOk ? '✅ AI 助手按钮把焦点送到对话输入框' : '❌ 焦点未落到 digital-input')

// 顶栏不应再有独立「智能体」按钮（能力清单已并入 dock）
const agentBtnGone = (await page.$('[data-testid="menubar-agent"]')) === null
console.log(agentBtnGone ? '✅ 顶栏已无独立「智能体」按钮' : '❌ 顶栏仍有 menubar-agent')

// 点 dock 头部的「能力清单」应打开工具清单面板
const capBtn = await page.$('[data-testid="digital-capabilities"]')
let capOk = false
if (capBtn === null) {
  console.log('❌ 找不到 digital-capabilities')
} else {
  await capBtn.click()
  try {
    await page.waitForSelector('[data-testid="agent-editor-scope-note"]', { timeout: 5000 })
    capOk = true
  } catch {
    capOk = false
  }
  console.log(capOk ? '✅ 能力清单按钮打开了工具清单面板' : '❌ 能力清单未打开面板')
}

console.log('页面错误:', errs.length ? errs.join(' | ') : '(none)')

const ok = focusOk && agentBtnGone && capOk && errs.length === 0
await browser.close()
server.kill()
process.exitCode = ok ? 0 : 1
