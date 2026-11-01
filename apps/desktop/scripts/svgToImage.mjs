/**
 * SVG → 图片（JPG/PNG）——对标豆包交付物里的 preview-gameflow.jpg / preview-curve.jpg。
 *
 * 用途：把导出的 SVG 图表渲染成图片，便于在聊天/文档/邮件里直接贴图（SVG 不能
 * 到处贴）。用 Playwright + 无头 Edge 渲染。
 *
 * ## 为什么不直接 page.goto(svg 文件)
 * 实测踩坑：SVG 里若引用本机没有的字体（如 Noto Sans SC），Playwright 截图会卡在
 * 「waiting for fonts to load」直到超时。改为**读 SVG 源码 → 包一层 HTML → 内联
 * 渲染 + 本地字体兜底**，彻底绕开字体加载等待。
 *
 * 用法：
 *   node scripts/svgToImage.mjs <svg 路径> [--out <输出路径>] [--width 1080] [--png]
 *
 * 默认输出与 SVG 同目录、同名 .jpg；--png 输出 PNG。
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, basename, extname } from 'node:path'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const svgPath = process.argv[2]
if (!svgPath || svgPath.startsWith('--')) {
  console.error('用法: node scripts/svgToImage.mjs <svg 路径> [--out 输出路径] [--width 1080] [--png]')
  process.exit(2)
}
if (!existsSync(svgPath)) {
  console.error(`文件不存在: ${svgPath}`)
  process.exit(2)
}

const png = process.argv.includes('--png')
const width = Number(argOf('--width', '1080'))
const out = argOf('--out', join(dirname(svgPath), `${basename(svgPath, extname(svgPath))}${png ? '.png' : '.jpg'}`))

if (!existsSync(EDGE)) {
  console.error(`未找到 Edge: ${EDGE}`)
  process.exit(2)
}

const svg = readFileSync(svgPath, 'utf8')
/** 从 viewBox 取高度，按目标宽度等比缩放 */
const viewBox = /viewBox="([\d.\s-]+)"/.exec(svg)
const [, , vbW, vbH] = viewBox ? viewBox[1].split(/\s+/).map(Number) : [0, 0, 760, 400]
const height = Math.round((width * vbH) / (vbW || width))

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#fff}
  body{width:${width}px}
  svg{display:block;width:${width}px;height:auto;font-family:"Microsoft YaHei","PingFang SC",sans-serif !important}
  svg text{font-family:"Microsoft YaHei","PingFang SC",sans-serif !important}
</style></head><body>${svg}</body></html>`

const browser = await chromium.launch({ executablePath: EDGE, args: ['--no-sandbox', '--disable-gpu'] })
try {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(html, { waitUntil: 'load' })
  // 字体兜底后再截：不 await 无限等待，只给 1.5s 上限
  await Promise.race([page.evaluate(() => document.fonts.ready.then(() => true)), page.waitForTimeout(1500)])
  await page.screenshot({ path: out, type: png ? 'png' : 'jpeg', ...(png ? {} : { quality: 88 }) })
  console.log(`已生成 ${out}（${width}×${height}）`)
} finally {
  await browser.close()
}
