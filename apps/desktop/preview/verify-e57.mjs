/*
 * E57 渲染层交互 · 运行时验证（Playwright chromium/Edge + 预览服务器 + 忠实 mbApi 桩）。
 *
 * 证明目标（逐条给断言输出）：
 *   T1 菜单收口：「工具 → 关系图」已挂真动作（testid 在场）；PyQt 死入口「内容关联」子菜单**已删除**；
 *      相邻的「数据分析」子菜单与「数据关联预览」仍在（证明是定点删除、非整块误删）。
 *   T2 关系图面板：类型切换 → 主体切换 → 主体信息卡 → 关联数据表（5 列）逐格取值；
 *      未解析 token 仍出一行（类型/ID 显示「-」）；空关联时出空态而非空表。
 *   T3 未解析行双击**不**跳转（面板留在原地）。
 *   T4 已解析行双击**跳转**（面板关闭 —— 与 PyQt 双击跳转同义）。
 *   T5 `dialog` 字段控件：任务表单的 `dialog_id` 渲染为**下拉**（此前是可编辑文本框 = 假控件）；
 *      值指向已删除对话时保留「（已失效）」选项，不静默清空。
 *
 * 运行：先 `npm run build`，再 `node preview/verify-e57.mjs`（脚本自带服务器）。
 * 端口：5200（与 serve-preview 的 5188 / serve-e51 的 5199 隔离）。
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 5200
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
  menuTools: '[data-testid="menu-title-tools"]',
  itemRelationGraph: '[data-testid="menuitem-tools-relationGraph"]',
  itemReferences: '[data-testid="menuitem-tools-references"]',
  submenuLabel: '.menu-submenu-label',
  panel: '[data-testid="relation-graph-panel"]',
  typeSelect: '[data-testid="relation-type-select"]',
  subjectSelect: '[data-testid="relation-subject-select"]',
  subjectName: '[data-testid="relation-subject-name"]',
  subjectDetail: '[data-testid="relation-subject-detail"]',
  table: '[data-testid="relation-table"]',
  tableHead: '[data-testid="relation-table"] th',
  row: '[data-testid="relation-row"]',
  dangling: '[data-testid="relation-row-dangling"]',
  rowsEmpty: '[data-testid="relation-rows-empty"]',
  dialogField: '[data-testid="field-dialog_id"]'
}

const results = []
function check(name, cond, detail) {
  const pass = !!cond
  results.push({ name, pass, detail: detail ?? '' })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail !== undefined ? `  :: ${detail}` : ''}`)
}

/**
 * 种子：与 e51-stub 同一份契约（`window.__E51_SEED`）。
 * - systems：`skills`（→ 数据编辑器「技能系统」）+ `tasks`（→「任务系统」，含 dialog 字段）
 * - data：类型 → 条目；`role` 带 skills/talents/buffs 引用字段（含一个**悬空** token `GONE001`）
 *
 * 注意：`skills` 排在 `systems` 首位 ⇒ 数据编辑器默认落在技能系统，
 * T5 必须显式切到「任务系统」才能证明是按系统驱动、不是偶然命中。
 */
const SEED = {
  title: '验证用策划书',
  systems: {
    skills: { enabled: true, name: '技能系统', data_type: 'skill', config: {} },
    tasks: { enabled: true, name: '任务系统', data_type: 'task', config: {} }
  },
  data: {
    skill: [
      { id: 'SKILL000', data: { name: '火球术', desc: '造成火焰伤害' } },
      { id: 'SKILL001', data: { name: '冰霜箭', description: '减速目标' } }
    ],
    dialog: [
      { id: 'DLG001', data: { name: '开场对话', next_dialog: 'DLG002' } },
      { id: 'DLG002', data: { name: '第二段', next_dialog: '' } }
    ],
    role: [
      {
        id: 'ROLE001',
        data: {
          name: '艾尔文',
          job: '战士',
          level: 12,
          skills: ['SKILL000'],
          talents: 'SKILL001、GONE001',
          buffs: []
        }
      }
    ],
    task: [
      { id: 'TASK001', data: { name: '主线任务1', dialog_id: 'DLG001' } },
      { id: 'TASK002', data: { name: '任务2', dialog_id: 'DLG_MISSING' } }
    ]
  }
}

// ---- 起服务器 ----
const server = spawn(process.execPath, [join(HERE, 'serve-e57.mjs'), String(PORT)], { stdio: 'inherit' })
await delay(700)

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })

