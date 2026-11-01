import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 导出用图表（内联 SVG）——对标豆包交付物里的 gameflow.svg / curve.svg。
 *
 * ## 为什么自己画而不引图表库
 * 图源是**文档字段**（核心循环步骤、状态机转移），结构简单且固定；引 D3/ECharts
 * 会带来打包体积与导出依赖（HTML 要自包含）。这里用字符串拼 SVG：确定性、零依赖、
 * 可直接内联进 HTML/PDF。
 *
 * ## 两张图的取舍
 * - 核心循环图：横向步骤 + 底部回流箭头（比环形更好读，长步骤文字不打架）；
 * - 状态机图：**每条转移一行**（from →event→ to，结算效果在箭头下）——不做
 *   自动布局，避免多条转移重叠；密集状态机读起来像流程表，但每行都准确。
 *
 * 字段来源：
 * - gameplay.core_loop_points（stringList，每行一步）
 * - gameplay.state_machine（pipeList：状态|触发事件|结算效果|新状态）
 */

const WIDTH = 760

/** XML 文本转义（SVG 里 & < > " ' 都必须转义） */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 按视觉宽度截断（中文按 2 个字符宽算），超长加省略号 */
function clip(text: string, maxUnits: number): string {
  let units = 0
  let out = ''
  for (const char of text) {
    const w = /[\u4e00-\u9fff]/.test(char) ? 2 : 1
    if (units + w > maxUnits) return `${out}…`
    units += w
    out += char
  }
  return out
}

function toRows(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * 核心循环图：横向步骤链 + 底部回流箭头。
 * 步骤超过 6 个时只画前 6 个（末尾标注「…」），避免盒子挤成一团。
 */
export function renderCoreLoopSvg(steps: readonly string[]): string | null {
  const clean = steps.map((step) => step.trim()).filter((step) => step !== '')
  if (clean.length < 2) return null
  const shown = clean.slice(0, 6)
  const boxW = Math.min(150, Math.floor((WIDTH - 40) / shown.length) - 16)
  const boxH = 54
  const gap = Math.floor((WIDTH - 40 - boxW * shown.length) / Math.max(1, shown.length - 1))
  const top = 48
  const height = top + boxH + 78
  const parts: string[] = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="核心循环图">`)
  parts.push('<defs><marker id="loopArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5b7bd5"/></marker></defs>')
  parts.push(`<text x="${WIDTH / 2}" y="26" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="15" font-weight="600" fill="#1f2430">核心循环</text>`)

  shown.forEach((step, index) => {
    const x = 20 + index * (boxW + gap)
    parts.push(
      `<rect x="${x}" y="${top}" width="${boxW}" height="${boxH}" rx="8" fill="#eef3ff" stroke="#5b7bd5" stroke-width="1.2"/>`
    )
    const lines = splitLabel(clip(step, Math.max(8, Math.floor(boxW / 7)) * 2))
    lines.forEach((line, lineIndex) => {
      const y = top + boxH / 2 - (lines.length - 1) * 8 + lineIndex * 16 + 5
      parts.push(
        `<text x="${x + boxW / 2}" y="${y}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="12" fill="#1f2430">${esc(line)}</text>`
      )
    })
    if (index < shown.length - 1) {
      const from = x + boxW
      const to = x + boxW + gap
      parts.push(
        `<line x1="${from}" y1="${top + boxH / 2}" x2="${to - 4}" y2="${top + boxH / 2}" stroke="#5b7bd5" stroke-width="1.4" marker-end="url(#loopArrow)"/>`
      )
    }
  })

  // 回流箭头：从最后一个盒子底部绕回第一个盒子底部
  const firstX = 20 + boxW / 2
  const lastX = 20 + (shown.length - 1) * (boxW + gap) + boxW / 2
  const bottomY = top + boxH
  const returnY = bottomY + 46
  parts.push(
    `<path d="M ${lastX} ${bottomY} C ${lastX} ${returnY}, ${firstX} ${returnY}, ${firstX} ${bottomY + 2}" fill="none" stroke="#8aa0d8" stroke-width="1.4" stroke-dasharray="5 4" marker-end="url(#loopArrow)"/>`
  )
  parts.push(
    `<text x="${(firstX + lastX) / 2}" y="${returnY + 16}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="11" fill="#6b7590">${esc(clean.length > 6 ? '回到起点（共 ' + clean.length + ' 步，仅示前 6 步）' : '回到起点')}</text>`
  )
  parts.push('</svg>')
  return parts.join('\n')
}

