/**
 * 复刻单线 MVP 脚本（见 docs/plan-clone-pipeline.md）。
 *
 * 不依赖模型、也不依赖 app 运行——把「提示词 → LLM → 结构化结果 → 文档」拆成可手动串的两步：
 *   1) 取提示词：npx tsx scripts/cloneGame.ts --game "吸血鬼幸存者" [--type Roguelike]
 *      → 把输出的 SYSTEM / PROMPT 丢给任意 LLM，拿回 JSON 存成 result.json
 *   2) 套用结果：npx tsx scripts/cloneGame.ts --apply result.json [--out doc.json] [--name 名字]
 *      → 生成一份策划书 JSON，可再交给 generateDemo 出可玩 demo
 *
 * 后续 P1 再接 IPC/UI（`ceshu:cloneDecompose`），这里先把核心链路跑通、可回归。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { applyCloneDecompose, buildCloneDecomposePrompt, parseCloneDecompose } from '../src/shared/ceshu/ceshuClonePrompt'
import { createDefaultCeshu } from '../src/shared/ceshu/ceshuModel'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const game = arg('game')
const type = arg('type')
const applyFile = arg('apply')
const out = arg('out')
const name = arg('name')

if (applyFile !== undefined) {
  const raw = readFileSync(applyFile, 'utf-8')
  const fields = parseCloneDecompose(raw)
  const base = createDefaultCeshu({ scope: 'full', name: name ?? game ?? '未命名策划书' })
  const doc = applyCloneDecompose(base, fields)
  const outPath = out ?? resolve(process.cwd(), 'clone-doc.ceshu.json')
  writeFileSync(outPath, JSON.stringify(doc, null, 2), 'utf-8')
  const chapters = Object.keys(fields)
  console.log(`已生成文档：${outPath}`)
  console.log(`填了 ${chapters.length} 章：${chapters.join(', ') || '（无）'}`)
} else if (game !== undefined) {
  const built = buildCloneDecomposePrompt({ gameName: game, ...(type !== undefined ? { gameType: type } : {}) })
  console.log('=== SYSTEM ===')
  console.log(built.system)
  console.log('=== PROMPT ===')
  console.log(built.prompt)
} else {
  console.log('复刻单线 MVP：')
  console.log('  1) 取提示词：npx tsx scripts/cloneGame.ts --game "吸血鬼幸存者" [--type Roguelike]')
  console.log('  2) 套用结果：npx tsx scripts/cloneGame.ts --apply result.json [--out doc.json] [--name 名字]')
}
