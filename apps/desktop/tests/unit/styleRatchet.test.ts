import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 样式守卫：把 dsh `ui-theme` 那几张自动 spec（radius / corner-shape /
 * elevation / hover / 发丝线 / menu）里能在墨白静态校验的部分落成测试。
 *
 * ## 15 项检查的构成（10 硬约束 + 5 自检，**已无棘轮**）
 * 按用例顺序编号：1–8 与 14–15 是硬约束（恒 0，回升即回归），9–13 是自检 / 对价。
 * **硬约束 1–8**
 * 1. 全圆声明必须配对 `corner-shape: round`
 * 2. 组件区不得写死 px 圆角（走 `--radius-*`）
 * 3. 组件区不得写死裸字面颜色（走语义 token）
 * 4. `box-shadow` 不得写死颜色（走 `--elevation-ink-*` / `--mask-*`）
 * 5. 不得引用未定义的 token（曾查出 10 个假 token / 24 处，已全修）
 * 6. hover 查询不得用 `any-hover` 或 hover+pointer 混合条件
 * 7. 裸 `:hover` 必须包在 `@media (hover: hover)` 内（75 → 0）
 * 8. 中性实线边框必须是 0.5px 发丝线（170 → 0；2px+ 强调线豁免）
 * **自检 / 对价 9–13**
 * 9. 扫描范围非空（防路径写错静默通过）
 * 10. hljs 色板豁免有对价（dark 覆盖必须仍在）
 * 11. 作用域局部 token 的 fallback 不得丢失（回归守卫）
 * 12. dsh 令牌阶梯与新增别名不得被删
 * 13. 焦点环与输入模态抑制规则不得被删（a11y：键盘用户必须看得见焦点）
 * 14. 字号必须走 `--text-*` 档位（不得再手写 `font-size: calc(<N>px * var(--ui-font-scale))`；
 *     非 1 因子如 `* 1.1` / `* 12/13` 例外，因为整数档位里没有对应值）
 * 15. 字号不得写死裸 px（必须跟随 `--ui-font-scale`）：本仓字号是设置面板里
 *     用户可调的（10–21px = scale 0.77–1.62），写死的那部分不会跟着变，
 *     界面会出现「一半放大一半不动」。6 处刻意固定的展示型字号走白名单，
 *     白名单带对价：删了对应声明就要同步删白名单，否则测试红。
 *
 * ## 两类刻意豁免（都带对价测试，不是放宽标准）
 * 1. `highlight.js` 自包含词法色板：`.hljs*` 有完整的浅色基 +
 *    `[data-theme="dark"] .hljs*` 覆盖，本来就是一套独立主题机制，
 *    把它的字面色算成「没随主题走」是误报。豁免的对价是「dark 覆盖必须还在」
 *    —— 若有人删掉覆盖，豁免随即失效（下面有测试）。
 * 2. `var(--x, #fallback)` 里的 fallback 字面量：组件主值已经走 token，
 *    fallback 只是防御值，不算「组件写死颜色」。但 fallback 引用的 token
 *    **若从未定义**，说明该处其实一直在用 fallback、完全不随主题切换，
 *    这是真 bug，另由「不得引用未定义的 token」**硬约束**（恒 0）锁住。
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