/** 长标签折成两行（按空格/中点断，实在没有就在中间断） */
function splitLabel(text: string): string[] {
  if (text.length <= 12) return [text]
  const breakAt = text.search(/[：:，,、]/)
  if (breakAt > 2 && breakAt < text.length - 1) {
    return [text.slice(0, breakAt + 1), text.slice(breakAt + 1)]
  }
  const mid = Math.ceil(text.length / 2)
  return [text.slice(0, mid), text.slice(mid)]
}

/**
 * 状态机图：每条转移一行 —— [状态A] →(事件)→ [状态B]，结算效果在箭头下方。
 * 行格式：状态|触发事件|结算效果|新状态；列不足时按缺省处理（不抛异常）。
 */
export function renderStateMachineSvg(rows: readonly string[]): string | null {
  /*
   * 宽容解析：标准 4 列（状态|触发事件|结算效果|新状态）；3 列按
   * （状态|触发事件|新状态）理解——AI 产出常省掉结算效果列，直接丢弃整行
   * 会让「状态机明明有内容却画不出图」，比画得略简更糟。
   */
  const transitions = rows
    .map((row) => row.split('|').map((column) => column.trim()))
    .map((columns) => {
      if (columns.length >= 4) {
        return { from: columns[0] ?? '', event: columns[1] ?? '', effect: columns[2] ?? '', to: columns[3] ?? '' }
      }
      if (columns.length === 3) {
        return { from: columns[0] ?? '', event: columns[1] ?? '', effect: '', to: columns[2] ?? '' }
      }
      return null
    })
    .filter((item): item is { from: string; event: string; effect: string; to: string } => item !== null && item.from !== '' && item.to !== '')
  if (transitions.length === 0) return null

  const rowH = 74
  const top = 44
  const height = top + transitions.length * rowH + 16
  const boxW = 150
  const boxH = 40
  const leftX = 24
  const rightX = WIDTH - 24 - boxW
  const parts: string[] = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${height}" width="${WIDTH}" height="${height}" role="img" aria-label="核心状态机图">`)
  parts.push('<defs><marker id="smArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5b7bd5"/></marker></defs>')
  parts.push(`<text x="${WIDTH / 2}" y="24" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="15" font-weight="600" fill="#1f2430">核心状态机</text>`)

  transitions.forEach(({ from, event, effect, to }, index) => {
    const y = top + index * rowH
    const boxY = y + 6

    // 起点与终点状态盒（同一状态用中性色，不同用主色，帮助扫读）
    parts.push(`<rect x="${leftX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="6" fill="#f5f7fc" stroke="#9aa7c7" stroke-width="1.2"/>`)
    parts.push(`<text x="${leftX + boxW / 2}" y="${boxY + boxH / 2 + 4}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="12" font-weight="600" fill="#1f2430">${esc(clip(from, 18))}</text>`)
    parts.push(`<rect x="${rightX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="6" fill="#eef3ff" stroke="#5b7bd5" stroke-width="1.2"/>`)
    parts.push(`<text x="${rightX + boxW / 2}" y="${boxY + boxH / 2 + 4}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="12" font-weight="600" fill="#1f2430">${esc(clip(to, 18))}</text>`)

    // 中间箭头与事件标签
    const arrowFrom = leftX + boxW
    const arrowTo = rightX - 4
    const arrowY = boxY + boxH / 2
    parts.push(`<line x1="${arrowFrom}" y1="${arrowY}" x2="${arrowTo}" y2="${arrowY}" stroke="#5b7bd5" stroke-width="1.4" marker-end="url(#smArrow)"/>`)
    parts.push(`<text x="${(arrowFrom + arrowTo) / 2}" y="${arrowY - 7}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="11.5" fill="#3d4a6b">${esc(clip(event, 28))}</text>`)
    if (effect !== '') {
      parts.push(`<text x="${(arrowFrom + arrowTo) / 2}" y="${arrowY + 17}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="10.5" fill="#6b7590">${esc(clip(effect, 40))}</text>`)
    }
  })

  parts.push('</svg>')
  return parts.join('\n')
}

/** 从文档取两张图（无数据返回 null）；供 HTML 导出注入 */
export function renderDocDiagrams(doc: CeshuDocument): {
  coreLoop: string | null
  stateMachine: string | null
  growthChart: string | null
} {
  const gameplay = doc.gameplay
  return {
    coreLoop: renderCoreLoopSvg(toRows(gameplay.core_loop_points)),
    stateMachine: renderStateMachineSvg(toRows(gameplay.state_machine)),
    growthChart: renderGrowthChartSvg(toRows(doc.numeric.growth_curves))
  }
}

