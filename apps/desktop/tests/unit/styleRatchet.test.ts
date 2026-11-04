import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 样式守卫：把 dsh `ui-theme` 那几张自动 spec（radius / corner-shape /
 * elevation / menu）里能在墨白静态校验的部分落成测试。
 *
 * - **圆角、全圆配对、投影墨色是硬约束**（恒 0）：字面 px 圆角已全量收敛为
 *   `--radius-*`，全圆声明已配对 `corner-shape: round`，投影墨色走
 *   `--elevation-ink-*`。这三项一旦回升就是回归，不需要棘轮。
 * - **组件区字面颜色已升为硬约束**（恒 0）：最后 48 块 / 40 个值按 dsh
 *   `web-styling.md:11` 的「组件局部契约」收成精确等价的语义 token。
 * - **未定义 token 名是硬约束**（恒 0）：10 个假 token / 24 处已全部修复，
 *   并清掉 37 行已定义 token 的死 fallback，详见 `undefinedTokenNames` 上方注释。
 *
 * ## 两类刻意豁免（都带对价测试，不是放宽标准）
 * 1. `highlight.js` 自包含词法色板：`.hljs*` 有完整的浅色基 +
 *    `[data-theme="dark"] .hljs*` 覆盖，本来就是一套独立主题机制，
 *    把它的字面色算成「没随主题走」是误报。豁免的对价是「dark 覆盖必须还在」
 *    —— 若有人删掉覆盖，豁免随即失效（下面有测试）。
 * 2. `var(--x, #fallback)` 里的 fallback 字面量：组件主值已经走 token，
 *    fallback 只是防御值，不算「组件写死颜色」。但 fallback 引用的 token
 *    **若从未定义**，说明该处其实一直在用 fallback、完全不随主题切换，
 *    这是真 bug，另由「未定义 token 名」棘轮锁住不许新增。
 *
 * ## 诚实边界
 * - **elevation 只覆盖了「投影墨色必须走 token」这一条**。dsh 的
 *   `--dsw-elevation-panel/prominent/soft` 三件套是 `0.5px 发丝描边 +
 *   0.03~0.05 极淡柔光`，且要求 elevated 表面 `border: 0`；墨白现有的是
 *   `0.12~0.4` 实投影，硬套会让浮层失去分离感。本仓保留原强度，**未**引入
 *   三件套与 `border: 0` 配对检查，别假装完全对齐。
 * - menu spec 依赖 `MenuSurface` 材质与 `--dsw-menu-surface-fill`，墨白无对应概念。
 *
 * ## 判据（刻意宽松）
 * - 先剥注释，再按最内层 `{...}` 切规则块；不解析选择器特异性、不展开嵌套。
 * - 令牌定义区只认 `:root` 与**纯** `[data-theme=...]` 属性选择器；
 *   `[data-theme="dark"] .hljs-x` 是组件规则，不当令牌区。
 * - 只认 `<N>px` 形式的字面圆角；`0` 直角与 `50%/999px` 全圆是例外。
 * - 只数「违规块」不数「违规声明」：数字越精细越容易被无意义改动刷分。
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO_ROOT = resolve(HERE, '../../../..')
const CSS_ROOT = 'apps/desktop/src/renderer/src'

/**
 * 组件区字面颜色收敛史（2026-11-04）：**136 -> 114 -> 94 -> 48 -> 0**。
 * 前三轮是实际迁移（中性交互色 22 块、投影/遮罩墨色 20 块）；-46 来自
 * **修正两类误报**（hljs 自带主题色板、var() fallback 字面量），不是迁移成绩；
 * 最后 48 块 / 40 个值按用途收成专用语义 token（状态色板 / 语法色板 /
 * 字段步骤 ink / 按钮中性填充），每档值与原字面量精确等价、零视觉变化。
 * 已归零，下方改为硬约束，不再需要棘轮。
 */

/**
 * 「引用了但从未定义」的 token 名曾查出 10 个（--bg-elevated / --bg-subtle /
 * --border-color / --font-mono / --hover-bg / --mono-font / --panel-bg /
 * --surface / --surface-2 / --text-tertiary，共 24 处使用），fallback 一直生效、
 * 相关位置完全不随主题切换。现已全部修复：8 处直接改用已有 var()、5 处统一到
 * --font-code、11 处建语义 token 并在 dark/night 覆盖。下面是**硬约束**，恒为 0。
 */

const FULL_ROUND = /^(?:50%|100%|999px|9999px)$/u
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/u
const VAR_WITH_FALLBACK = /var\(\s*(--[a-z][a-z0-9-]*)\s*,/gu

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

/** 令牌定义区：`:root` 与纯主题属性选择器块允许字面颜色。 */
function isTokenBlock(selector: string): boolean {
  return selector === ':root' || /^\[data-theme[^\]]*\]$/u.test(selector) || /^:root\b/u.test(selector)
}

/** highlight.js 自包含词法色板（浅色基 + dark 覆盖），自带主题机制，不是债。 */
function isPaletteBlock(selector: string): boolean {
  return selector.includes('.hljs')
}