/**
 * hover 与发丝线的收敛记录（2026-11-04）：
 * - 裸 `:hover` 从 75 降到 **0**：67 个纯 hover 块整块包进 `@media (hover: hover)`，
 *   7 个「hover + 非 hover 状态」的混合选择器手工拆成两块（hover 进 media，
 *   `:active` / `.open` / `:focus-within` / `[aria-expanded]` 留在外面）。
 * - 中性 1px 边框从 170 降到 **0**：统一改 0.5px 发丝线；2px / 3px 的单边粗线是
 *   **有意强调**（引用块缩进、选中指示），判据豁免。
 * 两项都已归零，下方改为硬约束，不再需要棘轮。
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

/** @media 条件块区间（括号深度匹配），用于判断 `:hover` 是否真被 hover 查询包住。 */
function mediaBlocksOf(source: string): Array<{ start: number; end: number; condition: string }> {
  const out: Array<{ start: number; end: number; condition: string }> = []
  for (const match of source.matchAll(/@media([^{]*)\{/gu)) {
    const open = (match.index ?? 0) + match[0].length - 1
    let depth = 1
    let i = open + 1
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
      i++
    }
    out.push({ start: open, end: i, condition: match[1] })
  }
  return out
}

const PURE_HOVER_MEDIA = /^\s*\(\s*hover\s*:\s*hover\s*\)\s*$/u
const hoverStats = sheets.reduce(
  (acc, sheet) => {
    const media = mediaBlocksOf(sheet.source)
    const pureRanges = media.filter((block) => PURE_HOVER_MEDIA.test(block.condition))
    acc.mixed += media.filter(
      (block) => /hover/u.test(block.condition) && /pointer|coarse|fine/u.test(block.condition)
    ).length
    acc.anyHover += (sheet.source.match(/any-hover/gu) ?? []).length
    for (const match of sheet.source.matchAll(/:hover\b/gu)) {
      const at = match.index ?? 0
      if (!pureRanges.some((range) => at > range.start && at < range.end)) acc.bare += 1
    }
    return acc
  },
  { bare: 0, mixed: 0, anyHover: 0 }
)

/** 中性实线边框仍是 1px 的规则块（dsh 要求 0.5px 发丝线；2px+ 单边粗线是强调，豁免）。 */
const onePixelBorders = blocks.filter((block) =>
  [...block.body.matchAll(
    /border(?:-(?:top|right|bottom|left))?\s*:\s*(\d+(?:\.\d+)?)px\s+solid\s+var\(\s*--(?:border|divider)[^)]*\)/gu
  )].some((match) => Number(match[1]) === 1)
)

/**
 * 仍手写 `font-size: calc(<N>px * var(--ui-font-scale)[ * k])` 的块（应改用 `--text-*` 档位）。
 *
 * 判定按**因子**而不是按基准像素：
 * - 无因子 / `* 1.0` / `* 13/13` ⇒ 与 `var(--text-N)` 数学等价，必须 token 化；
 * - `* 1.1`、`* 12/13` 这类非 1 因子 ⇒ 整数档位里没有对应值，保留原式。
 *
 * 为什么改成按语义匹配：上一版正则只认 `calc(13px * ... * k)`，于是
 * `calc(12px * var(--ui-font-scale))` 这种**原生基准写法整类漏网**（实际漏了 50 处，
 * 直到本轮排查才发现）。守卫按字面量写就会这样，必须按结构匹配。
 */
const FONT_CALC_RE = /font-size:\s*calc\((\d+)px\s*\*\s*var\(--ui-font-scale\)(\s*\*\s*([\d./]+))?\)/gu

function hasLegacyFontCalc(body: string): boolean {
  for (const match of body.matchAll(FONT_CALC_RE)) {
    const factor = match[3]
    if (factor === undefined || factor === '1.0' || factor === '13/13') return true
  }
  return false
}

const legacyFontCalcBlocks = blocks.filter(
  (block) => !isTokenBlock(block.selector) && hasLegacyFontCalc(block.body)
)

/**
 * 15. 裸 px 字号（`font-size: 12px` 这种）不跟随 `--ui-font-scale`。
 *
 * 本仓字号在设置面板里可调（10–21px ⇒ scale 0.77–1.62），写死的部分不会跟着变：
 * 调大字号时界面会「一半放大、一半不动」。所以组件文字一律走 `--text-N`。
 *
 * 白名单 6 处是**刻意固定**，不是遗留债：
 * - 30/32/36px：图标与评分大数字，跟随缩放会破坏对齐；
 * - 12.5/11.5px：等宽代码区与状态栏的半档字号，没有整数档对应。
 * 白名单有对价：下面的用例会断言这 6 处仍在，删了声明就得同步删白名单。
 */
const FIXED_FONT_SIZES: ReadonlyArray<{ selector: string; px: string }> = [
  { selector: '.image-picker-plus', px: '30' },
  { selector: '.score-total-value', px: '32' },
  { selector: '.checklist-score', px: '36' },
  { selector: '.code-content', px: '12.5' },
  { selector: '.browser-url', px: '12.5' },
  { selector: '.browser-status', px: '11.5' }
]

/**
 * 选择器是否**精确**命中白名单项。
 *
 * 不能用 `selector.includes(...)`：`.image-picker-plus-large { font-size: 30px }`
 * 会被 `.image-picker-plus` 的子串匹配放行。这里按组合符 / 伪类拆词后全等比较，
 * 既能让 `.x:hover` 命中 `.x`，也不会让 `.x-large` 蹭到 `.x` 的白名单。
 */
function selectorHasExact(selector: string, allowed: string): boolean {
  return selector
    .split(/[\s,>+~:[\]()]+/u)
    .some((part) => part.trim() === allowed)
}

