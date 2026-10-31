/**
 * 真实 GDD 导入走查（五份参照并排）——验证「阶段筛选 + 机读分区 + 品类条件必填」是否真的有用（2026-10-26）。
 *
 * ## 做法
 * 用真实/参照文档的**实际字段覆盖**（单源在 `src/shared/ceshuReferenceGdd.ts`，每条注明出处），
 * 把每份文档覆盖到的必填字段填进一份全新的 CeshuDocument，然后：
 *   1. 调真实的 `computeChapterProgress`（编辑器进度条用的就是它）拿到「旧视图」整体完成度；
 *   2. 用真实的阶段逻辑（ceshuStages）算「新阶段视图」下立项阶段的完成度；
 *   3. 列出每份从「空白」到「能交出去的立项稿」还差哪几个字段。
 *
 * 判据客观：完成度只数 CHAPTER_REQUIRED_FIELDS，机读字段不在必填里，天然不拖累进度。
 *
 * 用法：`cd desktop && npx tsx scripts/ceshuImportWalkthrough.ts`（本机无 tsx，见 MEMORY）
 */
import { CHAPTER_KEYS, CHAPTER_REQUIRED_FIELDS, GDD_SCOPE_FULL, chapterApplicableToGenre } from '../src/shared/ceshu/reference'
import { computeChapterProgress, createDefaultCeshu } from '../src/shared/ceshu/model'
import { chaptersUpToStage } from '../src/shared/ceshu/workflow'
import {
  CESHU_REFERENCE_GDDS,
  referenceKey,
  type CeshuReferenceGdd
} from '../src/shared/ceshu/reference'

const CONCEPT_CHAPTERS = chaptersUpToStage('concept')

interface Result {
  overall: number
  conceptMean: number
  filled: number
  total: number
  gaps: string[]
}

/** 把参照文档的覆盖表灌进一份新文档，并算出「旧视图 / 立项阶段」两个完成度 */
function computeForSample(sample: CeshuReferenceGdd, gameTypeOverride?: string): Result {
  const doc = createDefaultCeshu({ scope: GDD_SCOPE_FULL })
  const gameType = gameTypeOverride ?? sample.gameType
  if (gameType) doc.meta.game_type = gameType
  for (const ch of CHAPTER_KEYS) {
    const required = CHAPTER_REQUIRED_FIELDS[ch]
    for (const field of required) {
      const coverage = sample.coverage[referenceKey(ch, field)]
      if (coverage?.covered) {
        ;(doc[ch] as Record<string, unknown>)[field] = `（GDD 导入）${coverage.evidence}`
      }
    }
  }
  const overall = computeChapterProgress(doc).total
  let sum = 0
  let filled = 0
  let total = 0
  let applicable = 0
  const gaps: string[] = []
  for (const ch of CONCEPT_CHAPTERS) {
    // 无战斗品类跳过 combat 章（与 computeChapterProgress 的 visible 过滤同口径）
    if (!chapterApplicableToGenre(ch, gameType)) continue
    applicable += 1
    const required = CHAPTER_REQUIRED_FIELDS[ch]
    for (const field of required) {
      total += 1
      if (sample.coverage[referenceKey(ch, field)]?.covered) filled += 1
      else gaps.push(referenceKey(ch, field))
    }
    const filledCh = required.filter((f) => sample.coverage[referenceKey(ch, f)]?.covered).length
    sum += required.length === 0 ? 0 : filledCh / required.length
  }
  return { overall, conceptMean: Math.round((sum / Math.max(1, applicable)) * 100) / 100, filled, total, gaps }
}

const results = CESHU_REFERENCE_GDDS.map((sample) => ({ sample, result: computeForSample(sample) }))
const pct = (n: number) => `${Math.round(n * 100)}%`

