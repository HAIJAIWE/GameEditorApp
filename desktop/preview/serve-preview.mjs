/*
 * 整机渲染证明 / 预览服务器（非 Electron 回退）。
 *
 * 沙箱跑不了 Electron E2E，但渲染层只依赖 window.mbApi（主进程经 contextIsolation 暴露的唯一桥）。
 * 本服务器：
 *   1. 静态托管 desktop/out/renderer/（已 build 产物）
 *   2. 对 /index.html 注入 <script src="/stub.js"> —— 在 module bundle（延迟执行）之前同步执行，给 window.mbApi 赋值
 *   3. 提供 /stub.js（preview-stub.js，忠实桩）
 *
 * 用法：node serve-preview.mjs [port]   （默认 5188，绑定 127.0.0.1）
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RENDERER = join(__dirname, '..', 'out', 'renderer')
const STUB_FILE = join(__dirname, 'preview-stub.js')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

const port = Number(process.argv[2] || 5188)

async function serveStub(res) {
  const buf = await readFile(STUB_FILE)
  res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' })
  res.end(buf)
}

function injectStub(html) {
  // 在 module bundle 之前插入 classic 桩脚本（classic 同步执行 → 早于延迟的 module）
  const marker = '<script type="module" crossorigin'
  const idx = html.indexOf(marker)
  if (idx === -1) return html // 没找到 bundle 标记就不注入（不应发生）
  const stubTag = '<script src="/stub.js"></script>\n  '
  return html.slice(0, idx) + stubTag + html.slice(idx)
}

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath === '/stub.js') return await serveStub(res)

    let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
    if (rel === '/' || rel === '\\' || rel === '') rel = '/index.html'
    let filePath = join(RENDERER, rel)

    // 防目录穿越
    if (!filePath.startsWith(RENDERER)) {
      res.writeHead(403); res.end('forbidden'); return
    }
    const info = await stat(filePath).catch(() => null)
    if (!info || !info.isFile()) {
      // SPA：未知路径回落到 index.html（带桩）
      filePath = join(RENDERER, 'index.html')
    }
    const ext = extname(filePath).toLowerCase()
    if (ext === '.html') {
      // index.html 必须注入桩（无论真实文件还是回落）
      const html = await readFile(filePath, 'utf-8')
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
      res.end(injectStub(html))
      return
    }
    const buf = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(buf)
  } catch (err) {
    res.writeHead(500); res.end('server error: ' + err.message)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`预览服务器已启动: http://127.0.0.1:${port}/  （Ctrl+C 退出）`)
})