const literalFontBlocks = blocks.filter((block) => {
  if (isTokenBlock(block.selector)) return false
  const literals = [...block.body.matchAll(/font-size: ([0-9.]+)px(?= *;)/gu)]
  return literals.some(
    (match) =>
      !FIXED_FONT_SIZES.some(
        (allow) => selectorHasExact(block.selector, allow.selector) && match[1] === allow.px
      )
  )
})

function describeSample(items: CssBlock[]): string {
  return items.slice(0, 8).map((block) => `${block.file} { ${block.selector} }`).join('\n')
}

describe('样式守卫（对齐 dsh radius / corner-shape / elevation / hover / 发丝线 spec）', () => {
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

  it('hover 查询不得用 any-hover 或 hover+pointer 混合条件（硬约束）', () => {
    expect(
      hoverStats.anyHover + hoverStats.mixed,
      `any-hover ${hoverStats.anyHover} 处 / 混合查询 ${hoverStats.mixed} 处。\n` +
        `按 dsh hover-styles spec：只能单独用 (hover: hover) 或 (hover: none)。`
    ).toBe(0)
  })

  it('裸 :hover 必须包在 @media (hover: hover) 内（硬约束）', () => {
    expect(
      hoverStats.bare,
      `${hoverStats.bare} 处 :hover 不在 @media (hover: hover) 内。\n` +
        `触屏会残留悬停态；纯 hover 块整块包 media，混合选择器拆成两块。`
    ).toBe(0)
  })

  it('中性实线边框必须是 0.5px 发丝线（硬约束）', () => {
    expect(
      onePixelBorders.length,
      `${onePixelBorders.length} 个块的中性边框仍是 1px。\n` +
        `dsh web-styling.md:30：中性 --border* 一律 0.5px（Chromium 画成一个设备像素）；` +
        `2px+ 单边粗线是强调，豁免。\n前几个：\n${describeSample(onePixelBorders)}`
    ).toBe(0)
  })

  it('焦点环与输入模态抑制规则不得被删（a11y）', () => {
    const src = rootSheet?.source ?? ''
    // 键盘焦点必须可见：全局 :focus-visible 环 + 2px 宽度 token
    expect(src, '缺少 --focus-ring-width').toContain('--focus-ring-width')
    expect(src, '缺少全局 :focus-visible 规则').toMatch(/:focus-visible\s*\{/u)
    // 指针模态抑制（只抑制环，不放宽到可编辑控件）
    expect(src, '缺少 input-modality 抑制规则').toContain(
      "html[data-input-modality='pointer'] body :focus-visible:not(:read-write)"
    )
  })

  it('字号必须走 --text-* 档位（硬约束）', () => {
    expect(
      legacyFontCalcBlocks.length,
      `${legacyFontCalcBlocks.length} 个块仍手写 font-size: calc(<N>px * var(--ui-font-scale))。\n` +
        `改用 --text-9/10/11/12/13/14/15/16/18/20 档位；\n` +
        `非 1 因子（\`* 1.1\` 的 14.3px、\`* 12/13\` 等无整数档对应）允许保留。\n` +
        `前几个：\n${describeSample(legacyFontCalcBlocks)}`
    ).toBe(0)
  })

  it('字号不得写死裸 px（必须跟随 --ui-font-scale）', () => {
    expect(
      literalFontBlocks.length,
      `${literalFontBlocks.length} 个块把字号写死成 px，用户调字号时它们不会跟着变。\n` +
        `改用 --text-9/10/11/12/13/14/15/16/18/20；刻意固定的 6 处走白名单。\n` +
        `前几个：\n${describeSample(literalFontBlocks)}`
    ).toBe(0)

    // 白名单对价：删掉声明就要同步删白名单，否则豁免会变成永不失效的死配置
    const allCss = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    for (const allow of FIXED_FONT_SIZES) {
      expect(
        allCss,
        `刻意固定的 ${allow.selector} ${allow.px}px 不见了：请同步清理 FIXED_FONT_SIZES 白名单`
      ).toContain(`font-size: ${allow.px}px`)
    }

    // 白名单匹配方式的自检：必须精确命中，不能被兄弟选择器蹭到
    expect(selectorHasExact('.image-picker-plus', '.image-picker-plus')).toBe(true)
    expect(selectorHasExact('.image-picker-plus:hover', '.image-picker-plus')).toBe(true)
    expect(selectorHasExact('div .image-picker-plus', '.image-picker-plus')).toBe(true)
    expect(selectorHasExact('.image-picker-plus-large', '.image-picker-plus')).toBe(false)
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
