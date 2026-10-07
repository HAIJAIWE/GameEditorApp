import { chromium } from 'playwright'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const b = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
p.on('pageerror', e => errs.push('pageerror: ' + e.message))
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })

await p.goto('http://127.0.0.1:5188/', { waitUntil: 'domcontentloaded' })
await p.waitForSelector('[data-testid="ceshu-home-panel"]', { timeout: 15000 })

// (1) 链接探针：readByPath 经 stub 回读成功 data URL（证明 renderer→stub 链路连通，
//     且成功路径能产出可渲染的 <img> data URL —— 即已保存图片路径能在 LazyImage 中显示）
const probe = await p.evaluate(async () => {
  const api = window.mbApi
  const out = { hasImagesReadByPath: !!(api && api.images && typeof api.images.readByPath === 'function') }
  if (out.hasImagesReadByPath) {
    const res = await api.images.readByPath({ path: 'C:/saved/hero.png' })
    out.path = res.path
    out.bytes = res.bytes
    out.reason = res.reason
    out.dataUrlOk = typeof res.dataUrl === 'string' && res.dataUrl.startsWith('data:image/')
  }
  return out
})
console.log('READ_BY_PATH_PROBE:', JSON.stringify(probe))

// (2) 真实面板用到 images 通道：工具 → 清理未使用图片（证明 images 通道被真实 UI 消费、无崩溃）
let cleanupTestids = []
let cleanupErr = null
try {
  await p.click('[data-testid="menu-title-tools"]')
  await p.waitForSelector('[data-testid="menuitem-tools-cleanupUnusedImages"]', { timeout: 8000 })
  await p.click('[data-testid="menuitem-tools-cleanupUnusedImages"]')
  await p.waitForTimeout(1000)
  const ids = await p.evaluate(() => [...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')))
  cleanupTestids = ids.filter(i => i && i.includes('cleanup'))
} catch (e) {
  cleanupErr = String(e && e.message || e)
}
console.log('CLEANUP_PANEL_TESTIDS:', JSON.stringify(cleanupTestids))
console.log('CLEANUP_ERR:', cleanupErr || '(none)')

const readCalls = await p.evaluate(() => window.__imageReadCalls || [])
console.log('READ_BY_PATH_CALLS:', readCalls.length, JSON.stringify(readCalls))

console.log('ERRORS:', errs.length ? errs.join(' | ') : '(none)')
await b.close()
