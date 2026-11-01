/*
 * 窄列条目行「点击落点」实测（Playwright chromium/Edge + 预览服务器 + 忠实 mbApi 桩）。
 *
 * 目的：验证「预览面板列窄到条目行 ~160px 时，行的几何中心会落在『删除』按钮上 → 误删」。
 * 判定方式不是读 CSS 推理，而是用 `document.elementFromPoint(行中心)` 看**默认点击**会命中谁。
 *
 * 运行：先 `npm run build`，再 `node preview/measure-row.mjs`
 * 端口：5201（避开 serve-preview 5188 / serve-e51 5199）
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = Number(process.env.MEASURE_PORT || 5201)
const BASE = `http://127.0.0.1:${PORT}/`
const HERE = import.meta.dirname
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const rows = Array.from({ length: 3 }, (_, i) => ({ id: 's' + (i + 1), data: { name: `技能 ${i + 1}` } }))
const seed = { title: '量测用策划书', systems: { skills: { enabled: true, name: '技能系统', data_type: 'skill', config: {} } }, data: { skill: rows } }

const server = spawn(process.execPath, [join(HERE, 'serve-e51.mjs'), String(PORT)], { stdio: 'ignore' })
await delay(700)
const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })

const report = {}
/** 守卫断言：行中心不得命中删除钮（命中 = 用户/自动化想选中条目却会删除） */
let guardFailed = []
try {
  for (const vp of [{ width: 1440, height: 1000, tag: 'wide-1440' }, { width: 1100, height: 800, tag: 'mid-1100' }, { width: 900, height: 700, tag: 'narrow-900' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    await page.addInitScript((s) => { window.__E51_SEED = s }, seed)
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="ceshu-home-panel"]', { timeout: 15000 })
    await page.click('[data-testid="home-card-open"]')
    await page.waitForSelector('[data-testid="ceshu-data-create"]', { timeout: 15000 })
    await page.waitForSelector('[data-testid="ceshu-data-item-row"]', { timeout: 15000 })

    const m = await page.evaluate(() => {
      const q = (s) => document.querySelector(s)
      const box = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: +r.x.toFixed(1), w: +r.width.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) }
      }
      const listCol = q('.ceshu-preview .list-column')
      const listEl = q('[data-testid="ceshu-data-list"]')
      const row = q('[data-testid="ceshu-data-item-row"]')
      const name = q('[data-testid="ceshu-data-item-row"] .item-name')
      const meta = q('[data-testid="ceshu-data-item-row"] .item-meta')
      const del = q('[data-testid="ceshu-data-item-row"] [data-testid="ceshu-data-delete"]')
      const rowBox = box(row)
      // 默认点击落点 = 行盒子的几何中心
      const hit = document.elementFromPoint(rowBox.cx, rowBox.cy)
      const hitTestId = hit ? (hit.closest('[data-testid]')?.getAttribute('data-testid') ?? hit.tagName) : null
      return {
        previewWidth: +(q('.ceshu-preview')?.getBoundingClientRect().width ?? 0).toFixed(1),
        listColWidth: +(listCol?.getBoundingClientRect().width ?? 0).toFixed(1),
        listWidth: +(listEl?.getBoundingClientRect().width ?? 0).toFixed(1),
        row: rowBox,
        name: box(name),
        nameText: name?.textContent ?? null,
        nameScrollW: name ? { scroll: name.scrollWidth, client: name.clientWidth } : null,
        meta: box(meta),
        del: box(del),
        hitAtRowCenter: hitTestId,
        rowScrollW: row ? { scroll: row.scrollWidth, client: row.clientWidth } : null
      }
    })
    report[vp.tag] = m
    console.log(`\n--- 视口 ${vp.tag} (${vp.width}×${vp.height}) ---`)
    console.log(`  .ceshu-preview=${m.previewWidth}  .list-column=${m.listColWidth}  .list=${m.listWidth}  行宽=${m.row?.w}`)
    console.log(`  名称盒 x=${m.name?.x} w=${m.name?.w} | 文本「${m.nameText}」`)
    console.log(`  id 盒   x=${m.meta?.x} w=${m.meta?.w}`)
    console.log(`  删除钮  x=${m.del?.x} w=${m.del?.w}`)
    console.log(`  行盒子  x=${m.row?.x} w=${m.row?.w} 中心=(${m.row?.cx},${m.row?.cy})`)
    console.log(`  ★ elementFromPoint(行中心) → ${m.hitAtRowCenter}`)
    console.log(`  行内溢出: scrollWidth=${m.rowScrollW?.scroll} clientWidth=${m.rowScrollW?.client}`)
    console.log(`  名称被截断: scrollWidth=${m.nameScrollW?.scroll} clientWidth=${m.nameScrollW?.client}`)
    // 守卫：行中心必须落在「能选中条目」的元素上（行本身或名称），绝不能是删除钮。
    // 注：narrow-900 下 elementFromPoint 可能被 AI 停靠栏遮挡（既有布局重叠，非本条问题），
    // 故只对删除钮做硬断言。
    if (m.hitAtRowCenter === 'ceshu-data-delete') {
      guardFailed.push(`${vp.tag}: 行中心命中删除钮`)
      console.log(`  ✗ 守卫失败：${vp.tag} 行中心命中删除钮（名称宽 ${m.name?.w}px，删除钮 x=${m.del?.x} w=${m.del?.w}）`)
    } else {
      console.log(`  ✓ 守卫通过：${vp.tag} 行中心未命中删除钮（名称宽 ${m.name?.w}px）`)
    }
    await page.screenshot({ path: join(SHOTS, `row-measure-${vp.tag}.png`) })
    await ctx.close()
  }
} finally {
  await browser.close()
  server.kill()
}

writeFileSync(join(SHOTS, 'row-measure-report.json'), JSON.stringify(report, null, 2), 'utf-8')
console.log('\n报告: preview/shots/row-measure-report.json')
if (guardFailed.length) {
  console.log(`\n===== 行点击落点守卫：失败 ${guardFailed.length} 项 =====\n  - ` + guardFailed.join('\n  - '))
  process.exit(1)
}
console.log('\n===== 行点击落点守卫：全部通过（行中心不会误触删除钮）=====')