/**
 * 成长曲线图（对数坐标）——对标豆包交付物的 curve.svg。
 *
 * 数据源：`numeric.growth_curves`（对象|曲线形状|参数）。指数型要求参数写成
 * 「基数,成长」（也接受 `10×1.28` / `10*1.28`），据此算 value(n)=基数×成长^(n-1)，
 * n=1..40。**参数解析不出就不画**——图是增强，不是校验依赖（写不清由 aiHint 兜）。
 *
 * 为什么用对数坐标：成长曲线跨度常达 6 个数量级，线性坐标下前 20 层会压成一条线。
 */
export function renderGrowthChartSvg(rows: readonly string[]): string | null {
  const series: Array<{ name: string; base: number; growth: number }> = []
  for (const row of rows) {
    if (typeof row !== 'string') continue
    const columns = row.split('|').map((column) => column.trim())
    const name = columns[0] ?? ''
    const shape = columns[1] ?? ''
    const param = columns[2] ?? ''
    if (name === '' || !/指数|exponential/i.test(shape)) continue
    const match = /(-?\d+(?:\.\d+)?)\s*[,，×x*]\s*(\d+(?:\.\d+)?)/.exec(param)
    if (match === null) continue
    const base = Number(match[1])
    const growth = Number(match[2])
    if (!Number.isFinite(base) || !Number.isFinite(growth) || base <= 0 || growth <= 0) continue
    if (series.length >= 3) break
    series.push({ name, base, growth })
  }
  if (series.length === 0) return null

  const LAYERS = 40
  const width = WIDTH
  const height = 330
  const padding = { left: 56, right: 16, top: 46, bottom: 40 }
  const plotW = width - padding.left - padding.right
  const plotH = height - padding.top - padding.bottom
  const colors = ['#3f6fd8', '#e08a2e', '#5aa469']

  // y 轴：log10，从 10^0 到 10^ceil(maxExponent)
  let maxExp = 1
  for (const item of series) {
    const maxValue = item.base * Math.pow(item.growth, LAYERS - 1)
    maxExp = Math.max(maxExp, Math.ceil(Math.log10(maxValue)))
  }
  const yOf = (value: number): number => {
    const exp = Math.log10(Math.max(value, 1))
    return padding.top + plotH - (exp / maxExp) * plotH
  }
  const xOf = (n: number): number => padding.left + ((n - 1) / (LAYERS - 1)) * plotW

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="成长曲线图">`)
  parts.push(`<text x="${width / 2}" y="24" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="15" font-weight="600" fill="#1f2430">成长曲线（对数坐标）</text>`)

  // 网格与 y 轴刻度（10^0..10^maxExp）
  for (let exp = 0; exp <= maxExp; exp += 1) {
    const y = padding.top + plotH - (exp / maxExp) * plotH
    parts.push(`<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e3e8f2" stroke-width="1"/>`)
    const label = exp === 0 ? '1' : `10^${exp}`
    parts.push(`<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-family="Microsoft YaHei, sans-serif" font-size="10.5" fill="#6b7590">${label}</text>`)
  }
  // x 轴刻度（层 1 / 10 / 20 / 30 / 40）
  for (const n of [1, 10, 20, 30, 40]) {
    const x = xOf(n)
    parts.push(`<text x="${x}" y="${height - padding.bottom + 18}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="10.5" fill="#6b7590">${n}</text>`)
  }
  parts.push(`<text x="${padding.left + plotW / 2}" y="${height - 6}" text-anchor="middle" font-family="Microsoft YaHei, sans-serif" font-size="10.5" fill="#6b7590">层数</text>`)

  // 曲线
  series.forEach((item, index) => {
    const points: string[] = []
    for (let n = 1; n <= LAYERS; n += 1) {
      points.push(`${xOf(n).toFixed(1)},${yOf(item.base * Math.pow(item.growth, n - 1)).toFixed(1)}`)
    }
    parts.push(`<polyline points="${points.join(' ')}" fill="none" stroke="${colors[index]}" stroke-width="1.8"/>`)
  })

  // 图例
  series.forEach((item, index) => {
    const x = padding.left + index * 170
    parts.push(`<line x1="${x}" y1="${padding.top - 14}" x2="${x + 18}" y2="${padding.top - 14}" stroke="${colors[index]}" stroke-width="2.4"/>`)
    parts.push(
      `<text x="${x + 24}" y="${padding.top - 10}" font-family="Microsoft YaHei, sans-serif" font-size="11" fill="#3d4a6b">${esc(`${item.name} ${item.base}×${item.growth}^(n-1)`)}</text>`
    )
  })

  parts.push('</svg>')
  return parts.join('\n')
}