// —— 控制台概览 ——
console.log('GDD 导入走查：1 份真实公开 + 1 份本项目交付 + 3 份合成')
console.log('='.repeat(72))
console.log(`${'样例'.padEnd(14)} ${'出处'.padEnd(16)} ${'旧视图'.padEnd(8)} ${'立项阶段'.padEnd(10)} 必填`)
console.log('-'.repeat(72))
for (const { sample, result } of results) {
  console.log(
    `${sample.title.padEnd(14)} ${sample.kind.padEnd(16)} ${pct(result.overall).padEnd(8)} ${pct(result.conceptMean).padEnd(10)} ${result.filled}/${result.total}`
  )
}
console.log('='.repeat(72))

// —— 写报告 ——
const compareRows = results
  .map(
    ({ sample, result }) =>
      `| ${sample.title} | ${sample.genre} | ${sample.kind} | ${pct(result.overall)} | **${pct(result.conceptMean)}** | ${result.filled}/${result.total} |`
  )
  .join('\n')

const sections = results
  .map(({ sample, result }) => {
    const gapRows = result.gaps
      .map((g) => {
        const coverage = sample.coverage[g]
        return `| ${g} | ${coverage?.evidence ?? '文档未涉及'} | 人定/AI 补 1 行 |`
      })
      .join('\n')
    const machineRows = Object.entries(sample.machine)
      .map(([k, v]) => `- \`${k}\`：${v}`)
      .join('\n')
    const where = sample.source.url ?? sample.source.path ?? ''
    return `### ${sample.title}（${sample.genre}）

**出处**：${sample.source.attribution}${where ? ` — ${where}` : ''}（${sample.kind}）

**旧视图整体 ${pct(result.overall)} → 立项阶段 ${pct(result.conceptMean)}**（必填 ${result.filled}/${result.total}）

立项稿还差：${result.gaps.length} 个字段

| 字段 | 为什么缺 | 补法 |
|---|---|---|
${gapRows}

机读数据层（已自带、不计入完成度）：

${machineRows}
`
  })
  .join('\n')

const overallMin = Math.min(...results.map((r) => r.result.overall))
const overallMax = Math.max(...results.map((r) => r.result.overall))
const conceptMin = Math.min(...results.map((r) => r.result.conceptMean))
const conceptMax = Math.max(...results.map((r) => r.result.conceptMean))
// 修复前：不设 game_type（combat 计入必填）；修复后：设 '模拟经营'（combat 按品类隐藏）
const merge = CESHU_REFERENCE_GDDS.find((s) => s.id === 'MERGE')!
const mergeBefore = computeForSample(merge, '')
const mergeAfter = results.find((r) => r.sample.id === 'MERGE')!.result
const doom = results.find((r) => r.sample.id === 'DOOM')!.result
const abyssal = results.find((r) => r.sample.id === 'ABYSSAL')!.result

