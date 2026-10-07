/*
 * E58 渲染层交互 · 运行时验证（Playwright chromium/Edge + 预览服务器 + 忠实 mbApi 桩）。
 *
 * 证明目标（逐条给断言输出）——「字段 ID 的拼音层」+「新建类型 ID 自动填拼音」：
 *   T1 「拼音」按钮给候选：术语表**未收录**的词（斗能）也能出候选 `dou_neng`（source=pinyin），
 *      且同一面板里规则层如实报「未收录」——两层并存、互不遮蔽。
 *   T2 两层对照：`攻击力` 的规则层给 `atk`（语义），拼音层给 `gong_ji_li`（音节），同时在场。
 *   T3 点候选才写入（沿用「只提案不写入」）：写入前字段名保持 `field_N`，写入后变为 `dou_neng`。
 *   T4 无可用字符时拼音层**如实报错**（不给空候选）：`$$$` → 报「无法生成拼音 ID」。
 *   T5 新建类型的中文名 → 类型 ID 自动填拼音（对齐 Python `add_type`）；**用户手改 ID 后不再自动覆盖**程。
 *   T6 既有类型的 ID 不被中文名自动改动（对照：锁定的 `role` 类型改中文名，ID 保持 `role`）。
 *
 * 运行：先 `npm run build`，再 `node preview/verify-e58.mjs`（脚本自带服务器）。
 * 端口：5201（与 serve-e57 的 5200 隔离；复用同一套桩链 preview-stub + e51-stub + e57-stub）。
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 5201
const BASE = `http://127.0.0.1:${PORT}/`
const HERE = import.meta.dirname
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const SEL = {
  home: '[data-testid="ceshu-home-panel"]',
  menuTools: '[data-testid="menu-title-tools"]',
  itemFieldEditor: '[data-testid="menuitem-tools-fieldEditor"]',
  panel: '[data-testid="type-editor-panel"]',
  typeTab: '[data-testid="te-type-tab"]',
  addField: '[data-testid="te-add-field"]',
  close: '[data-testid="te-close"]',
  newType: '[data-testid="te-new-type"]',
  typeId: '[data-testid="te-type-id"]',
  typeName: '[data-testid="te-type-name"]'
}

const results = []
function check(name, cond, detail) {
  const pass = !!cond
  results.push({ name, pass, detail: detail ?? '' })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail !== undefined ? `  :: ${detail}` : ''}`)
}

const SEED = {
  title: '验证用策划书',
  systems: { skills: { enabled: true, name: '技能系统', data_type: 'skill', config: {} } },
  data: { skill: [{ id: 'SKILL000', data: { name: '火球术' } }] }
}

// ---- 起服务器（复用 E57 的桩链） ----
const server = spawn(process.execPath, [join(HERE, 'serve-e57.mjs'), String(PORT)], { stdio: 'inherit' })
await delay(700)

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })

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

/** 打开字段结构编辑器并选中某类型 */
async function openEditor(page, typeName) {
  await page.click(SEL.menuTools)
  await page.waitForSelector(SEL.itemFieldEditor, { timeout: 5000 })
  await page.click(SEL.itemFieldEditor)
  await page.waitForSelector(SEL.panel, { timeout: 5000 })
  await page.locator(SEL.typeTab).filter({ hasText: typeName }).click()
}

/** 读候选条里某个 source 的候选文本数组 */
const chips = (page, index, source) =>
  page.$$eval(
    `[data-testid="te-id-suggest-${index}"] [data-testid="te-id-suggest-apply-${index}"]`,
    (els, src) => els.filter((e) => e.getAttribute('data-source') === src).map((e) => e.textContent),
    source
  )

