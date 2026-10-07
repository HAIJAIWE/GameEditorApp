/*
 * E51 渲染层交互 · 运行时验证（Playwright chromium/Edge + 预览服务器 + 忠实 mbApi 桩）。
 *
 * 证明目标（逐条给断言输出）：
 *   T1 超限拦截：超限时「新建」先弹横幅，取消不建、继续才建。
 *   T2 未超限不打扰：1/2 上限时直接创建。
 *   T3 无约束不打扰：系统在册但 config 无上限字段时直接创建。
 *   T4 右键重命名闭环：菜单 4 项 → 重命名输入聚焦 → 提交调用 updateItem 且名字已 trim。
 *   T5 F2 + 空白名取消：F2 进入输入框；空白名回车**不**调用 updateItem，名字不变。
 *
 * 运行：先 `npm run build`，再 `node preview/verify-e51.mjs`（脚本自带服务器）。
 * 端口：5199（与 serve-preview 的 5188 隔离）。
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 5199
const BASE = `http://127.0.0.1:${PORT}/`
const HERE = import.meta.dirname
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const SEL = {
  home: '[data-testid="ceshu-home-panel"]',
  open: '[data-testid="home-card-open"]',
  create: '[data-testid="ceshu-data-create"]',
  rows: '[data-testid="ceshu-data-item-row"]',
  rowName: '[data-testid="ceshu-data-item-row"] .item-name',
  warning: '[data-testid="ceshu-data-count-warning"]',
  warningText: '[data-testid="ceshu-data-count-warning"] .count-warning-text',
  cont: '[data-testid="ceshu-data-count-continue"]',
  cancel: '[data-testid="ceshu-data-count-cancel"]',
  list: '[data-testid="ceshu-data-list"]',
  menu: '[data-testid="ceshu-data-menu"]',
  menuRename: '[data-testid="ceshu-data-menu-rename"]',
  renameInput: '[data-testid="ceshu-data-rename-input"]'
}

const results = []
function check(name, cond, detail) {
  const pass = !!cond
  results.push({ name, pass, detail: detail ?? '' })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail !== undefined ? `  :: ${detail}` : ''}`)
}

const skill = (n) => Array.from({ length: n }, (_, i) => ({ id: 's' + (i + 1), data: { name: `技能 ${i + 1}` } }))
const systems = (config) => ({
  skills: { enabled: true, name: '技能系统', data_type: 'skill', config }
})

// ---- 起服务器 ----
const server = spawn(process.execPath, [join(HERE, 'serve-e51.mjs'), String(PORT)], { stdio: 'inherit' })
await delay(700)

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })

/** 每条用例：独立 context + addInitScript 种桩 → 首页打开策划书 → 等到数据编辑器就绪 */
async function runCase(tag, seed, fn, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await page.addInitScript((s) => { window.__E51_SEED = s }, seed)
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(SEL.home, { timeout: 15000 })
    await page.click(SEL.open)
    await page.waitForSelector(SEL.create, { timeout: 15000 })
    await fn(page)
  } catch (e) {
    check(`${tag} · 未抛异常`, false, String((e && e.message) || e))
  } finally {
    console.log(`   [${tag}] 页面错误: ${errs.length ? errs.join(' | ') : '(none)'}`)
    await ctx.close()
  }
}

const rowCount = (p) => p.$$eval(SEL.rows, (els) => els.length)
const namesOf = (p) => p.$$eval(SEL.rowName, (els) => els.map((e) => e.textContent))
const callsOf = (p, key) => p.evaluate((k) => (window.__calls || {})[k] || [], key)
const exists = async (p, sel) => (await p.$$(sel)).length > 0