/** 把 `var(...)` 的参数整体抹掉，只保留「裸字面量」参与颜色统计。 */
function withoutVarFallbacks(body: string): string {
  return body.replace(/var\([^)]*\)/gu, 'var()')
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
  (block) =>
    !isTokenBlock(block.selector) &&
    !isPaletteBlock(block.selector) &&
    COLOR_LITERAL.test(withoutVarFallbacks(block.body))
)
/** dsh elevation spec 可静态校验的那一条：投影墨色必须走 token，几何仍归组件。 */
const literalShadowBlocks = blocks.filter((block) =>
  [...withoutVarFallbacks(block.body).matchAll(/box-shadow\s*:\s*([^;}]+)/gu)]
    .some((match) => COLOR_LITERAL.test(match[1]))
)

/** 所有定义过的自定义属性名。 */
const definedTokens = new Set<string>()
for (const sheet of sheets) {
  for (const match of sheet.source.matchAll(/(--[a-z][a-z0-9-]*)\s*:/gu)) definedTokens.add(match[1])
}
/** 带 fallback 却从未定义的 token 名（真 bug：fallback 一直生效、不随主题）。 */
const undefinedTokenNames = new Set<string>()
for (const sheet of sheets) {
  for (const match of sheet.source.matchAll(VAR_WITH_FALLBACK)) {
    if (!definedTokens.has(match[1])) undefinedTokenNames.add(match[1])
  }
}

/** hljs 豁免的对价：浅色块与 dark 覆盖规则都必须存在。 */
const hljsBlocks = blocks.filter((block) => isPaletteBlock(block.selector))
const rootSheet = sheets.find((sheet) => sheet.file.endsWith('styles.css'))
const darkHljsRules = (rootSheet?.source.match(/\[data-theme="dark"\][^{]*\.hljs/gu) ?? []).length

function describeSample(items: CssBlock[]): string {
  return items.slice(0, 8).map((block) => `${block.file} { ${block.selector} }`).join('\n')
}

describe('样式守卫棘轮（对齐 dsh radius / corner-shape / elevation spec）', () => {
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

  it('box-shadow 不得写死颜色（走 --elevation-ink-* token，硬约束）', () => {
    expect(
      literalShadowBlocks.length,
      `${literalShadowBlocks.length} 个规则块的投影仍写了字面颜色。\n` +
        `按 dsh elevation 规范把墨色改为 --elevation-ink-* / --mask-*，几何部分保持原样。\n` +
        `前几个：\n${describeSample(literalShadowBlocks)}`
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

  it('组件区不得写死颜色（一律走语义 token，硬约束）', () => {
    expect(
      literalColorBlocks.length,
      `${literalColorBlocks.length} 个规则块仍写了裸字面颜色。\n` +
        `按 dsh tokens-only 改用语义 var()；专用色见 :root 的专用语义色组。\n` +
        `前几个：\n${describeSample(literalColorBlocks)}`
    ).toBe(0)
  })

  it('hljs 色板豁免有对价：浅色基与 dark 覆盖必须同时存在', () => {
    expect(hljsBlocks.length, '找不到 .hljs 规则块，豁免可能已失效').toBeGreaterThanOrEqual(8)
    expect(
      darkHljsRules,
      `[data-theme="dark"] .hljs* 覆盖不足（${darkHljsRules} 条）；删掉覆盖后豁免会漏掉真实债`
    ).toBeGreaterThanOrEqual(8)
  })

  it('不得引用未定义的 token（硬约束，恒为 0）', () => {
    expect(
      undefinedTokenNames.size,
      `${undefinedTokenNames.size} 个 var(--x, fallback) 引用了从未定义的 token。\n` +
        `这些位置的 fallback 会一直生效、完全不随主题切换。\n` +
        `清单：${[...undefinedTokenNames].sort().join(', ')}`
    ).toBe(0)
  })

  it('作用域局部 token 的 fallback 不得丢失（回归守卫）', () => {
    // --item-form-control-max 只在 [data-testid='ceshu-data-overlay'] 作用域定义（1fr），
    // 嵌入态继承不到，必须保留 360px fallback；曾因「全仓见过定义」被批量简化而回归。
    expect(rootSheet?.source).toContain('var(--item-form-control-max, 360px)')
  })

  it('dsh 令牌阶梯与新增别名不得被删', () => {
    expect(rootSheet, 'styles.css 必须存在').toBeDefined()
    for (const token of [
      '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-panel',
      '--border-card', '--border-strong', '--watermark-ink', '--ink-on-solid',
      '--elevation-ink-dropdown', '--mask-backdrop',
      '--font-code', '--surface-dark-card', '--surface-quiet', '--border-legacy', '--syntax-comment',
      '--status-ok-bg', '--syntax-string', '--ink-ai-draft', '--solid-btn-bg'
    ]) {
      expect(rootSheet?.source, `缺少令牌 ${token}`).toContain(`${token}:`)
    }
    expect(rootSheet?.source).toContain('corner-shape: superellipse(1.5)')
  })
})
