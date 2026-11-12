/**
 * 生成应用图标（一次性脚本，产物提交进仓库）。
 *
 * 与 `gen-tray-icon.cjs` 同一套手写 PNG 思路：不引入 sharp/canvas。
 * 图形沿用托盘图标：圆角深青底 + 三条浅色横杠。
 * 尺寸 1024×1024，electron-builder 会据此自动派生 .icns / .ico。
 * 运行：node scripts/gen-app-icon.cjs
 */
const { deflateSync } = require('node:zlib')
const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, join } = require('node:path')

const SIZE = 1024
const SCALE = SIZE / 32

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

/** 圆角矩形判定（坐标按 32 设计稿等比放大） */
function insideRoundedRect(x, y) {
  const ux = Math.floor(x / SCALE)
  const uy = Math.floor(y / SCALE)
  const left = 7
  const right = 24
  if (ux >= left && ux <= right) return true
  if (uy >= left && uy <= right) return true
  const corners = [
    [left, 7],
    [right, 7],
    [left, 24],
    [right, 24]
  ]
  for (const [cx, cy] of corners) {
    const dx = ux - cx
    const dy = uy - cy
    if (dx * dx + dy * dy <= 7 * 7) return true
  }
  return false
}

/** 三条横杠（浅色，按 32 设计稿等比放大） */
function insideBars(x, y) {
  const ux = Math.floor(x / SCALE)
  const uy = Math.floor(y / SCALE)
  if (ux < 9 || ux > 22) return false
  const rows = [
    [10, 12],
    [15, 17],
    [20, 22]
  ]
  return rows.some(([from, to]) => uy >= from && uy <= to)
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

const target = join(__dirname, '..', 'build', 'icon.png')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, png)
console.log(`wrote ${target} (${png.length} bytes)`)