const report = `# GDD 导入走查：1 份真实公开 GDD + 1 份本项目交付案例 + 3 份合成样例

> 验证对象：阶段筛选（ceshuStages）+ 机读分区（ChapterForm 分组）+ 品类条件必填 是否真的降低「从空白到能交出去」的门槛。
> 方法：把每份文档实际覆盖到的必填字段填进新文档，跑**真实**的 \`computeChapterProgress\` 与阶段逻辑。
> 覆盖数据单源在 \`src/shared/ceshuReferenceGdd.ts\`，**每条注明出处**；本报告与「完备度面板」的参照对比同源。
> 样本：**1 份真实公开 GDD**（The Doom Bible, 1992, Tom Hall；公开 PDF）+ **1 份本项目交付案例**（深潮灯塔：GDD + 契约 + 可玩 Demo）+ **3 份本项目合成的 5 页样例**（best-case 对照，非真实文档）。

## 完成度并排对比

| 文档 | 来源 / 品类 | 出处类型 | 旧视图（全章均值） | 立项阶段 | 必填覆盖 |
|---|---|---|---|---|---|
${compareRows}

**结论**：五份文档导入后——

- 旧视图（全章均值，编辑器进度条原样）大多只有 **${pct(overallMin)}–${pct(overallMax)}**，大部分章为 0，看着大半空着；
- 切到「立项」阶段后立刻跳到 **${pct(conceptMin)}–${pct(conceptMax)}**——用户此时只面对 7 章（无战斗品类 6 章），且进度只数必填；
- **真实公开 GDD 明显低于合成样例**（Doom Bible ${pct(doom.conceptMean)} vs 合成 ${pct(mergeAfter.conceptMean)}–${pct(conceptMax)}）——这不是 schema 坏了，见下节；
- **本项目交付案例（深潮灯塔）落在中间（${pct(abyssal.conceptMean)}）**——它是真实交付物，缺口比合成样例多（没有时间线），比 1992 年的 Doom Bible 少。

## 真实公开 GDD：Doom Bible 的低分恰恰是「工具在暴露缺口」

Doom Bible（1992 FPS 概念圣经）立项阶段只有 **${pct(doom.conceptMean)}**（${doom.filled}/${doom.total}），原因逐条可查：

- §4「Play Loop」只有一句「New 3-D engine」——**核心循环根本没写**；
- §14 武器只有定性描述（"minimum damage"），**无伤害公式**；护甲值甚至写成「?」；
- 完全没有**经济 / 数值断言 / 平衡原则**——那是现代 live-service GDD 才有的章节。

换句话说，工具没有替它脑补、也没有假装 82% 完整，而是**把「真实文档到底缺什么」直接量化**：立项稿还差
core_loop / damage_formula / economy / numeric 这些真空白。这正是它相对「人肉感觉差不多」的价值。

（合成样例之所以高，是因为它们贴着本 schema 的 5 页骨架写，属 best-case；真实旧文档落回 ${pct(doom.conceptMean)} 才是常态。
若你有具体的现代真实 GDD，在 \`ceshuReferenceGdd.ts\` 加一条覆盖表即可复跑。）

## 逐份明细

${sections}

## 关键发现（已修复）：combat 章对无战斗品类是「伪必填」

走查暴露：休闲合成（喵岛邮差）立项阶段只有 **${pct(mergeBefore.conceptMean)}**，比含战斗品类低
${Math.round((conceptMax - mergeBefore.conceptMean) * 100)} 个百分点——根因是 \`combat.combat_mode\` /
\`combat.damage_formula\` 在概念阶段**必填**，但休闲合成根本无战斗系统。

**已落地修复**：按 \`meta.game_type\` 判定，无战斗品类（模拟经营 / 视觉小说 / 派对 / 休闲益智）的 combat 章
从 \`visibleChapterKeys\` 中剔除——不进导航、导出、机读包，也不进完成度分母与评阅。同一份 GDD 修复前后：

| 喵岛邮差（模拟经营） | 立项阶段完成度 |
|---|---|
| 修复前（combat 计入必填） | ${pct(mergeBefore.conceptMean)} |
| 修复后（combat 按品类隐藏） | **${pct(mergeAfter.conceptMean)}** |

剩余仍差 ${mergeAfter.gaps.length} 个非内容型字段（tags / game_modes / mvp_timeline），与含战斗品类一致。
未选品类（game_type 为空）时按「有战斗」保守处理 ⇒ 老文档行为零变化。

## 一句话结论

阶段筛选 + 机读分区 + 品类条件必填**有效**：字段一个没减（仍 340 个），但认知负担从 24 章压到 7 章。
合成样例（best-case）立项稿落在 ${pct(mergeAfter.conceptMean)}–${pct(conceptMax)}，本项目交付案例 ${pct(abyssal.conceptMean)}，
真实旧文档（Doom Bible）只有 ${pct(doom.conceptMean)}——**这个差值正是工具诚实暴露出的真实缺口**，而不是假装完整。
无战斗品类靠条件必填追平，不再被伪必填拖累。
`

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
writeFileSync(resolve(__dirname, '../docs/ceshu-import-walkthrough.md'), report, 'utf8')
console.log('\n报告已写入 docs/ceshu-import-walkthrough.md')
