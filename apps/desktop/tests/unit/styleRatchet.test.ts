import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 样式守卫**棘轮**：把 dsh `ui-theme` 那四张自动 spec（radius / corner-shape /
 * elevation / menu）里能在墨白静态校验的两条，落成「只许降不许升」的数字。
 *
 * ## 为什么是棘轮而不是全绿才算完
 * `styles.css` 有一万多行为迁移期存量：51 处非阶梯字面圆角、组件区若干字面颜色。
 * 要求一次清零等于永远不开始；而没有守卫的渐进迁移一定会反弹。与
 * `i18nCoverage.test.ts` 同一范式：修一处就把 BASELINE 减一，想写新的字面量
 * 必须先还掉一笔旧债。
 *
 * ## 与 dsh 的对应关系
 * - `docs/ui-radius.zh.md:30-41`：圆角按用途取 R4/8/12/16/20/28，禁止 10/14/18/24
 *   一类局部数值 → 对应「非阶梯字面圆角」。
 * - `ui-theme/src/styles/corner-shape.css`：全圆/胶囊声明必须与
 *   `corner-shape: round` 配对，否则 superellipse(1.5) 会把圆压成方圆形
 *   → 对应「未配对全圆」硬约束（本轮已清零，BASELINE 恒为 0）。
 * - elevation / menu 两张 spec 依赖 `--dsw-elevation-*` 与 `MenuSurface` 材质，
 *   墨白尚无对应概念，不在本守卫范围，勿假装覆盖。
 *
 * ## 判据（刻意宽松）
 * - 先剥注释，再按最内层 `{...}` 切规则块；不解析选择器特异性、不展开嵌套。
 * - `:root` / `[data-theme=...]` 是**令牌定义区**，允许字面颜色（这正是它们的工作）。
 * - 只认 `<N>px` 形式的字面圆角；`var()` / `calc()` / `%` / 关键字一律放行。
 * - 只数「违规块」不数「违规声明」：数字越精细越容易被无意义改动刷分。
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')
const CSS_ROOT = 'apps/desktop/src/renderer/src'

/**
 * 存量基线（2026-11-04 实测）：修掉一处就减一，新增字面量前先还债。
 * 59 个非阶梯字面圆角块 / 136 个组件区字面颜色块是迁移期存量——注意这正说明
 * 墨白「tokens only」只在 :root 令牌层成立，组件区尚未收敛；守卫先锁住不恶化。
 */
const BASELINE_LITERAL_RADIUS = 59
const BASELINE_LITERAL_COLOR = 136

/** dsh `base.css` 的圆角阶梯；0 是直角，999px/50% 是全圆例外。 */
const RADIUS_STEPS = new Set(['0px', '4px', '8px', '12px', '16px', '20px', '28px'])
const FULL_ROUND = /^(?:50%|100%|999px|9999px)$/u
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/u

interface CssBlock {
  readonly file: string
  readonly selector: string
  readonly body: string
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.isFile() && /\.css$/u.test(entry.name)) out.push(full)
  }
  return out
}

/** 剥注释但保留换行，块注释内容替换为等量空白，避免把相邻 token 粘连。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, (match) => match.replace(/[^\n]/gu, ' '))
    .replace(/^\s*\/\/.*$/gmu, '')
}

/** 最内层规则块：不含嵌套 `{`，足以覆盖组件声明与 @media 内的规则。 */
function blocksOf(source: string, file: string): CssBlock[] {
  const blocks: CssBlock[] = []
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    blocks.push({ file, selector: match[1].trim().split('\n').pop()?.trim() ?? '', body: match[2] })
  }
  return blocks
}

/** 令牌定义区：`:root` 与各主题覆盖块允许字面颜色。 */
function isTokenBlock(selector: string): boolean {
  return selector === ':root' || /^\[data-theme/u.test(selector) || /^:root\b/u.test(selector)
}

function radiusDeclarations(body: string): string[] {
  const values: string[] = []
  for (const match of body.matchAll(/border-radius(?:-[a-z]+)?\s*:\s*([^;}]+)/gu)) {
    for (const token of match[1].trim().split(/\s+/u)) {
      if (/^\d+(?:\.\d+)?px$/u.test(token)) values.push(token)
    }
  }
  return values
}