try {
  // ================= T0 既有 testid 未回归（空/非空两态） =================
  await runCase('T0', { title: '验证用策划书', systems: systems({}), data: { skill: [] } }, async (page) => {
    check('T0 既有 testid：ceshu-data-search 存在', await exists(page, '[data-testid="ceshu-data-search"]'))
    check('T0 既有 testid：ceshu-data-create 存在', await exists(page, SEL.create))
    check('T0 既有 testid：ceshu-data-empty（空态）存在', await exists(page, '[data-testid="ceshu-data-empty"]'))
    await page.click(SEL.create)
    await page.waitForSelector(SEL.rows, { timeout: 5000 })
    check('T0 既有 testid：ceshu-data-item-row 存在', await exists(page, SEL.rows))
    check('T0 既有 testid：ceshu-data-delete 存在', await exists(page, '[data-testid="ceshu-data-delete"]'))
  })

  // ================= T1 超限拦截 =================
  await runCase('T1', { title: '验证用策划书', systems: systems({ skill_count: 2 }), data: { skill: skill(2) } }, async (page) => {
    check('T1 前置：播种 2 条', (await rowCount(page)) === 2, 'rows=' + (await rowCount(page)))
    await page.click(SEL.create)
    await page.waitForSelector(SEL.warning, { timeout: 5000 })
    const text = await page.$eval(SEL.warningText, (e) => e.textContent)
    check('T1 点「新建」出现超限横幅', await exists(page, SEL.warning))
    check('T1 横幅含「策划书「技能系统」规定数量上限为 2」', text.includes('策划书「技能系统」规定数量上限为 2'), JSON.stringify(text))
    check('T1 横幅含「当前已有 2 个，正在创建第 3 个。」', text.includes('当前已有 2 个，正在创建第 3 个。'), '')
    check('T1 未直接创建（createItem 未被调用）', (await callsOf(page, 'createItem')).length === 0, 'createItem=' + (await callsOf(page, 'createItem')).length)
    await page.screenshot({ path: join(SHOTS, 'e51-t1-warning.png') })

    await page.click(SEL.cancel)
    await page.waitForTimeout(300)
    check('T1 取消后横幅消失', !(await exists(page, SEL.warning)))
    check('T1 取消后条目数仍为 2', (await rowCount(page)) === 2, 'rows=' + (await rowCount(page)))

    await page.click(SEL.create)
    await page.waitForSelector(SEL.warning, { timeout: 5000 })
    await page.click(SEL.cont)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="ceshu-data-item-row"]').length === 3, { timeout: 5000 })
    check('T1 点「继续创建」后条目数变 3', (await rowCount(page)) === 3, 'rows=' + (await rowCount(page)))
    check('T1 继续后 createItem 恰被调用 1 次', (await callsOf(page, 'createItem')).length === 1, 'createItem=' + (await callsOf(page, 'createItem')).length)
    await page.screenshot({ path: join(SHOTS, 'e51-t1-created.png') })
  })

  // ================= T2 未超限不打扰 =================
  await runCase('T2', { title: '验证用策划书', systems: systems({ skill_count: 2 }), data: { skill: skill(1) } }, async (page) => {
    check('T2 前置：播种 1 条', (await rowCount(page)) === 1, 'rows=' + (await rowCount(page)))
    await page.click(SEL.create)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="ceshu-data-item-row"]').length === 2, { timeout: 5000 })
    check('T2 点「新建」直接创建（rows 变 2）', (await rowCount(page)) === 2, 'rows=' + (await rowCount(page)))
    check('T2 未出现超限横幅', !(await exists(page, SEL.warning)))
    check('T2 createItem 被调用 1 次', (await callsOf(page, 'createItem')).length === 1, 'createItem=' + (await callsOf(page, 'createItem')).length)
  })

  // ================= T3 无约束不打扰（系统在册但无上限字段） =================
  await runCase('T3', { title: '验证用策划书', systems: systems({}), data: { skill: skill(1) } }, async (page) => {
    check('T3 前置：播种 1 条', (await rowCount(page)) === 1, 'rows=' + (await rowCount(page)))
    await page.click(SEL.create)
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="ceshu-data-item-row"]').length === 2, { timeout: 5000 })
    check('T3 config 无上限字段 ⇒ 直接创建（rows 变 2）', (await rowCount(page)) === 2, 'rows=' + (await rowCount(page)))
    check('T3 未出现超限横幅', !(await exists(page, SEL.warning)))
  })

  // ================= T4 右键重命名闭环 =================
  await runCase('T4', { title: '验证用策划书', systems: systems({ skill_count: 9 }), data: { skill: skill(3) } }, async (page) => {
    await page.locator(SEL.rows).first().click({ button: 'right' })
    await page.waitForSelector(SEL.menu, { timeout: 5000 })
    const items = await page.$$eval('[data-testid^="ceshu-data-menu-"]', (els) => els.map((e) => e.getAttribute('data-testid')))
    check('T4 右键出现菜单且含 4 项', items.length === 4, JSON.stringify(items))
    check('T4 菜单含 重命名/编辑/复制/删除', ['rename', 'edit', 'copy', 'delete'].every((s) => items.includes('ceshu-data-menu-' + s)), JSON.stringify(items))
    await page.screenshot({ path: join(SHOTS, 'e51-t4-menu.png') })

    await page.click(SEL.menuRename)
    await page.waitForSelector(SEL.renameInput, { timeout: 5000 })
    check('T4 点「重命名」后输入框已聚焦', await page.$eval(SEL.renameInput, (el) => document.activeElement === el))

    await page.fill(SEL.renameInput, '  新名  ')
    await page.press(SEL.renameInput, 'Enter')
    await page.waitForFunction(() => (window.__calls && window.__calls.updateItem.length > 0), { timeout: 5000 })
    const calls = await callsOf(page, 'updateItem')
    const last = calls[calls.length - 1]
    check('T4 updateItem 被调用', calls.length > 0, 'count=' + calls.length)
    check('T4 updateItem 的 data.name === 新名（已 trim）', last && last.data && last.data.name === '新名', JSON.stringify(last))
    check('T4 updateItem 的 id === s1', last && last.id === 's1', 'id=' + (last && last.id))
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="ceshu-data-item-row"] .item-name')
      return el && el.textContent === '新名'
    }, { timeout: 5000 })
    const names = await namesOf(page)
    check('T4 列表行文本更新为新名', names.includes('新名'), JSON.stringify(names))
    await page.screenshot({ path: join(SHOTS, 'e51-t4-renamed.png') })
  })

  // ================= T5 F2 + 空白名取消 =================
  await runCase('T5', { title: '验证用策划书', systems: systems({ skill_count: 9 }), data: { skill: skill(3) } }, async (page) => {
    // 注意：预览面板列很窄（行 ~160px），行中心会命中「删除」按钮——必须点 .item-name 才选中而非误删
    await page.locator('[data-testid="ceshu-data-item-row"] .item-name').first().click()
    await page.waitForTimeout(150)
    check('T5 点名后该行被选中', (await page.$$eval('[data-testid="ceshu-data-item-row"].selected', (e) => e.length)) === 1)
    await page.focus(SEL.list)
    await page.keyboard.press('F2')
    await page.waitForSelector(SEL.renameInput, { timeout: 5000 })
    check('T5 按 F2 后输入框出现且聚焦', await page.$eval(SEL.renameInput, (el) => document.activeElement === el))
    check('T5 输入框预填原名', (await page.$eval(SEL.renameInput, (el) => el.value)) === '技能 1', 'value=' + (await page.$eval(SEL.renameInput, (el) => el.value)))

    await page.fill(SEL.renameInput, '')
    await page.press(SEL.renameInput, 'Enter')
    await page.waitForTimeout(400)
    const calls = await callsOf(page, 'updateItem')
    check('T5 空白名回车后 updateItem 未被调用', calls.length === 0, 'count=' + calls.length + ' ' + JSON.stringify(calls))
    const names = await namesOf(page)
    check('T5 名称保持原值（技能 1）', names[0] === '技能 1', JSON.stringify(names))
    await page.screenshot({ path: join(SHOTS, 'e51-t5-after-blank.png') })
  })

  // ================= T6 右键菜单视口 clamp 举证 =================
  // 说明：小视口下三栏布局会重叠，物理鼠标点不到行右缘（会命中 AI 停靠栏/页脚）。
  // 故在**行元素上派发真实 contextmenu 事件**（走同一个 React onContextMenu 处理器），
  // 坐标落在视口右下角 → 必然命中 clamp 分支。另设 (300,300) 对照组证明正常位置不被挪动。
  await runCase(
    'T6',
    { title: '验证用策划书', systems: systems({ skill_count: 9 }), data: { skill: skill(3) } },
    async (page) => {
      const IW = await page.evaluate(() => innerWidth)
      const IH = await page.evaluate(() => innerHeight)
      const expLeft = IW - 104 - 8 // CONTEXT_MENU_WIDTH + MARGIN
      const expTop = IH - 122 - 8 // CONTEXT_MENU_HEIGHT + MARGIN

      // 触发组：右下角坐标
      const raw = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="ceshu-data-item-row"]')
        let seen = null
        window.addEventListener('contextmenu', (e) => { seen = { x: e.clientX, y: e.clientY } }, { capture: true, once: true })
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 2, clientY: innerHeight - 2 }))
        return seen
      })
      await page.waitForSelector(SEL.menu, { timeout: 5000 })
      const rect = await page.$eval(SEL.menu, (el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }
      })
      check('T6 触发组：原始 clientX 落在 clamp 区间内', raw.x > expLeft, `clientX=${raw.x} > 阈值=${expLeft}`)
      check('T6 触发组：原始 clientY 落在 clamp 区间内', raw.y > expTop, `clientY=${raw.y} > 阈值=${expTop}`)
      check('T6 触发组：left 被夹到 IW-112', Math.abs(rect.left - expLeft) < 0.5, `left=${rect.left} 期望=${expLeft}（原始 ${raw.x}→差 ${(raw.x - rect.left).toFixed(1)}px）`)
      check('T6 触发组：top 被夹到 IH-130', Math.abs(rect.top - expTop) < 0.5, `top=${rect.top} 期望=${expTop}（原始 ${raw.y}→差 ${(raw.y - rect.top).toFixed(1)}px）`)
      check('T6 触发组：菜单不出界 right<=IW 且 bottom<=IH 且 left/top>=0', rect.right <= IW + 0.5 && rect.bottom <= IH + 0.5 && rect.left >= 0 && rect.top >= 0, `rect=[${rect.left},${rect.top},${rect.right},${rect.bottom}] IW=${IW} IH=${IH}`)
      // 反事实（用实测菜单尺寸算）：不 clamp 会怎样
      check('T6 反事实：不 clamp 则右越界', raw.x + rect.w > IW, `不 clamp right=${(raw.x + rect.w).toFixed(1)} > IW=${IW}（越界 ${(raw.x + rect.w - IW).toFixed(1)}px）；实际 right=${rect.right}`)
      check('T6 反事实：不 clamp 则下越界', raw.y + rect.h > IH, `不 clamp bottom=${(raw.y + rect.h).toFixed(1)} > IH=${IH}（越界 ${(raw.y + rect.h - IH).toFixed(1)}px）；实际 bottom=${rect.bottom}`)
      await page.screenshot({ path: join(SHOTS, 'e51-t6-clamp.png') })

      // 对照组：正常位置（300,300，均在阈值内）→ 菜单应原地不挪
      await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
      const raw2 = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="ceshu-data-item-row"]')
        let seen = null
        window.addEventListener('contextmenu', (e) => { seen = { x: e.clientX, y: e.clientY } }, { capture: true, once: true })
        row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }))
        return seen
      })
      await page.waitForSelector(SEL.menu, { timeout: 5000 })
      const rect2 = await page.$eval(SEL.menu, (el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, top: r.top }
      })
      check('T6 对照组：正常位置菜单未被挪动', Math.abs(rect2.left - raw2.x) < 0.5 && Math.abs(rect2.top - raw2.y) < 0.5, `raw=(${raw2.x},${raw2.y}) menu=(${rect2.left},${rect2.top})`)
    },
    { width: 700, height: 500 }
  )
} finally {
  await browser.close()
  server.kill()
}

const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\n===== E51 渲染验证汇总: ${passed}/${results.length} 通过 =====`)
if (failed.length) console.log('未通过:\n' + failed.map((f) => `  - ${f.name} :: ${f.detail}`).join('\n'))
writeFileSync(join(SHOTS, 'e51-report.json'), JSON.stringify({ passed, total: results.length, results }, null, 2), 'utf-8')
console.log('报告: preview/shots/e51-report.json')
process.exit(failed.length ? 1 : 0)
