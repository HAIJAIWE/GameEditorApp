/*
 * E59 渲染层交互 · 运行时验证（Playwright chromium/Edge + 预览服务器 + 忠实 mbApi 桩）。
 *
 * 证明目标（逐条给断言输出）—— v0.5 的 DD-17「创作面的确认门」：
 *   T1 批量生成 > 阈值（12 条）：首次点「生成候选」**不发起调用**，出现内联确认态
 *      （`datagen-confirm`），且提示文案带出条数与阈值；
 *   T2 点「取消」⇒ 确认态消失、回到可再次点击的状态（不是死路）；
 *   T3 批量 ≤ 阈值（5 条）：**不出现**确认态（常规操作不该被拦），直接走生成路径；
 *   T4 整篇生成面板：填描述后首次点「开始生成」⇒ 出现内联确认态（`ai-full-confirm`），
 *      再次点击（确认）才真正发起。
 *
 * 背景：策划书/数据的 AI 能力走的是**渲染层直连**通路（`window.mbApi.ceshu.*` 53 处 /
 * `data.*` 42 处），agent 通路只服务对话面（`window.mbApi.agent` 仅 1 处）
 * ⇒ `TOOL_RISK_MAP` 与 `approvalBroker` 对它们不生效。DD-17 让两条通路共用同一口径，
 * 判定抽成纯函数 `shared/agent/protocol.ts::llmConfirmReason`（判定与文案同源）。
 *
 * 运行：先 `npm run build`，再 `node preview/verify-e59.mjs`（脚本自带服务器）。
 * 端口：5202（与 serve-e57 的 5200 / verify-e58 的 5201 隔离，复用同一套桩链）。
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 5202
const BASE = `http://127.0.0.1:${PORT}/`
const HERE = import.meta.dirname
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

const SEL = {
  home: '[data-testid="ceshu-home-panel"]',
  open: '[data-testid="home-card-open"]',
  datagenEntry: '[data-testid="ceshu-ai-datagen"]',
  datagenTypes: '[data-testid="datagen-types"]',
  datagenType: '[data-testid="datagen-type"]',
  datagenCount: '[data-testid="datagen-count"]',
  datagenGenerate: '[data-testid="datagen-generate"]',
  datagenConfirm: '[data-testid="datagen-confirm"]',
  datagenConfirmNo: '[data-testid="datagen-confirm-no"]',
  datagenConfirmYes: '[data-testid="datagen-confirm-yes"]',
  datagenError: '[data-testid="datagen-error"]',
  datagenQuality: '[data-testid="datagen-quality"]',
  datagenQualityIssue: '[data-testid="datagen-quality"] .datagen-quality-issues li',
  fullEntry: '[data-testid="ceshu-ai-full"]',
  fullDesc: '[data-testid="ai-full-desc"]',
  fullStart: '[data-testid="ai-full-start"]',
  fullConfirm: '[data-testid="ai-full-confirm"]',
  fullConfirmYes: '[data-testid="ai-full-confirm-yes"]',
  datagenCost: '[data-testid="datagen-cost"]',
  fullCost: '[data-testid="ai-full-cost"]',
  budgetBarFill: '.budget-bar-fill',
  datagenImport: '[data-testid="datagen-import"]',
  datagenImportConfirm: '[data-testid="datagen-import-confirm"]',
  datagenImportConfirmNo: '[data-testid="datagen-import-confirm-no"]',
  datagenImportConfirmYes: '[data-testid="datagen-import-confirm-yes"]',
  // v0.9 M6 保密模式（DD-0b）
  settingsMenu: '[data-testid="menu-title-settings"]',
  settingsOpen: '[data-testid="menuitem-settings-open"]',
  settingsPanel: '[data-testid="settings-panel"]',
  llmProvider: '[data-testid="llm-provider"]',
  // 当前实现（SettingsPanel.tsx:440）是显式复选框：勾选后 effectiveProvider 强制回落 ollama，
  // 服务商下拉保留但禁用、API Key 行隐藏、实际生效地址回落 localhost:11434。
  // 早期脚本用的 llm-mode-cloud / llm-mode-local 分段控件已不存在。
  llmConfidential: '[data-testid="llm-confidential"]',
  llmConfidentialInput: '[data-testid="llm-confidential"] input',
  llmConfidentialNotice: '[data-testid="llm-confidential-notice"]',
  llmBaseUrlEffective: '[data-testid="llm-base-url-effective"]',
  llmApiKey: '[data-testid="llm-api-key"]'
}

const results = []
function check(name, cond, detail) {
  const pass = !!cond
  results.push({ name, pass, detail: detail ?? '' })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}${detail !== undefined ? `  :: ${detail}` : ''}`)
}

/** 与 verify-e51/e57 同一份种子契约（`window.__E51_SEED`） */
const SEED = {
  title: '验证用策划书',
  systems: { skills: { enabled: true, name: '技能系统', data_type: 'skill', config: {} } },
  data: { skill: [{ id: 'SKILL000', data: { name: '火球术' } }] }
}

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

