import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 样式守卫：把 dsh `ui-theme` 那四张自动 spec（radius / corner-shape /
 * elevation / menu）里能在墨白静态校验的两条落成测试。
 *
 * - **圆角与全圆是硬约束**（恒 0）：全部 124 处字面 px 圆角已按
 *   `docs/ui-radius.zh.md` 的用途档收敛为 `--radius-*`，30 处全圆声明已配对
 *   `corner-shape: round`。这两项一旦回升就是回归，不需要棘轮。
 * - **组件区字面颜色仍是棘轮**（只许降）：已从 136 收敛到 114（本轮把浅色档
 *   值精确等价的中性交互色换成 `--bg-hover` / `--border` / `--border-card` /
 *   `--border-strong` / `--accent`，并把刻意不随主题反演的恒白前景收进
 *   `--ink-on-solid`）。剩余多是 hljs 色板、暗色卡片与阴影遮罩，
 *   逐类建语义 token + 四主题值需要继续分轮，不能刷数字式替换。
 *   与 `i18nCoverage.test.ts` 同范式：修一块就把 BASELINE 减一。
 *
 * ## 诚实边界
 * elevation / menu 两张 spec 依赖 `--dsw-elevation-*` 与 `MenuSurface` 材质，
 * 墨白尚无对应概念，不在本守卫范围，勿假装覆盖。
 *
 * ## 判据（刻意宽松）
 * - 先剥注释，再按最内层 `{...}` 切规则块；不解析选择器特异性、不展开嵌套。
 * - `:root` / `[data-theme=...]` 是**令牌定义区**，允许字面颜色（这正是它们的工作）。
 * - 只认 `<N>px` 形式的字面圆角；`0` 直角与 `50%/999px` 全圆是例外，
 *   `var()` / `calc()` / `%` / 关键字一律放行。
 * - 只数「违规块」不数「违规声明」：数字越精细越容易被无意义改动刷分。
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')
const CSS_ROOT = 'apps/desktop/src/renderer/src'

/**
 * 组件区字面颜色存量基线（2026-11-04 实测）：**136 -> 114**（本轮按「浅色档值
 * 精确等价 + 语义明确」收敛 31 处声明 / 22 个块）。修掉一块就减一，新增前先还债。
 * 剩余主要是 hljs 词法色板、插件市场暗色卡片、阴影/遮罩与专用语义色——各有
 * 独立主题机制或需逐类建 token，不能盲换，见当日日志。
 */
const BASELINE_LITERAL_COLOR = 114
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
  radiusDeclarations(block.body).some(
    (value) => !FULL_ROUND.test(value) && value !== '0px' && value !== '0'
  )
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

  it('组件区不得写死 px 圆角（一律走 --radius-* token，硬约束）', () => {
    expect(
      literalRadiusBlocks.length,
      `${literalRadiusBlocks.length} 个规则块仍写了字面 px 圆角。\n` +
        `按 dsh ui-radius 规范改用 --radius-xs/sm/md/lg/xl/panel；0 直角与全圆是例外。\n` +
        `前几个：\n${describeSample(literalRadiusBlocks)}`
    ).toBe(0)
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
