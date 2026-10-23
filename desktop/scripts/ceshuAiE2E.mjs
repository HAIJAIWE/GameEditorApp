/**
 * 我们的项目生成 · 端到端实测脚本（AI 生成链路 E2E）
 *
 * 为什么需要它：应用内「AI 一键生成」是产品核心能力，但一直缺一次**可复跑的
 * 全链路实测**——bundle 提示词 → 真实模型 → 字段解析 → 质量门（校验+评分）→
 * 落盘。单测只锁契约与解析，锁不住「模型在真实提示词下的产出质量」。
 *
 * 用法（需应用以 --remote-debugging-port 启动，且 LLM 配置可用）：
 *   node scripts/ceshuAiE2E.mjs <cdp-ws-url> [--chapters meta,vision,gameplay,numeric] [--name 名称]
 *
 * 输出：逐章表格（tokens / 校验错误 before→after / 总分 before→after）+ 终局评分。
 * 退出码：0 = 全章生成成功；1 = 有章节失败（详情见输出）。
 *
 * ⚠️ 会**新建**一份策划书（名字带时间戳），不会动你已有的文档。
 */

const WS_URL = process.argv[2]
if (!WS_URL) {
  console.error('用法: node scripts/ceshuAiE2E.mjs <cdp-ws-url> [--chapters a,b,c] [--name 名称]')
  process.exit(2)
}

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

/** 默认只跑「设计核心」7 章：其余章依赖这 7 章的结论，空着跑没意义 */
const DEFAULT_CHAPTERS = ['meta', 'vision', 'story', 'gameplay', 'combat', 'economy', 'numeric']
const CHAPTERS = argOf('--chapters', DEFAULT_CHAPTERS.join(',')).split(',').map((s) => s.trim()).filter(Boolean)
const DOC_NAME = argOf('--name', `AI实测-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`)

const ws = new WebSocket(WS_URL)
let id = 1
const pending = new Map()

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}

function send(method, params) {
  return new Promise((resolve) => {
    const myId = id++
    pending.set(myId, resolve)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })
}

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (res.result?.exceptionDetails) {
    throw new Error(`页面执行异常: ${res.result.exceptionDetails.text ?? ''}`)
  }
  return res.result?.result?.value
}

ws.onopen = async () => {
  try {
    // 1. 新建策划书（不动用户已有文档）
    const created = JSON.parse(
      await evaluate(`(async () => JSON.stringify(await window.mbApi.ceshu.create({ name: ${JSON.stringify(DOC_NAME)} })))()`)
    )
    const docId = created.id
    console.log(`新建策划书: ${DOC_NAME} (id=${docId})`)

    const rows = []
    let failed = 0

    // 2. 逐章生成（fullGenerate 走与面板同一条链路：章节提示词 + 草稿上下文）
    for (const chapter of CHAPTERS) {
      const started = Date.now()
      const raw = await evaluate(`(async () => {
        try {
          const res = await window.mbApi.ceshu.aiGenerateChapter({
            id: ${JSON.stringify(docId)},
            chapter: ${JSON.stringify(chapter)},
            onlyEmpty: false,
            fullGenerate: { draft: {} },
            confirmed: true
          })
          return JSON.stringify({ ok: true, res })
        } catch (e) {
          return JSON.stringify({ ok: false, error: String(e) })
        }
      })()`)
      const parsed = JSON.parse(raw)
      const seconds = Math.round((Date.now() - started) / 1000)

      if (!parsed.ok) {
        failed += 1
        rows.push({ chapter, status: '失败', detail: parsed.error.slice(0, 80), seconds })
        continue
      }

      const res = parsed.res
      const fieldCount = Object.keys(res.fields ?? {}).length
      const q = res.quality ?? {}
      // 落盘：把本章生成结果写回文档（与面板「应用」同一 IPC）
      const saved = await evaluate(`(async () => {
        try {
          await window.mbApi.ceshu.saveChapter({ id: ${JSON.stringify(docId)}, chapter: ${JSON.stringify(chapter)}, data: ${JSON.stringify(res.fields ?? {})} })
          return 'OK'
        } catch (e) {
          return 'ERR:' + String(e).slice(0, 80)
        }
      })()`)
      rows.push({
        chapter,
        status: saved === 'OK' ? '成功' : `保存失败(${saved})`,
        fields: fieldCount,
        tokens: res.usage?.totalTokens ?? 0,
        errors: `${q.beforeErrors ?? '?'}→${q.afterErrors ?? '?'}`,
        score: `${q.beforeScore ?? '?'}→${q.afterScore ?? '?'}`,
        seconds
      })
    }

    // 3. 终局评分（整篇文档）
    const finalScore = JSON.parse(
      await evaluate(`(async () => JSON.stringify(await window.mbApi.ceshu.score({ id: ${JSON.stringify(docId)} })))()`)
    )

    console.log('\n章 | 状态 | 字段 | tokens | 校验错误 | 总分 | 耗时')
    for (const r of rows) {
      console.log(
        `${r.chapter} | ${r.status} | ${r.fields ?? '-'} | ${r.tokens ?? '-'} | ${r.errors ?? '-'} | ${r.score ?? '-'} | ${r.seconds}s${r.detail ? ' | ' + r.detail : ''}`
      )
    }
    console.log(
      `\n终局：总分 ${finalScore.total_score}（${finalScore.grade}）｜结构 ${finalScore.structure_score}/30｜内容 ${finalScore.content_quality_score}/40｜市场 ${finalScore.market_potential_score}/30`
    )
    process.exitCode = failed > 0 ? 1 : 0
  } catch (e) {
    console.error('ERR:', e.message)
    process.exitCode = 1
  }
  ws.close()
}

ws.onerror = (e) => {
  console.error('WS_ERROR:', e.message || e)
  process.exit(1)
}
