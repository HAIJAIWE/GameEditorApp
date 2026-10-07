/*
 * E57 验证专用预览服务器（serve-e51.mjs 的同构副本，非生产代码）。
 *
 * 与 serve-e51.mjs 的唯一差异：/stub.js 下发的是
 * **preview-stub.js + e51-stub.js + e57-stub.js** 的拼接
 * —— 前两者提供「有状态内存库 + 可播种策划书」，第三者在同一份种子上补齐
 * `data.listAll`（关系图面板读全量条目做 id 解析）。
 *
 * 用法：node serve-e57.mjs [port]   （默认 5200，绑定 127.0.0.1）
 * 前置：先 `npm run build` 产出 desktop/out/renderer/
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RENDERER = join(__dirname, '..', 'out', 'renderer')
const STUB_PARTS = [
  join(__dirname, 'preview-stub.js'),
  join(__dirname, 'e51-stub.js'),
  join(__dirname, 'e57-stub.js')
]

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

const port = Number(process.argv[2] || 5200)

async function serveStub(res) {
  const parts = await Promise.all(STUB_PARTS.map((file) => readFile(file, 'utf-8')))
  const body = parts.join('\n;\n')
  res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-store' })
  res.end(body)
}

function injectStub(html) {
  const marker = '<script type="module" crossorigin'
  const idx = html.indexOf(marker)
  if (idx === -1) return html
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

    if (!filePath.startsWith(RENDERER)) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    const info = await stat(filePath).catch(() => null)
    if (!info || !info.isFile()) {
      filePath = join(RENDERER, 'index.html')
    }
    const ext = extname(filePath).toLowerCase()
    if (ext === '.html') {
      const html = await readFile(filePath, 'utf-8')
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' })
      res.end(injectStub(html))
      return
    }
    const buf = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(buf)
  } catch (err) {
    res.writeHead(500)
    res.end('server error: ' + err.message)
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`E57 预览服务器已启动: http://127.0.0.1:${port}/  （Ctrl+C 退出）`)
})
