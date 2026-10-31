/**
 * Demo 生成器 —— 文档 → 单文件可玩 HTML（走真实 LLM，非手工）。
 *
 * 为什么需要它：豆包的《微光之塔》Demo 就是 LLM 直接生成的单文件 HTML。
 * 我们此前只有「验收器」（验别人的 Demo），缺「生成器」——本脚本补上：
 * 从运行中的应用取文档 → buildDemoPrompt 组装提示词 → llm:generate →
 * 抽 HTML → 落盘 → 可选立刻跑验收器。
 *
 * 用法（应用需带 --remote-debugging-port 启动，且 LLM 配置可用）：
 *   npx tsx scripts/generateDemo.ts --app-cdp <ws> --doc-id <id> [--out <html>] [--acceptance]
 *
 * ⚠️ 依赖 LLM 服务（本地网关/云端）。网关不可用时脚本会如实报错，不静默产出空文件。
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { buildDemoPrompt } from '../src/shared/ceshu/prompts'
import type { CeshuDocument } from '../src/shared/ceshu/reference'

/** CDP 求值（与 ceshuAiE2E.mjs 同款最小客户端；Node 22 全局 WebSocket） */
async function connectCdp(url: string): Promise<{ evaluate: (expression: string) => Promise<unknown>; close: () => void }> {
  const socket = new WebSocket(url)
  let id = 1
  const pending = new Map<number, (value: unknown) => void>()
  socket.onmessage = (event: MessageEvent) => {
    const message = JSON.parse(String(event.data)) as { id?: number }
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)?.(message)
      pending.delete(message.id)
    }
  }
  await new Promise<void>((resolve) => (socket.onopen = () => resolve()))
  const evaluate = (expression: string): Promise<unknown> =>
    new Promise((resolve) => {
      const myId = id++
      pending.set(myId, (message) => {
        const result = (message as { result?: { result?: { value?: unknown } } }).result
        resolve(result?.result?.value)
      })
      socket.send(JSON.stringify({ id: myId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  return { evaluate, close: () => socket.close() }
}

const argOf = (flag: string, fallback: string): string => {
  const index = process.argv.indexOf(flag)
  return index > 0 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback
}

const appCdp = argOf('--app-cdp', '')
const docId = argOf('--doc-id', '')
const out = argOf('--out', '')
const runAcceptance = process.argv.includes('--acceptance')

if (appCdp === '' || docId === '') {
  console.error('用法: npx tsx scripts/generateDemo.ts --app-cdp <ws> --doc-id <id> [--out <html>] [--acceptance]')
  process.exit(2)
}

const cdp = await connectCdp(appCdp)
try {
  const rawDoc = await cdp.evaluate(`(async () => JSON.stringify(await window.mbApi.ceshu.get({ id: ${JSON.stringify(docId)} })))()`)
  if (typeof rawDoc !== 'string') throw new Error('读取文档失败（CDP 无返回）')
  const doc = JSON.parse(rawDoc) as CeshuDocument
  const { system, prompt } = buildDemoPrompt(doc)
  console.log(`提示词：${prompt.length} 字符（${(doc.meta.game_name as string) || '未命名'}）`)

  const raw = await cdp.evaluate(`(async () => {
    try {
      const res = await window.mbApi.llm.generate({ system: ${JSON.stringify(system)}, prompt: ${JSON.stringify(prompt)} })
      return JSON.stringify({ ok: true, content: res.content, model: res.model })
    } catch (e) {
      return JSON.stringify({ ok: false, error: String(e) })
    }
  })()`)
  const parsed = JSON.parse(String(raw)) as { ok: boolean; content?: string; model?: string; error?: string }
  if (!parsed.ok) {
    console.error(`LLM 调用失败：${parsed.error}`)
    process.exit(1)
  }

  // 模型可能带 markdown 围栏，抽出来
  const html = (parsed.content ?? '').replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
  if (!/<html[\s>]/i.test(html)) {
    console.error('模型输出里没有完整 HTML，已中止（不落盘半成品）')
    process.exit(1)
  }
  const target = out !== '' ? out : join(process.cwd(), 'demo.html')
  writeFileSync(target, html, 'utf8')
  console.log(`已生成 ${target}（${html.length} 字符，model=${parsed.model ?? '?'}）`)

  if (runAcceptance) {
    console.log('\n开始验收…')
    const result = spawnSync(process.execPath, [join(import.meta.dirname, 'demoAcceptance.mjs'), target], { stdio: 'inherit' })
    process.exitCode = result.status ?? 0
  }
} finally {
  cdp.close()
}
