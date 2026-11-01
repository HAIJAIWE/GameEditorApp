/**
 * Demo 验收器 —— 用无头 Edge（Playwright）跑标准检查，结果可写回「原型验收记录」。
 *
 * 为什么需要它（2026-10-24，对标豆包 prototype.checks）：文档里的「实测」主张
 * 此前只能人写「Demo 首关计时|通过」——证据是手填的，可信度靠自觉。本脚本把
 * 「实测」变成机器填的：打开一个 HTML Demo，跑五项通用检查，把
 * 检查项|结果|证据 写回 qa.prototype_acceptance；数值章「设计主张」里强度=实测
 * 且证据指向这些检查项的条目，随即由 checkDesignClaims 判定通过。
 *
 * 用法：
 *   node scripts/demoAcceptance.mjs <html 路径> [--app-cdp <ws-url> --doc-id <id>] [--json out.json]
 *
 * 五项检查（通用、不依赖具体玩法）：
 *   1. 加载      —— 页面在超时内完成 domcontentloaded
 *   2. 无异常    —— 加载与观察窗口内没有未捕获异常
 *   3. 内容渲染  —— 可见文本 ≥100 字，且存在 ≥3 个可交互元素
 *   4. 交互      —— 点击首个可交互元素后无新异常
 *   5. 稳定性    —— 观察 2 秒无新异常
 *
 * 退出码：0 = 五项全过；1 = 有未通过；2 = 用法错误。
 */
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const target = process.argv[2]
if (!target || target.startsWith('--')) {
  console.error('用法: node scripts/demoAcceptance.mjs <html 路径> [--app-cdp <ws>] [--doc-id <id>] [--json out.json]')
  process.exit(2)
}
if (!existsSync(target)) {
  console.error(`文件不存在: ${target}`)
  process.exit(2)
}

const appCdp = argOf('--app-cdp', '')
const docId = argOf('--doc-id', '')
const jsonOut = argOf('--json', '')

/** 检查项 → 结果（通过/未通过）+ 证据 */
const checks = []

async function runChecks() {
  if (!existsSync(EDGE)) {
    console.error(`未找到 Edge: ${EDGE}`)
    process.exit(2)
  }
  const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  const consoleErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 160)))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160))
  })

  try {
    // 1. 加载
    const started = Date.now()
    let loadOk = true
    try {
      await page.goto(pathToFileURL(target).href, { waitUntil: 'domcontentloaded', timeout: 20000 })
    } catch (error) {
      loadOk = false
      checks.push({ check: '加载', result: '未通过', evidence: `导航失败：${String(error).slice(0, 120)}` })
    }
    if (loadOk) {
      checks.push({ check: '加载', result: '通过', evidence: `domcontentloaded ${Date.now() - started}ms` })

      // 2. 无异常（加载阶段）
      checks.push({
        check: '无异常',
        result: pageErrors.length === 0 ? '通过' : '未通过',
        evidence: pageErrors.length === 0 ? `未捕获异常 0 个` : `${pageErrors.length} 个：${pageErrors[0]}`
      })

      // 3. 内容渲染
      const dom = await page.evaluate(() => {
        const text = (document.body?.innerText ?? '').trim()
        const interactive = document.querySelectorAll('button, input, select, textarea, a[href], [role="button"], [onclick]').length
        return { textLength: text.length, interactive, title: document.title }
      })
      const contentOk = dom.textLength >= 100 && dom.interactive >= 3
      checks.push({
        check: '内容渲染',
        result: contentOk ? '通过' : '未通过',
        evidence: `可见文本 ${dom.textLength} 字，可交互元素 ${dom.interactive} 个（标题：${dom.title.slice(0, 20)}）`
      })

      // 4. 交互：点首个可交互元素，观察是否有新异常
      const before = pageErrors.length
      const clicked = await page.evaluate(() => {
        const el = document.querySelector('button, [role="button"], [onclick], input[type="button"]')
        if (!el) return null
        const label = (el.textContent ?? '').trim().slice(0, 20)
        el.click()
        return label || el.tagName
      })
      await page.waitForTimeout(800)
      const newErrors = pageErrors.length - before
      checks.push({
        check: '交互',
        result: clicked === null ? '未通过' : newErrors === 0 ? '通过' : '未通过',
        evidence:
          clicked === null
            ? '未找到可点击元素'
            : newErrors === 0
              ? `点击「${clicked}」后无新异常`
              : `点击「${clicked}」后新增 ${newErrors} 个异常：${pageErrors[before]}`
      })

      // 5. 稳定性：观察 2 秒
      const beforeStable = pageErrors.length
      await page.waitForTimeout(2000)
      const newStable = pageErrors.length - beforeStable
      checks.push({
        check: '稳定性',
        result: newStable === 0 ? '通过' : '未通过',
        evidence:
          newStable === 0
            ? `2s 观察窗口无新异常（控制台错误 ${consoleErrors.length} 条）`
            : `2s 内新增 ${newStable} 个异常：${pageErrors[beforeStable]}`
      })
    }
  } finally {
    await browser.close()
  }
}

/** 写回策划书（可选）：读文档 → 合并 prototype_acceptance → saveChapter */
async function writeBack() {
  if (appCdp === '' || docId === '') return
  const ws = new WebSocket(appCdp)
  let id = 1
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params) =>
    new Promise((resolve) => {
      const myId = id++
      pending.set(myId, resolve)
      ws.send(JSON.stringify({ id: myId, method, params }))
    })
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    return res.result?.result?.value
  }
  await new Promise((resolve) => (ws.onopen = resolve))
  const rows = checks.map((item) => `${item.check}|${item.result}|${item.evidence}`)
  const saved = await evaluate(`(async () => {
    try {
      const doc = await window.mbApi.ceshu.get({ id: ${JSON.stringify(docId)} })
      const qa = { ...(doc.qa ?? {}) }
      qa.prototype_acceptance = ${JSON.stringify(rows)}
      await window.mbApi.ceshu.saveChapter({ id: ${JSON.stringify(docId)}, chapter: 'qa', data: qa })
      return 'OK'
    } catch (e) {
      return 'ERR:' + String(e).slice(0, 160)
    }
  })()`)
  ws.close()
  console.log(saved === 'OK' ? `已写回原型验收记录（${rows.length} 行）` : `写回失败：${saved}`)
}

await runChecks()

console.log(`\nDemo 验收：${target}\n`)
for (const item of checks) {
  console.log(`${item.result === '通过' ? '✓' : '✗'} ${item.check}｜${item.result}｜${item.evidence}`)
}
const failed = checks.filter((item) => item.result !== '通过').length
console.log(`\n结果：${checks.length - failed}/${checks.length} 通过`)

if (jsonOut !== '') {
  writeFileSync(jsonOut, JSON.stringify({ target, checks }, null, 2), 'utf8')
  console.log(`明细已写入 ${jsonOut}`)
}
await writeBack()
process.exitCode = failed === 0 ? 0 : 1