/** 每个用例：独立 context + addInitScript 种桩（种子在渲染层 bundle 之前生效） */
async function runCase(tag, fn, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text())
  })
  await page.addInitScript((s) => {
    window.__E51_SEED = s
  }, SEED)
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(SEL.home, { timeout: 15000 })
    await fn(page)
  } catch (e) {
    check(`${tag} · 未抛异常`, false, String((e && e.message) || e))
  } finally {
    console.log(`   [${tag}] 页面错误: ${errs.length ? errs.join(' | ') : '(none)'}`)
    await ctx.close()
  }
}

const exists = async (p, sel) => (await p.$$(sel)).length > 0
const cellsOf = (p, sel) => p.$$eval(`${sel} td`, (els) => els.map((e) => e.textContent))

try {
  // ================= T1 菜单收口 =================
  await runCase('T1', async (page) => {
    await page.click(SEL.menuTools)
    await page.waitForSelector(SEL.itemRelationGraph, { timeout: 5000 })
    check('T1 「工具 → 关系图」已挂真动作（menuitem-tools-relationGraph 在场）', await exists(page, SEL.itemRelationGraph))
    check('T1 「数据关联预览」未回归（menuitem-tools-references 仍在）', await exists(page, SEL.itemReferences))
    const subLabels = await page.$$eval(SEL.submenuLabel, (els) => els.map((e) => e.textContent))
    check('T1 PyQt 死入口「内容关联」子菜单已删除', !subLabels.includes('内容关联'), JSON.stringify(subLabels))
    check('T1 相邻的「数据分析」子菜单仍在（定点删除、非整块误删）', subLabels.includes('数据分析'), JSON.stringify(subLabels))
    await page.screenshot({ path: join(SHOTS, 'e57-t1-menu.png') })
  })

  // ================= T2 关系图面板 =================
  await runCase('T2', async (page) => {
    await page.click(SEL.menuTools)
    await page.click(SEL.itemRelationGraph)
    await page.waitForSelector(SEL.panel, { timeout: 5000 })
    check('T2 面板打开（relation-graph-panel）', await exists(page, SEL.panel))
    check('T2 默认类型 = schema 首个（skill）', (await page.$eval(SEL.typeSelect, (el) => el.value)) === 'skill', await page.$eval(SEL.typeSelect, (el) => el.value))

    await page.selectOption(SEL.typeSelect, 'role')
    await page.waitForSelector(SEL.table, { timeout: 5000 })
    check('T2 主体下拉默认落该类型首条', (await page.$eval(SEL.subjectSelect, (el) => el.value)) === 'ROLE001')
    check('T2 主体信息卡：名称', (await page.$eval(SEL.subjectName, (e) => e.textContent)) === '艾尔文')
    check(
      'T2 主体信息卡：摘要行（跳过 id/name 与空数组 buffs）',
      (await page.$eval(SEL.subjectDetail, (e) => e.textContent)) ===
        'job: 战士 | level: 12 | skills: SKILL000 | talents: SKILL001、GONE001',
      await page.$eval(SEL.subjectDetail, (e) => e.textContent)
    )

    const head = await page.$$eval(SEL.tableHead, (els) => els.map((e) => e.textContent))
    check('T2 表头 5 列', JSON.stringify(head) === JSON.stringify(['来源字段', '关联名称', '类型', 'ID', '描述']), JSON.stringify(head))

    const cells = await cellsOf(page, SEL.row)
    const stray = await cellsOf(page, SEL.dangling)
    check('T2 已解析关联行 2 条（skills 1 + talents 1；buffs 为空不产行）', cells.length === 10, 'cells=' + cells.length)
    check(
      'T2 首行逐格：来源字段/关联名称/类型/ID/描述',
      JSON.stringify(cells.slice(0, 5)) === JSON.stringify(['skills', '火球术', '技能', 'SKILL000', '造成火焰伤害']),
      JSON.stringify(cells.slice(0, 5))
    )
    check(
      'T2 第二行描述取自 description 回退位',
      JSON.stringify(cells.slice(5, 10)) === JSON.stringify(['talents', '冰霜箭', '技能', 'SKILL001', '减速目标']),
      JSON.stringify(cells.slice(5, 10))
    )
    check('T2 悬空 token 单独一行（relation-row-dangling）', (await page.$$(SEL.dangling)).length === 1)
    check(
      'T2 悬空行：类型/ID/描述显示「-」、名称保留原文',
      JSON.stringify(stray) === JSON.stringify(['talents', 'GONE001', '-', '-', '-']),
      JSON.stringify(stray)
    )
    await page.screenshot({ path: join(SHOTS, 'e57-t2-relation-graph.png') })

    // 空关联：技能（本桩 schema 未给 refType 字段）→ 出空态而非空表
    await page.selectOption(SEL.typeSelect, 'skill')
    await page.waitForSelector(SEL.rowsEmpty, { timeout: 5000 })
    check('T2 无关联时出空态（relation-rows-empty）而非空表', await exists(page, SEL.rowsEmpty))
    check('T2 无关联时表格不渲染', !(await exists(page, SEL.table)))
  })

  // ================= T3 悬空行双击不跳转 =================
  await runCase('T3', async (page) => {
    await page.click(SEL.menuTools)
    await page.click(SEL.itemRelationGraph)
    await page.waitForSelector(SEL.panel, { timeout: 5000 })
    await page.selectOption(SEL.typeSelect, 'role')
    await page.waitForSelector(SEL.dangling, { timeout: 5000 })
    await page.dblclick(SEL.dangling)
    await page.waitForTimeout(400)
    check('T3 双击悬空行后面板仍在（无跳转）', await exists(page, SEL.panel))
  })

  // ================= T4 已解析行双击跳转 =================
  await runCase('T4', async (page) => {
    await page.click(SEL.menuTools)
    await page.click(SEL.itemRelationGraph)
    await page.waitForSelector(SEL.panel, { timeout: 5000 })
    await page.selectOption(SEL.typeSelect, 'role')
    await page.waitForSelector(SEL.row, { timeout: 5000 })
    await page.dblclick(`${SEL.row}:first-child`)
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="relation-graph-panel"]').length === 0,
      { timeout: 5000 }
    )
    check('T4 双击已解析行后跳转（面板关闭）', !(await exists(page, SEL.panel)))
    check('T4 跳转后离开首页（落进策划书编辑器）', !(await exists(page, SEL.home)))
    await page.screenshot({ path: join(SHOTS, 'e57-t4-after-jump.png') })
  })

  // ================= T5 dialog 字段控件形态 =================
  await runCase('T5', async (page) => {
    await page.click(SEL.open)
    await page.waitForSelector(SEL.create, { timeout: 15000 })
    await page.click('[data-testid="ceshu-preview-tab"][title="task"]')
    await page.waitForSelector(SEL.rows, { timeout: 5000 })

    await page.locator(SEL.rows, { hasText: '主线任务1' }).first().click()
    await page.waitForSelector(SEL.dialogField, { timeout: 5000 })
    const tag = await page.$eval(SEL.dialogField, (el) => el.tagName)
    check('T5 dialog_id 渲染为下拉（非可编辑文本框）', tag === 'SELECT', 'tagName=' + tag)
    const opts = await page.$$eval(`${SEL.dialogField} option`, (els) => els.map((e) => e.textContent))
    check('T5 下拉含空项 + 同库对话条目', JSON.stringify(opts) === JSON.stringify(['（未选择）', 'DLG001 — 开场对话', 'DLG002 — 第二段']), JSON.stringify(opts))
    check('T5 值回显为对话 id', (await page.$eval(SEL.dialogField, (el) => el.value)) === 'DLG001')
    await page.screenshot({ path: join(SHOTS, 'e57-t5-dialog-field.png') })

    await page.locator(SEL.rows, { hasText: '任务2' }).first().click()
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="field-dialog_id"]')
        return el && el.value === 'DLG_MISSING'
      },
      { timeout: 5000 }
    )
    const staleOptions = await page.$$eval(`${SEL.dialogField} option`, (els) => els.map((e) => e.textContent))
    check(
      'T5 值指向已删除对话时保留「（已失效）」选项（不静默清空）',
      staleOptions.includes('DLG_MISSING（已失效）'),
      JSON.stringify(staleOptions)
    )
    check('T5 失效值仍回显（不静默清空）', (await page.$eval(SEL.dialogField, (el) => el.value)) === 'DLG_MISSING')
    await page.screenshot({ path: join(SHOTS, 'e57-t5-dialog-stale.png') })
  })

  // ================= T6 浮层面板占满主区（E57 修复：`.editor` 的 400px 定宽泄漏到浮层） =================
  await runCase('T6', async (page) => {
    await page.click(SEL.menuTools)
    await page.click(SEL.itemRelationGraph)
    await page.waitForSelector(SEL.panel, { timeout: 5000 })
    const box = await page.evaluate(() => {
      const body = document.querySelector('.panel-overlay-body')
      const panel = document.querySelector('[data-testid="relation-graph-panel"]')
      return {
        bodyW: body.getBoundingClientRect().width,
        panelW: panel.getBoundingClientRect().width,
        panelLeft: panel.getBoundingClientRect().left,
        bodyLeft: body.getBoundingClientRect().left
      }
    })
    check(
      `T6 面板宽度 = 浮层正文宽度（body=${Math.round(box.bodyW)} / panel=${Math.round(box.panelW)}）`,
      Math.abs(box.panelW - box.bodyW) <= 1,
      JSON.stringify(box)
    )
    check('T6 反事实对照：`.editor` 原定宽 400px ⇒ 修复前只有 400px', box.bodyW > 500, `bodyW=${Math.round(box.bodyW)}`)
    check('T6 面板左缘与正文左缘对齐（不再是「左对齐 400px 窄块 + 右侧空白」）', Math.abs(box.panelLeft - box.bodyLeft) <= 1)
    await page.screenshot({ path: join(SHOTS, 'e57-t6-fullwidth.png') })
  })

  // ================= T7 CSS 改动回归：其余浮层面板同样占满、且无横向溢出 =================
  // 背景：T6 的修复加的是 `.panel-overlay-body > .editor`（一条**跨 9 个面板**的规则），
  // 必须证明没有把别的面板弄坏 —— 逐个打开、量宽、查溢出。
  await runCase('T7', async (page) => {
    const cases = [
      ['menu-title-settings', 'menuitem-settings-open', '设置'],
      ['menu-title-tools', 'menuitem-tools-stats', '游戏数据统计'],
      ['menu-title-file', 'menuitem-file-backup', '备份管理'],
      ['menu-title-tools', 'menuitem-tools-dataDiff', '数据对比'],
      ['menu-title-tools', 'menuitem-tools-fieldEditor', '字段结构编辑器'],
      ['menu-title-tools', 'menuitem-tools-advancedSearch', '高级搜索'],
      ['menu-title-tools', 'menuitem-tools-cleanupUnusedImages', '清理未使用图片'],
      ['menu-title-help', 'menuitem-help-shortcuts', '快捷键参考'],
      ['menu-title-help', 'menuitem-help-about', '关于墨白编辑器']
    ]
    for (const [menu, item, label] of cases) {
      await page.click(`[data-testid="${menu}"]`)
      await page.waitForSelector(`[data-testid="${item}"]`, { timeout: 5000 })
      await page.click(`[data-testid="${item}"]`)
      await page.waitForSelector('.panel-overlay-body > *', { timeout: 5000 })
      const m = await page.evaluate(() => {
        const body = document.querySelector('.panel-overlay-body')
        const child = body.firstElementChild
        return {
          bodyW: body.getBoundingClientRect().width,
          childW: child.getBoundingClientRect().width,
          rootClass: child.className,
          overflowX: body.scrollWidth - body.clientWidth
        }
      })
      check(
        `T7 「${label}」面板占满正文宽度（${Math.round(m.childW)}/${Math.round(m.bodyW)}，root=.${String(m.rootClass).split(' ')[0]}）`,
        Math.abs(m.childW - m.bodyW) <= 1,
        JSON.stringify(m)
      )
      check(`T7 「${label}」正文无横向溢出`, m.overflowX <= 1, 'overflowX=' + m.overflowX)
      await page.click('[data-testid="panel-close"]')
      await page.waitForFunction(() => document.querySelectorAll('.panel-overlay-body').length === 0, { timeout: 5000 })
    }
    await page.screenshot({ path: join(SHOTS, 'e57-t7-panel-regression.png') })
  })
} finally {
  await browser.close()
  server.kill()
}

const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\n===== E57 渲染验证汇总: ${passed}/${results.length} 通过 =====`)
if (failed.length) console.log('未通过:\n' + failed.map((f) => `  - ${f.name} :: ${f.detail}`).join('\n'))
writeFileSync(join(SHOTS, 'e57-report.json'), JSON.stringify({ passed, total: results.length, results }, null, 2), 'utf-8')
console.log('报告: preview/shots/e57-report.json')
process.exit(failed.length ? 1 : 0)