/** 从首页打开策划书 */
async function openCeshu(page) {
  await page.click(SEL.open)
  await page.waitForSelector(SEL.datagenEntry, { timeout: 15000 })
}

try {
  // ================= T1 批量 > 阈值 ⇒ 出现确认态，且不发起调用 =================
  await runCase('T1', async (page) => {
    await openCeshu(page)
    await page.click(SEL.datagenEntry)
    await page.waitForSelector(SEL.datagenTypes, { timeout: 8000 })
    // 勾一个类型（否则会因「未选类型」提前返回，测不到确认门）
    await page.locator(SEL.datagenType).first().check()
    await page.locator(SEL.datagenCount).fill('12')
    await page.click(SEL.datagenGenerate)
    await page.waitForSelector(SEL.datagenConfirm, { timeout: 5000 })
    const text = await page.locator(SEL.datagenConfirm).textContent()
    check('T1 批量 12 条 ⇒ 出现内联确认态（datagen-confirm）', true)
    check('T1 提示文案带出条数', String(text).includes('12'), String(text).trim())
    check('T1 提示文案带出阈值 10', String(text).includes('10'), String(text).trim())
    check('T1 提示说明是云端模型调用', String(text).includes('云端模型'), String(text).trim())
    // 关键：没有真的去调 LLM（否则会出「未检测到本地模型」之类的错误）
    const err = await page.locator(SEL.datagenError).count()
    check('T1 首次点击**没有**发起 LLM 调用（无错误横幅）', err === 0, `error节点=${err}`)
    await page.screenshot({ path: join(SHOTS, 'e59-t1-datagen-confirm.png') })
  })

  // ================= T2 取消 ⇒ 回到可再点击状态（不是死路） =================
  await runCase('T2', async (page) => {
    await openCeshu(page)
    await page.click(SEL.datagenEntry)
    await page.waitForSelector(SEL.datagenTypes, { timeout: 8000 })
    await page.locator(SEL.datagenType).first().check()
    await page.locator(SEL.datagenCount).fill('12')
    await page.click(SEL.datagenGenerate)
    await page.waitForSelector(SEL.datagenConfirm, { timeout: 5000 })
    await page.click(SEL.datagenConfirmNo)
    await page.waitForFunction(
      (sel) => document.querySelectorAll(sel).length === 0,
      SEL.datagenConfirm,
      { timeout: 5000 }
    )
    check('T2 点「取消」⇒ 确认态消失', true)
    // 取消后按钮仍在、可再来一次
    check('T2 「生成候选」按钮仍在（不是死路）', (await page.locator(SEL.datagenGenerate).count()) === 1)
  })

  // ================= T3 ≤ 阈值 ⇒ 不该被拦 =================
  await runCase('T3', async (page) => {
    await openCeshu(page)
    await page.click(SEL.datagenEntry)
    await page.waitForSelector(SEL.datagenTypes, { timeout: 8000 })
    await page.locator(SEL.datagenType).first().check()
    await page.locator(SEL.datagenCount).fill('5')
    await page.click(SEL.datagenGenerate)
    await delay(1200) // 给生成路径一点时间（会去调 LLM 并失败，但重点是"没被拦"）
    const confirm = await page.locator(SEL.datagenConfirm).count()
    check('T3 批量 5 条（≤ 阈值）⇒ **不出现**确认态', confirm === 0, `confirm节点=${confirm}`)
  })

  // ================= T4 整篇生成面板的确认态 =================
  await runCase('T4', async (page) => {
    await openCeshu(page)
    await page.click(SEL.fullEntry)
    await page.waitForSelector(SEL.fullDesc, { timeout: 8000 })
    await page.locator(SEL.fullDesc).fill('一款以东方幻想为背景的回合制策略游戏')
    await page.click(SEL.fullStart)
    await page.waitForSelector(SEL.fullConfirm, { timeout: 5000 })
    const text = await page.locator(SEL.fullConfirm).textContent()
    check('T4 整篇生成首次点击 ⇒ 出现内联确认态（ai-full-confirm）', true)
    check('T4 提示说明是连续多次云端调用', String(text).includes('连续调用'), String(text).trim())
    check('T4 提示带出章节次数', /\d+\s*次/.test(String(text)), String(text).trim())
    await page.screenshot({ path: join(SHOTS, 'e59-t4-full-confirm.png') })
  })

  // ================= T5 数据侧确定性质量门 UI 渲染（DD-19 数据半边） =================
  // 说明：预览桩的 `ceshu.aiGenerateData` 直接返回带 `quality` 的候选包（真实计算由单测覆盖），
  // 这里只验证「质量门结论块」已在渲染层正确接线、可见、且样式类正确。
  await runCase('T5', async (page) => {
    await openCeshu(page)
    await page.click(SEL.datagenEntry)
    await page.waitForSelector(SEL.datagenTypes, { timeout: 8000 })
    await page.locator(SEL.datagenType).first().check()
    await page.locator(SEL.datagenCount).fill('5') // ≤ 阈值，不触发确认门，直走生成
    await page.click(SEL.datagenGenerate)
    await page.waitForSelector(SEL.datagenQuality, { timeout: 8000 })
    check('T5 生成后 ⇒ 出现质量门结论块（datagen-quality）', true)
    const summary = await page.locator(SEL.datagenQuality).textContent()
    check('T5 结论文案带出「离散度偏高」', String(summary).includes('离散度偏高'), String(summary).trim())
    const issueCount = await page.locator(SEL.datagenQualityIssue).count()
    check('T5 至少渲染出 1 条问题（li）', issueCount >= 1, `li数=${issueCount}`)
    const isBalance = await page.locator('[data-testid="datagen-quality"] .datagen-quality-issues li.is-balance').count()
    check('T5 平衡性问题的样式类 is-balance 正确落位', isBalance >= 1, `is-balance数=${isBalance}`)
    await page.screenshot({ path: join(SHOTS, 'e59-t5-data-quality.png') })
  })

  // ================= T6 数据生成后的 token 花费 + 预算条（M5 成本护栏） =================
  await runCase('T6', async (page) => {
    await openCeshu(page)
    await page.click(SEL.datagenEntry)
    await page.waitForSelector(SEL.datagenTypes, { timeout: 8000 })
    await page.locator(SEL.datagenType).first().check()
    await page.locator(SEL.datagenCount).fill('5')
    await page.click(SEL.datagenGenerate)
    await page.waitForSelector(SEL.datagenCost, { timeout: 8000 })
    check('T6 生成后 ⇒ 出现 token 花费块（datagen-cost）', true)
    const text = await page.locator(SEL.datagenCost).textContent()
    check('T6 文案带出「本次花费」与「token」', String(text).includes('本次花费') && String(text).includes('token'), String(text).trim())
    check('T6 文案带出「预算」', String(text).includes('预算'), String(text).trim())
    const bar = await page.locator(SEL.budgetBarFill).count()
    check('T6 渲染出预算进度条（budget-bar-fill）', bar >= 1, `bar数=${bar}`)
    await page.screenshot({ path: join(SHOTS, 'e59-t6-data-cost.png') })
  })

  // ================= T7 整篇生成后的累计 token 花费（不设预算上限，无预算条） =================
  await runCase('T7', async (page) => {
    await openCeshu(page)
    await page.click(SEL.fullEntry)
    await page.waitForSelector(SEL.fullDesc, { timeout: 8000 })
    await page.locator(SEL.fullDesc).fill('一款以东方幻想为背景的回合制策略游戏')
    await page.click(SEL.fullStart)
    await page.waitForSelector(SEL.fullConfirm, { timeout: 5000 })
    await page.click(SEL.fullConfirmYes)
    // 整篇生成逐章调用，等成本块出现
    await page.waitForSelector(SEL.fullCost, { timeout: 15000 })
    check('T7 整篇生成后 ⇒ 出现累计花费块（ai-full-cost）', true)
    const text = await page.locator(SEL.fullCost).textContent()
    // 2026-11-10 起整篇生成不设预算上限（AiFullGeneratePanel.tsx:1354-1359 注释），
    // 文案是「本次已花费 {tokens} token（不设预算上限）」，预算进度条也随之移除。
    // 数据生成侧（T6）仍保留预算条，两条口径不同，不要混用。
    check('T7 文案带出「本次已花费」与「token」', String(text).includes('本次已花费') && String(text).includes('token'), String(text).trim())
    check('T7 文案如实说明不设预算上限', String(text).includes('不设预算上限'), String(text).trim())
    await page.screenshot({ path: join(SHOTS, 'e59-t7-full-cost.png') })
  })

  // ================= T8 导入前二次确认（v0.7 DD-19 × M5：质量门检出问题时） =================
  // 预览桩的 aiGenerateData 返回带 balance 问题的 quality（hasIssues=true）⇒ 应触发导入二次确认
  await runCase('T8', async (page) => {
    await openCeshu(page)
    await page.click(SEL.datagenEntry)
    await page.waitForSelector(SEL.datagenTypes, { timeout: 8000 })
    await page.locator(SEL.datagenType).first().check()
    await page.locator(SEL.datagenCount).fill('5') // ≤ 阈值，不触发生成确认门，直走生成
    await page.click(SEL.datagenGenerate)
    await page.waitForSelector(SEL.datagenQuality, { timeout: 8000 })
    // 生成后、点击导入前：二次确认态不应出现
    check('T8 生成后未点导入 ⇒ 不应出现导入二次确认态', (await page.locator(SEL.datagenImportConfirm).count()) === 0)
    // 点击导入 ⇒ 出现二次确认态
    await page.click(SEL.datagenImport)
    await page.waitForSelector(SEL.datagenImportConfirm, { timeout: 5000 })
    const txt = await page.locator(SEL.datagenImportConfirm).textContent()
    check('T8 有质量问题时点导入 ⇒ 出现导入二次确认态（datagen-import-confirm）', true)
    check('T8 确认文案带出「仍要导入」语义', String(txt).includes('仍要导入'), String(txt).trim())
    check('T8 确认文案带出「处问题」', /处问题/.test(String(txt)), String(txt).trim())
    // 取消 ⇒ 消失
    await page.click(SEL.datagenImportConfirmNo)
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, SEL.datagenImportConfirm, { timeout: 5000 })
    check('T8 点「取消」⇒ 导入二次确认态消失', true)
    // 再点导入 ⇒ 出现 ⇒ 仍要导入 ⇒ 确认态消失（门已跨过，进入导入流程）
    await page.click(SEL.datagenImport)
    await page.waitForSelector(SEL.datagenImportConfirm, { timeout: 5000 })
    await page.click(SEL.datagenImportConfirmYes)
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, SEL.datagenImportConfirm, { timeout: 5000 })
    check('T8 点「仍要导入」⇒ 确认态消失（门已跨过，进入导入流程）', true)
    await page.screenshot({ path: join(SHOTS, 'e59-t8-import-confirm.png') })
  })

  // ============ T9 保密模式（v0.9 M6 / DD-0b；v2.3 起由「模型来源」分段切换承载） ============
  // 先把服务商选成云端（deepseek），再切到「本地」档 ⇒ 必须「无视服务商、强制本地 Ollama」。
  await runCase('T9', async (page) => {
    await page.click(SEL.settingsMenu)
    await page.waitForSelector(SEL.settingsOpen, { timeout: 5000 })
    await page.click(SEL.settingsOpen)
    await page.waitForSelector(SEL.settingsPanel, { timeout: 8000 })
    await page.waitForSelector(SEL.llmProvider, { timeout: 8000 })

    // 先切到云端服务商，并确认 API Key 行出现（证明确实处于云端档）
    await page.selectOption(SEL.llmProvider, 'deepseek')
    check('T9 先选云端服务商 ⇒ API Key 行出现（确实在云端档）', (await page.locator(SEL.llmApiKey).count()) === 1)
    check(
      'T9 默认未开启保密（复选框未勾选，非默认本地档）',
      (await page.locator(SEL.llmConfidentialInput).isChecked()) === false
    )
    check('T9 保密未开 ⇒ 无「数据不出本机」提示', (await page.locator(SEL.llmConfidentialNotice).count()) === 0)

    // 勾选保密 ⇒ 服务商下拉保留但禁用、API Key 行消失、出现告知
    await page.locator(SEL.llmConfidentialInput).check()
    await page.waitForSelector(SEL.llmConfidentialNotice, { timeout: 5000 })
    const noticeText = await page.locator(SEL.llmConfidentialNotice).textContent()
    check(
      'T9 切到本地档 ⇒ 出现「数据不出本机」明确告知',
      String(noticeText).includes('本机') && String(noticeText).includes('云端'),
      String(noticeText).trim()
    )
    check('T9 切到本地档 ⇒ 服务商下拉保留但被禁用（不能偷偷改回云端）', (await page.locator(SEL.llmProvider).count()) === 1 && (await page.locator(SEL.llmProvider).isDisabled()))
    check('T9 切到本地档 ⇒ 云端才需要的 API Key 行消失', (await page.locator(SEL.llmApiKey).count()) === 0)
    // 回归：保密模式必须**忽略云端 baseUrl**（否则本地 Ollama 会被指向 api.deepseek.com）
    const effText = await page.locator(SEL.llmBaseUrlEffective).textContent()
    check(
      'T9 切到本地档 ⇒ 「实际生效」接口地址回落本地 Ollama（不指向云端域名）',
      String(effText).includes('localhost:11434') && !String(effText).includes('deepseek'),
      String(effText).trim()
    )
    await page.screenshot({ path: join(SHOTS, 'e59-t9-confidential.png') })

    // 切回云端 ⇒ 恢复云端档（存的服务商没被保密模式改写）
    await page.locator(SEL.llmConfidentialInput).uncheck()
    await page.waitForFunction((sel) => document.querySelectorAll(sel).length === 0, SEL.llmConfidentialNotice, { timeout: 5000 })
    check('T9 切回云端 ⇒ 告知消失', true)
    await page.waitForSelector(SEL.llmProvider, { timeout: 5000 })
    check(
      'T9 切回云端 ⇒ 恢复原先选的服务商（保密模式不改写用户配置）',
      (await page.locator(SEL.llmProvider).inputValue()) === 'deepseek',
      `provider=${await page.locator(SEL.llmProvider).inputValue()}`
    )
  })
} finally {
  await browser.close().catch(() => undefined)
  server.kill()
}

const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\n===== E59 渲染验证汇总: ${passed}/${results.length} 通过 =====`)
if (failed.length) console.log('未通过:\n' + failed.map((f) => `  - ${f.name} :: ${f.detail}`).join('\n'))
writeFileSync(join(SHOTS, 'e59-report.json'), JSON.stringify({ passed, total: results.length, results }, null, 2), 'utf-8')
console.log('报告: preview/shots/e59-report.json')
process.exit(failed.length ? 1 : 0)