try {
  // ================= T1 未收录词也能转拼音（两层并存） =================
  await runCase('T1', async (page) => {
    await openEditor(page, '角色')
    await page.click(SEL.addField)
    const lastLabel = page.locator('[data-testid^="te-field-label-"]').last()
    const lastPinyin = page.locator('[data-testid^="te-field-pinyin-"]').last()
    const lastGenerate = page.locator('[data-testid^="te-field-generate-"]').last()
    await lastLabel.fill('斗能')

    // 规则层：未收录（术语表里没有「斗能」）
    await lastGenerate.click()
    await page.waitForSelector('[data-testid^="te-id-suggest-"]', { timeout: 5000 })
    check('T1 「斗能」规则层如实报未收录', await page.locator('[data-testid^="te-id-suggest-error-"]').count() > 0)

    // 拼音层：给出 dou_neng
    await lastPinyin.click()
    const idx = await page
      .locator('[data-testid^="te-id-suggest-apply-"]')
      .first()
      .evaluate((el) => Number(el.getAttribute('data-testid').replace('te-id-suggest-apply-', '')))
    const py = await chips(page, idx, 'pinyin')
    check('T1 「拼音」给出拼音候选 dou_neng', py.includes('dou_neng'), JSON.stringify(py))
    check('T1 候选标注 data-source=pinyin', py.length === 1, JSON.stringify(py))
    await page.screenshot({ path: join(SHOTS, 'e58-t1-pinyin-chip.png') })
  })

  // ================= T2 规则层 vs 拼音层 对照 =================
  await runCase('T2', async (page) => {
    await openEditor(page, '角色')
    await page.click(SEL.addField)
    const lastLabel = page.locator('[data-testid^="te-field-label-"]').last()
    await lastLabel.fill('攻击力')
    await page.locator('[data-testid^="te-field-generate-"]').last().click()
    await page.waitForSelector('[data-testid^="te-id-suggest-apply-"]', { timeout: 5000 })
    const idx = await page
      .locator('[data-testid^="te-id-suggest-apply-"]')
      .first()
      .evaluate((el) => Number(el.getAttribute('data-testid').replace('te-id-suggest-apply-', '')))
    await page.locator('[data-testid^="te-field-pinyin-"]').last().click()
    const term = await chips(page, idx, 'term')
    const py = await chips(page, idx, 'pinyin')
    check('T2 规则层给语义候选 atk', term.includes('atk'), JSON.stringify(term))
    check('T2 拼音层给音节候选 gong_ji_li', py.includes('gong_ji_li'), JSON.stringify(py))
    await page.screenshot({ path: join(SHOTS, 'e58-t2-two-layers.png') })
  })

  // ================= T3 点候选才写入 =================
  await runCase('T3', async (page) => {
    await openEditor(page, '角色')
    await page.click(SEL.addField)
    const lastName = page.locator('[data-testid^="te-field-name-"]').last()
    const lastLabel = page.locator('[data-testid^="te-field-label-"]').last()
    await lastLabel.fill('斗能')
    await page.locator('[data-testid^="te-field-pinyin-"]').last().click()
    await page.waitForSelector('[data-testid^="te-id-suggest-apply-"]', { timeout: 5000 })
    const before = await lastName.inputValue()
    check('T3 展开候选**不**自动覆盖字段名', /^field_\d+$/.test(before), `before=${before}`)
    const idx = await page
      .locator('[data-testid^="te-id-suggest-apply-"]')
      .first()
      .evaluate((el) => Number(el.getAttribute('data-testid').replace('te-id-suggest-apply-', '')))
    await page.locator(`[data-testid="te-id-suggest-apply-${idx}"][data-source="pinyin"]`).first().click()
    check('T3 点候选后写入 dou_neng', (await lastName.inputValue()) === 'dou_neng', await lastName.inputValue())
  })

  // ================= T4 无可用字符如实报错 =================
  await runCase('T4', async (page) => {
    await openEditor(page, '角色')
    await page.click(SEL.addField)
    await page.locator('[data-testid^="te-field-label-"]').last().fill('$$$')
    await page.locator('[data-testid^="te-field-pinyin-"]').last().click()
    await page.waitForSelector('[data-testid^="te-id-suggest-"]', { timeout: 5000 })
    const err = page.locator('[data-testid^="te-id-suggest-pinyin-error-"]')
    check('T4 无可转换字符时报错', (await err.count()) > 0)
    if ((await err.count()) > 0) {
      const text = await err.last().textContent()
      check('T4 错误文案说明「无法生成拼音 ID」', String(text).includes('无法生成拼音 ID'), String(text))
    }
    const py = await page.locator('[data-testid^="te-id-suggest-apply-"]').count()
    check('T4 报错时不给候选', py === 0, `chips=${py}`)
  })

  // ================= T5 新建类型 ID 自动填拼音 / 手改后不再覆盖 =================
  await runCase('T5', async (page) => {
    await openEditor(page, '角色')
    await page.click(SEL.newType)
    await page.locator(SEL.typeName).fill('卡牌')
    const auto = await page.locator(SEL.typeId).inputValue()
    check('T5 新建类型：中文名「卡牌」→ 类型 ID 自动填 ka_pai', auto === 'ka_pai', `id=${auto}`)

    // 用户手改 ID 后，中文名不应再覆盖
    await page.locator(SEL.typeId).fill('card')
    await page.locator(SEL.typeName).fill('卡组')
    const after = await page.locator(SEL.typeId).inputValue()
    check('T5 手改 ID 后不再被中文名自动覆盖（保持 card）', after === 'card', `id=${after}`)
    await page.screenshot({ path: join(SHOTS, 'e58-t5-newtype-autofill.png') })
  })

  // ================= T6 既有类型 ID 绝不被自动改 =================
  await runCase('T6', async (page) => {
    await openEditor(page, '角色')
    check('T6 既有类型 ID 输入框为只读（存量条目按 ID 关联）', await page.locator(SEL.typeId).isEditable().then((e) => !e))
    await page.locator(SEL.typeName).fill('角色改名')
    const id = await page.locator(SEL.typeId).inputValue()
    check('T6 改中文名后既有类型 ID 保持 role（未被拼音覆盖）', id === 'role', `id=${id}`)
  })

  await browser.close()
} finally {
  await browser.close().catch(() => undefined)
  server.kill()
}

const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\n===== E58 渲染验证汇总: ${passed}/${results.length} 通过 =====`)
if (failed.length) console.log('未通过:\n' + failed.map((f) => `  - ${f.name} :: ${f.detail}`).join('\n'))
writeFileSync(join(SHOTS, 'e58-report.json'), JSON.stringify({ passed, total: results.length, results }, null, 2), 'utf-8')
console.log('报告: preview/shots/e58-report.json')
process.exit(failed.length ? 1 : 0)
