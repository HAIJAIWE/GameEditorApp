/**
 * 策划书字段契约覆盖率 —— 可复现的度量（口径与守卫测试完全一致）。
 *
 * ## 为什么要有这个脚本
 * `docs/ceshu-config-audit.md` 头部的「19% → 93%」是个**冻结的数字**：它是
 * 2026-10-23 按当时的字段表（240/259）算的，之后档 4 把 4 套字段目录合并成
 * `ceshuSchema/`、字段表里多了拆分产物，同一个「覆盖率」再也没人能算回 93%。
 * 数字一旦不可复现，就成了宣传而不是指标——所以这里把口径写死成代码。
 *
 * ## 口径（必须与 `tests/unit/ceshuFieldMeta.test.ts` 守卫一致）
 * - 章节范围：`CHAPTER_KEYS` 去掉 `systems`（动态配置，不参与静态统计）；
 *   字段为空的章自然贡献 0；
 * - 字段提示：一律走 `resolveFieldMeta(chapter, field)`，即**含 schema 层
 *   `splitHints` 叠加后的最终契约**——直接读字段 def 上的 `aiHint` 会漏掉
 *   `_points`/`_notes` 这类拆分产物，把覆盖率算低（实测 71% vs 83%）；
 * - 分母含拆分产物（它们同样是 AI 要填的字段）。
 *
 * 用法：`cd desktop && npx tsx scripts/ceshuCoverage.ts [--json]`
 */
import { CHAPTER_KEYS } from '../src/shared/ceshu/ceshuConstants'
import { CESHU_CHAPTER_FIELDS, resolveFieldMeta } from '../src/shared/ceshu/ceshuFields'

interface ChapterCoverage {
  chapter: string
  total: number
  /** AI 可起草字段数（`aiDraftable !== false`）——人定字段不该有 aiHint，算进分母只会稀释真实缺口 */
  draftable: number
  aiHint: number
  reviewHint: number
}

const chapters: ChapterCoverage[] = []
for (const chapter of CHAPTER_KEYS) {
  if (chapter === 'systems') continue
  const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
  if (fields.length === 0) continue
  const row: ChapterCoverage = { chapter, total: fields.length, draftable: 0, aiHint: 0, reviewHint: 0 }
  for (const field of fields) {
    const meta = resolveFieldMeta(chapter, field)
    if (meta.aiDraftable) row.draftable += 1
    if (meta.aiHint !== '') row.aiHint += 1
    if (meta.reviewHint !== '') row.reviewHint += 1
  }
  chapters.push(row)
}

const sum = (pick: (row: ChapterCoverage) => number) => chapters.reduce((acc, row) => acc + pick(row), 0)
const total = sum((row) => row.total)
const draftable = sum((row) => row.draftable)
const aiHint = sum((row) => row.aiHint)
const reviewHint = sum((row) => row.reviewHint)
const pct = (n: number, d: number) => `${Math.round((n / d) * 100)}%`

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total, draftable, aiHint, reviewHint, chapters }, null, 2))
} else {
  console.log('字段契约覆盖率（口径：CHAPTER_KEYS 去 systems，含拆分产物，hint 经 resolveFieldMeta）')
  console.log(`  字段总数      ${total}（其中 AI 可起草 ${draftable}、人定 ${total - draftable}）`)
  console.log(`  aiHint        ${aiHint} / ${total} = ${pct(aiHint, total)}（全字段口径）`)
  console.log(`                ${aiHint} / ${draftable} = ${pct(aiHint, draftable)}（AI 可起草口径，更能反映真实缺口）`)
  console.log(`  reviewHint    ${reviewHint} / ${total} = ${pct(reviewHint, total)}`)

  const weakest = [...chapters]
    .map((row) => ({ ...row, rate: row.draftable === 0 ? 1 : row.aiHint / row.draftable }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5)
  console.log('\naiHint 覆盖率最低的 5 章（AI 可起草口径）：')
  for (const row of weakest) {
    const detail = row.draftable === 0 ? '无可起草字段' : `${row.aiHint}/${row.draftable} = ${pct(row.aiHint, row.draftable)}`
    console.log(`  ${row.chapter.padEnd(16)} ${detail}`)
  }
}