function isFullRoundBlock(body: string): boolean {
  return [...body.matchAll(/border-radius(?:-[a-z]+)?\s*:\s*([^;}]+)/gu)]
    .some((match) => FULL_ROUND.test(match[1].trim().split(/\s+/u)[0] ?? ''))
}

const files = walk(resolve(REPO_ROOT, CSS_ROOT))
const sheets = files.map((file) => ({
  file: relative(REPO_ROOT, file),
  source: stripComments(readFileSync(file, 'utf8'))
}))
const blocks = sheets.flatMap((sheet) => blocksOf(sheet.source, sheet.file))

const literalRadiusBlocks = blocks.filter((block) =>
  radiusDeclarations(block.body).some((value) => !RADIUS_STEPS.has(value) && !FULL_ROUND.test(value))
)
const unpairedRoundBlocks = blocks.filter(
  (block) => isFullRoundBlock(block.body) && !/corner-shape\s*:\s*round/u.test(block.body)
)
const literalColorBlocks = blocks.filter(
  (block) => !isTokenBlock(block.selector) && COLOR_LITERAL.test(block.body)
)

function describeSample(items: CssBlock[]): string {
  return items.slice(0, 8).map((block) => `${block.file} { ${block.selector} }`).join('\n')
}

describe('样式守卫棘轮（对齐 dsh radius / corner-shape spec）', () => {
  it('扫描范围非空（防止路径写错导致守卫静默通过）', () => {
    expect(files.length).toBeGreaterThanOrEqual(1)
    expect(blocks.length).toBeGreaterThan(200)
  })

  it('全圆/胶囊声明必须配对 corner-shape: round（硬约束，恒为 0）', () => {
    expect(
      unpairedRoundBlocks.length,
      `${unpairedRoundBlocks.length} 个规则块的全圆声明未配对 corner-shape: round。\n` +
        `superellipse(1.5) 会把圆压成方圆形。前几个：\n${describeSample(unpairedRoundBlocks)}`
    ).toBe(0)
  })

  it(`非阶梯字面圆角不得超过基线 ${BASELINE_LITERAL_RADIUS}（只许降不许升）`, () => {
    expect(
      literalRadiusBlocks.length,
      `还有 ${literalRadiusBlocks.length} 个规则块写了非阶梯字面圆角（基线 ${BASELINE_LITERAL_RADIUS}）。\n` +
        `请改用 --radius-xs/sm/md/lg/xl/panel；迁移一块就把基线减一。\n` +
        `前几个：\n${describeSample(literalRadiusBlocks)}`
    ).toBeLessThanOrEqual(BASELINE_LITERAL_RADIUS)
  })

  it(`组件区字面颜色不得超过基线 ${BASELINE_LITERAL_COLOR}（只许降不许升）`, () => {
    expect(
      literalColorBlocks.length,
      `还有 ${literalColorBlocks.length} 个非令牌区规则块写了字面颜色（基线 ${BASELINE_LITERAL_COLOR}）。\n` +
        `请改用语义 var()；迁移一块就把基线减一。\n前几个：\n${describeSample(literalColorBlocks)}`
    ).toBeLessThanOrEqual(BASELINE_LITERAL_COLOR)
  })

  it('dsh 令牌阶梯与新增别名不得被删', () => {
    const rootSheet = sheets.find((sheet) => sheet.file.endsWith('styles.css'))
    expect(rootSheet, 'styles.css 必须存在').toBeDefined()
    for (const token of [
      '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-panel',
      '--border-card', '--watermark-ink'
    ]) {
      expect(rootSheet?.source, `缺少令牌 ${token}`).toContain(`${token}:`)
    }
    expect(rootSheet?.source).toContain('corner-shape: superellipse(1.5)')
  })
})
