/**
 * 生成托盘图标资源（一次性脚本，产物提交进仓库）。
 *
 * 为什么手写 PNG：只为一个 32x32 图标引入 `sharp`/`canvas` 之类原生依赖不值当，
 * 故直接用 zlib 拼一个合法的 RGBA PNG。
 *
 * 图形：圆角深青底 + 三条浅色横杠（暗示「文档/列表」）。
 * 运行：node scripts/gen-tray-icon.cjs
 */
const { deflateSync } = require('node:zlib')
const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

const SIZE = 32
const RADIUS = 7

/** CRC32（PNG 每个 chunk 都要） */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** 圆角矩形判定：判断像素是否落在圆角内 */
function insideRoundedRect(x, y) {
  const left = RADIUS
  const right = SIZE - 1 - RADIUS
  const top = RADIUS
  const bottom = SIZE - 1 - RADIUS
  if (x >= left && x <= right && y >= 0 && y < SIZE) return true
  if (y >= top && y <= bottom && x >= 0 && x < SIZE) return true
  // 四个角
  const corners = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom]
  ]
  for (const [cx, cy] of corners) {
    const dx = x - cx
    const dy = y - cy
    if (dx * dx + dy * dy <= RADIUS * RADIUS) return true
  }
  return false
}

/** 三条横杠（浅色） */
function insideBars(x, y) {
  if (x < 9 || x > 22) return false
  const rows = [
    [10, 12],
    [15, 17],
    [20, 22]
  ]
  return rows.some(([from, to]) => y >= from && y <= to)
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
let offset = 0
for (let y = 0; y < SIZE; y++) {
  raw[offset++] = 0 // filter: None
  for (let x = 0; x < SIZE; x++) {
    const inShape = insideRoundedRect(x, y)
    const bar = inShape && insideBars(x, y)
    if (!inShape) {
      raw[offset++] = 0
      raw[offset++] = 0
      raw[offset++] = 0
      raw[offset++] = 0
      continue
    }
    // 底色 #12876A（深青），横杠 #E8FBF4（浅）
    raw[offset++] = bar ? 0xf4 : 0x6a // B
    raw[offset++] = bar ? 0xfb : 0x87 // G
    raw[offset++] = bar ? 0xe8 : 0x12 // R
    raw[offset++] = 0xff // A
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type: RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const target = join(__dirname, '..', 'resources', 'tray-icon.png')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, png)
console.log(`wrote ${target} (${png.length} bytes)`)
