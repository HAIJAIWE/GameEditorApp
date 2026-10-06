// Screenshot the built renderer via Edge (Playwright), driving the faithful mbApi stub.
// Reloads per panel to guarantee clean overlay state. Logs console/page errors as proof of mount.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://127.0.0.1:5188/'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const OUT = join(import.meta.dirname, 'shots')
mkdirSync(OUT, { recursive: true })

const steps = [
  { name: 'home', wait: 'ceshu-home-panel' },
  { name: 'agent-editor', trigger: { type: 'click', sel: 'menubar-agent' }, wait: 'agent-editor-panel' },
  { name: 'settings', menu: 'menu-title-settings', item: 'menuitem-settings-open', wait: 'settings-panel' },
  { name: 'about', menu: 'menu-title-help', item: 'menuitem-help-about', wait: 'about-panel' },
  { name: 'shortcuts', menu: 'menu-title-help', item: 'menuitem-help-shortcuts', wait: 'shortcuts-panel' },
  { name: 'clearAll', menu: 'menu-title-edit', item: 'menuitem-edit-clearAll', wait: 'clearall-panel' },
  { name: 'keywordTemplates', menu: 'menu-title-tools', item: 'menuitem-tools-keywordTemplates', wait: 'keyword-template-panel' },
  { name: 'cleanupImages', menu: 'menu-title-tools', item: 'menuitem-tools-cleanupUnusedImages', wait: 'cleanup-images-panel' },
]

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const tid = (id) => `[data-testid="${id}"]`

for (const s of steps) {
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(tid('menu-title-file'), { timeout: 15000 })
    await page.waitForSelector(tid('ceshu-home-panel'), { timeout: 15000 })
    if (s.trigger) {
      await page.click(tid(s.trigger.sel), { timeout: 8000 })
      await page.waitForSelector(tid(s.wait), { timeout: 8000 })
    } else if (s.menu) {
      await page.click(tid(s.menu), { timeout: 8000 })
      await page.waitForSelector(tid(s.item), { timeout: 8000 })
      await page.click(tid(s.item), { timeout: 8000 })
      await page.waitForSelector(tid(s.wait), { timeout: 8000 })
    } else {
      await page.waitForSelector(tid(s.wait), { timeout: 8000 })
    }
    await page.waitForTimeout(400)
    const file = join(OUT, `${s.name}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log(`OK  ${s.name}.png  (wait=${s.wait})`)
  } catch (e) {
    console.log(`FAIL ${s.name}: ${e.message}`)
  }
}

console.log('--- console/page errors during run ---')
console.log(errors.length ? errors.join('\n') : '(none — clean mount)')
await browser.close()
