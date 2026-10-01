/**
 * PDF 保真预演（Phase 1）：用 Electron 内置 Chromium 的 printToPDF 生成中文 PDF。
 * 相比第三方 PDF 库，printToPDF 由 Chromium 排版，天然支持中文字体与 HTML 样式。
 *
 * 运行：node_modules\.bin\electron spikes\pdf-print.mjs
 * 产物：spikes/out/sample.pdf（供人工打开验收）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow } from 'electron'

app.disableHardwareAcceleration()

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'out')

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #111; }
  h1 { font-size: 22px; }
  table { border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #999; padding: 6px 12px; font-size: 13px; }
</style>
</head>
<body>
  <h1>战斗系统设计</h1>
  <p>中文 PDF 排版验证：技能、属性、伤害公式与表格边框。</p>
  <table>
    <tr><th>属性</th><th>数值</th><th>说明</th></tr>
    <tr><td>攻击力</td><td>120</td><td>基础伤害乘区</td></tr>
    <tr><td>暴击率</td><td>25%</td><td>上限 100%</td></tr>
  </table>
</body>
</html>`

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ show: false, width: 900, height: 1200 })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })

    mkdirSync(outDir, { recursive: true })
    const outPath = join(outDir, 'sample.pdf')
    writeFileSync(outPath, pdf)

    const isPdfMagic = pdf.subarray(0, 5).toString('latin1') === '%PDF-'
    console.log(`PDF_OK bytes=${pdf.length} magic=${isPdfMagic} path=${outPath}`)
    app.exit(isPdfMagic && pdf.length > 10_000 ? 0 : 1)
  } catch (error) {
    console.error('PDF_FAIL', error)
    app.exit(1)
  }
})