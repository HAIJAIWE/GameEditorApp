/*
 * UI 走查截图脚本（非生产代码）：起 e51 预览服务器（注入忠实桩 + 技能系统种子数据），
 * 用 Playwright + Edge 把核心界面拍下来，供人工/AI 评估「UI 要不要打磨」。
 * 运行：node preview/shoot-ui.mjs   （前置：out/renderer 已构建；无需真 Electron）
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 5288
const BASE = `http://127.0.0.1:${PORT}/`
const HERE = import.meta.dirname
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

// 种子：技能系统 + 3 条数据（驱动数据编辑器带内容渲染；章节用 preview-stub 默认全量骨架）
const SEED = {
  title: '仙侠示例（预览种子）',
  systems: { skills: { enabled: true, name: '技能系统', data_type: 'skill', config: {} } },
  data: {
    skill: [
      { id: 's1', data: { name: '御剑诀', damage_rate: 120, cooldown: 3, element: 'light_dark_wuxing' } },
      { id: 's2', data: { name: '焚天火', damage_rate: 200, cooldown: 6, element: 'fire' } },
      { id: 's3', data: { name: '玄冰咒', damage_rate: 90, cooldown: 2, element: 'ice' } }
    ]
  }
}

const server = spawn(process.execPath, [join(HERE, 'serve-e51.mjs'), String(PORT)], { stdio: 'ignore' })
await delay(800)

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '(no stack)')))
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

// DOM 诊断：抓文本副本 + 可点击元素盒模型 + 截断/溢出检测（无需看图片即可评估打磨点）
const DIAG = []
async function diagnose(tag) {
  const data = await page.evaluate(() => {
    const out = {}
    const de = document.documentElement
    out.horizontalOverflow = de.scrollWidth > de.clientWidth + 1
    out.docScrollWidth = de.scrollWidth
    out.docClientWidth = de.clientWidth
    const clickables = [...document.querySelectorAll('button, a, [role="button"], .btn, [data-testid$="-btn"]')]
    out.clickables = clickables.slice(0, 120).map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ')
      const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
      return {
        tag: el.tagName,
        text: text.slice(0, 80),
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        clipped, color: cs.color, fontSize: cs.fontSize
      }
    })
    out.clippedCount = out.clickables.filter((c) => c.clipped).length
    out.testids = [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))]
    // 主内容区：取视口内面积最大的可见块（粗略估算留白）
    const main = document.querySelector('main, [data-testid="ceshu-main"], #root > *') || document.body
    const mr = main.getBoundingClientRect()
    out.mainRect = { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) }
    return out
  })
  DIAG.push({ tag, ...data })
  return data
}

await page.addInitScript((s) => { window.__E51_SEED = s }, SEED)
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-testid="ceshu-home-panel"]', { timeout: 15000 })
await page.screenshot({ path: join(SHOTS, 'ui-01-home.png') })
await diagnose('home')
console.log('shot: 首页')

await page.click('[data-testid="home-card-open"]')
await delay(1500)
await page.screenshot({ path: join(SHOTS, 'ui-02-editor.png') })
const editorText = await page.evaluate(() => (document.querySelector('[data-testid="ceshu-editor"]') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 2000))
await diagnose('editor')
console.log('shot: 编辑器（点开后）')

// 诊断：当前可见的 testid（找数据编辑器入口）
const ids = await page.$$eval('[data-testid]', (els) => [...new Set(els.map((e) => e.getAttribute('data-testid')))])
console.log('可见 testid:', JSON.stringify(ids.slice(0, 40)))

// 数据编辑器：优先等内嵌面板的「新建」按钮，否则切到顶部「数据编辑」页签
const hasCreate = ids.includes('ceshu-data-create')
if (!hasCreate) {
  console.log('内嵌面板无新建按钮 → 切顶部「数据编辑」页签')
  const tab = page.locator('[data-testid="middle-tab-data"]').first()
  if (await tab.count()) {
    await tab.click()
  } else {
    await page.getByText('数据编辑', { exact: true }).first().click().catch(() => {})
  }
  await delay(1200)
}
await page.screenshot({ path: join(SHOTS, 'ui-03-data-tab.png') })
await diagnose('data-tab')
console.log('shot: 数据编辑')

// 数据编辑器整窗展开态（如果存在展开按钮）
const expandBtn = await page.$('[data-testid="ceshu-data-expand"]')
if (expandBtn) {
  await expandBtn.click()
  await delay(500)
  await page.screenshot({ path: join(SHOTS, 'ui-04-data-expanded.png') })
  console.log('shot: 数据编辑器展开')
  const collapse = await page.$('[data-testid="ceshu-data-expand"]')
  if (collapse) await collapse.click()
  await delay(300)
}

// 右键数据行 → 菜单
const row = await page.$('[data-testid="ceshu-data-item-row"]')
if (row) {
  await row.click({ button: 'right' })
  await page.waitForSelector('[data-testid="ceshu-data-menu"]', { timeout: 5000 })
  await page.screenshot({ path: join(SHOTS, 'ui-05-rightclick-menu.png') })
  console.log('shot: 右键菜单')
} else {
  console.log('（无数据行，跳过右键菜单）')
}

console.log(`\n页面错误: ${errs.length ? errs.slice(0, 5).join(' | ') : '(none)'}`)

// 写结构化诊断报告（供无图评估打磨点）
const reportPath = join(SHOTS, 'ui-report.json')
import('node:fs').then(({ writeFileSync }) => {
  writeFileSync(reportPath, JSON.stringify({ errs: errs.slice(0, 10), editorText, diag: DIAG }, null, 2))
  console.log('诊断报告:', reportPath)
})
await browser.close()
server.kill()
console.log('完成，截图在 preview/shots/ui-0x-*.png')
