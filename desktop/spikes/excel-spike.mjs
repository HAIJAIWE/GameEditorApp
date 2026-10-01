/**
 * Excel 保真预演（依赖 spike）：用 exceljs 生成含中文 sheet 名/表头/正文的多 Sheet 工作簿。
 *
 * 对齐参照：src/core/ceshu/ceshu_excel_exporter.py（openpyxl）
 *   - 一个「概览/汇总」Sheet + 若干章节内容 Sheet
 *   - 表头加粗 + 背景色（#4472C4 底 / 白字）
 *   - 列宽自适应（按表头与正文首行长度，clamp 8~60）
 *   - 冻结首行（对应 openpyxl 的 ws.freeze_panes = "A2"）
 *   - 数值自动识别 int/float
 *
 * 运行：node spikes/excel-spike.mjs
 * 产物：spikes/out/sample.xlsx（供人工打开验收）+ 回读断言结果
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ExcelJS from 'exceljs'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, 'out')
const outPath = join(outDir, 'sample.xlsx')

// === 样式常量（与 ceshu_excel_exporter.py 对齐）===
const HEADER_FILL = 'FF4472C4' // 标题行背景（蓝）
const HEADER_FONT = 'FFFFFFFF' // 标题行字体（白）
const HEADER_STYLE = {
  font: { bold: true, color: { argb: HEADER_FONT }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } },
}

// 本项目真实章节标签（取自 ceshu_model.CHAPTER_LABELS），这里挑用若干作为 sheet 名
const CHAPTER_LABELS = {
  meta: '第一章·项目元信息',
  systems: '第五章·游戏系统设计',
  characters: '第十一章·角色设计',
  mvp: '第十五章·MVP 规划',
  accessibility: '第十八章·可访问性与本地化',
}

/** 尝试把字符串数值转 int/float，失败原样返回（对齐 _coerce_numeric） */
function coerceNumeric(value) {
  if (typeof value !== 'string' || value === '') return value
  if (/^-?\d+$/.test(value)) return parseInt(value, 10)
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value)
  return value
}

/** 写入表头行（加粗 + 背景） */
function writeHeaderRow(ws, headers, rowIdx = 1) {
  const row = ws.getRow(rowIdx)
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1)
    cell.value = h
    cell.font = HEADER_STYLE.font
    cell.fill = HEADER_STYLE.fill
  })
  row.commit()
}

/** 自适应列宽（对齐 _auto_column_width，多行文本取首行） */
function autoColumnWidth(ws, headers, rows, minWidth = 8, maxWidth = 60) {
  headers.forEach((header, i) => {
    let maxLen = String(header).length
    for (const row of rows) {
      const val = row[i]
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).split('\n')[0].length)
      }
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, minWidth), maxWidth)
  })
}

/** 追加数据行（从第 2 行开始） */
function appendRows(ws, rows) {
  rows.forEach((row, r) => {
    const wsRow = ws.getRow(r + 2)
    row.forEach((val, c) => {
      wsRow.getCell(c + 1).value = val
    })
    wsRow.commit()
  })
}

function freezeFirstRow(ws) {
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

/** 通用：建一个章节内容 Sheet */
function addChapterSheet(wb, sheetName, headers, rows) {
  const ws = wb.addWorksheet(sheetName)
  writeHeaderRow(ws, headers, 1)
  freezeFirstRow(ws)
  appendRows(ws, rows)
  autoColumnWidth(ws, headers, rows)
  return ws
}

// === 组装工作簿 ===
const wb = new ExcelJS.Workbook()
wb.creator = 'mb-desktop'
wb.created = new Date('2026-10-02T00:00:00Z')

// Sheet 1：概览（章节汇总）
const metaRows = [
  ['游戏名称', '星轨远征'],
  ['游戏类型', '二次元策略卡牌'],
  ['版本标签', 'v1.0'],
  ['版本号', '1.0.0'],
  ['创建时间', '2026-10-01'],
  ['更新时间', '2026-10-02'],
  ['总完成度', coerceNumeric('72')],
]
const progressRows = Object.values(CHAPTER_LABELS).map((label, i) => [
  label,
  coerceNumeric(String([100, 80, 65, 50, 40][i])),
])
addChapterSheet(wb, '概览', ['项目', '值'], [...metaRows, ...progressRows])

// Sheet 2：第一章·项目元信息（键值）
addChapterSheet(
  wb,
  CHAPTER_LABELS.meta,
  ['字段', '值'],
  [
    ['game_name', '星轨远征'],
    ['game_type', '二次元策略卡牌'],
    ['positioning', '轻量化策略 + 长线养成'],
    ['tags', '二次元, 卡牌, 策略'],
  ],
)

// Sheet 3：第五章·游戏系统设计（对齐「系统配置」表）
addChapterSheet(
  wb,
  CHAPTER_LABELS.systems,
  ['系统Key', '系统名称', '状态', '等级上限', '是否付费'],
  [
    ['battle', '战斗系统', '启用', coerceNumeric('99'), '否'],
    ['gacha', '抽卡系统', '启用', coerceNumeric('60'), '是'],
    ['guild', '公会系统', '未启用', coerceNumeric('30'), '否'],
  ],
)

// Sheet 4：第十一章·角色设计（对齐「角色」表）
addChapterSheet(
  wb,
  CHAPTER_LABELS.characters,
  ['序号', '名称', '角色类型', '位置', '性格', '任务钩子'],
  [
    [coerceNumeric('1'), '艾拉', '主角', '初始营地', '冷静坚毅', '夺回家园'],
    [coerceNumeric('2'), '诺亚', '反派', '虚空王座', '傲慢偏执', '夺取星核'],
  ],
)

// Sheet 5：第十五章·MVP 规划（对齐「里程碑」表）
addChapterSheet(
  wb,
  CHAPTER_LABELS.mvp,
  ['序号', '名称', '日期', '交付物', '验收标准'],
  [
    [coerceNumeric('1'), '原型验证', '2026-11-30', '战斗 Demo', '可完成 1 场战斗'],
    [coerceNumeric('2'), '内测版本', '2027-02-15', '章节一 + 抽卡', '留存 > 30%'],
  ],
)

// Sheet 6：第十八章·可访问性与本地化
addChapterSheet(
  wb,
  CHAPTER_LABELS.accessibility,
  ['项目', '方案'],
  [
    ['色盲模式', '提供红/绿/蓝三套配色'],
    ['字幕', '简中 / 繁中 / 英文'],
    ['语音本地化', '中日双语配音'],
  ],
)

// === 写入 ===
mkdirSync(outDir, { recursive: true })
await wb.xlsx.writeFile(outPath)

// === 验证 1：文件存在 + 体积合理 ===
const exists = existsSync(outPath)
const size = exists ? statSync(outPath).size : 0

// === 验证 2：zip 魔数 PK ===
const head = readFileSync(outPath).subarray(0, 2).toString('latin1')
const magicOk = head === 'PK'

// === 验证 3：回读校验 ===
const readBack = new ExcelJS.Workbook()
await readBack.xlsx.readFile(outPath)

const problems = []
const assert = (cond, msg) => {
  if (!cond) problems.push(msg)
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
}

// 3.1 sheet 名
const expectedSheets = [
  '概览',
  CHAPTER_LABELS.meta,
  CHAPTER_LABELS.systems,
  CHAPTER_LABELS.characters,
  CHAPTER_LABELS.mvp,
  CHAPTER_LABELS.accessibility,
]
const actualSheets = readBack.worksheets.map((ws) => ws.name)
assert(
  JSON.stringify(actualSheets) === JSON.stringify(expectedSheets),
  `sheet 名一致 期望=${JSON.stringify(expectedSheets)} 实际=${JSON.stringify(actualSheets)}`,
)

// 3.2 sheet 名合规（≤31 字符、不含 []:*?/\）——暴露中文 sheet 名的硬约束
for (const name of actualSheets) {
  const lenOk = name.length <= 31
  const charOk = !/[[\]:*?/\\]/.test(name)
  assert(lenOk && charOk, `sheet 名合规「${name}」长度=${name.length}<=31 禁用字符=${!charOk}`)
}

// 3.3 概览 sheet 单元格（含中文 + 数值）
const overview = readBack.getWorksheet('概览')
assert(overview.getCell('A1').value === '项目', `概览!A1 期望=项目 实际=${overview.getCell('A1').value}`)
assert(overview.getCell('B1').value === '值', `概览!B1 期望=值 实际=${overview.getCell('B1').value}`)
assert(overview.getCell('A2').value === '游戏名称', `概览!A2 期望=游戏名称 实际=${overview.getCell('A2').value}`)
assert(overview.getCell('B2').value === '星轨远征', `概览!B2 期望=星轨远征 实际=${overview.getCell('B2').value}`)
assert(overview.getCell('B8').value === 72, `概览!B8(总完成度) 期望=72(number) 实际=${overview.getCell('B8').value} (${typeof overview.getCell('B8').value})`)
assert(overview.getCell('A9').value === CHAPTER_LABELS.meta, `概览!A9 期望=${CHAPTER_LABELS.meta} 实际=${overview.getCell('A9').value}`)
assert(overview.getCell('B9').value === 100, `概览!B9 期望=100(number) 实际=${overview.getCell('B9').value} (${typeof overview.getCell('B9').value})`)
const frozenView = overview.views?.[0] ?? {}
assert(
  frozenView.state === 'frozen' && frozenView.ySplit === 1 && frozenView.topLeftCell === 'A2',
  `概览 冻结首行 期望=state:frozen/ySplit:1/A2 实际=state:${frozenView.state}/ySplit:${frozenView.ySplit}/topLeftCell:${frozenView.topLeftCell}`,
)

// 3.4 章节 sheet 表头/正文（中文 + 数值）
const sys = readBack.getWorksheet(CHAPTER_LABELS.systems)
assert(sys.getCell('A1').value === '系统Key', `系统!A1 期望=系统Key 实际=${sys.getCell('A1').value}`)
assert(sys.getCell('B2').value === '战斗系统', `系统!B2 期望=战斗系统 实际=${sys.getCell('B2').value}`)
assert(sys.getCell('D2').value === 99, `系统!D2(等级上限) 期望=99(number) 实际=${sys.getCell('D2').value} (${typeof sys.getCell('D2').value})`)
assert(sys.getCell('C1').font?.bold === true, `系统!C1 表头加粗 实际=${JSON.stringify(sys.getCell('C1').font)}`)
assert(
  sys.getCell('C1').fill?.fgColor?.argb === HEADER_FILL,
  `系统!C1 表头背景色 期望=${HEADER_FILL} 实际=${sys.getCell('C1').fill?.fgColor?.argb}`,
)
assert(sys.getColumn(1).width === 8, `系统 列宽(A=系统Key→8) 实际=${sys.getColumn(1).width}`)

const chars = readBack.getWorksheet(CHAPTER_LABELS.characters)
assert(chars.getCell('B2').value === '艾拉', `角色!B2 期望=艾拉 实际=${chars.getCell('B2').value}`)
assert(chars.getCell('A2').value === 1, `角色!A2(序号) 期望=1(number) 实际=${chars.getCell('A2').value} (${typeof chars.getCell('A2').value})`)

const mvp = readBack.getWorksheet(CHAPTER_LABELS.mvp)
assert(mvp.getCell('C2').value === '2026-11-30', `MVP!C2 期望=2026-11-30 实际=${mvp.getCell('C2').value}`)

const a11y = readBack.getWorksheet(CHAPTER_LABELS.accessibility)
assert(
  a11y.getCell('B2').value === '提供红/绿/蓝三套配色',
  `可访问性!B2 期望=提供红/绿/蓝三套配色 实际=${a11y.getCell('B2').value}`,
)

// === 汇总 ===
const ok = exists && size > 5 * 1024 && magicOk && problems.length === 0
console.log('---')
console.log(`RESULT exists=${exists} size=${size} magic=${head} magicOk=${magicOk} fails=${problems.length}`)
console.log(`XLSX_SPIKE ${ok ? 'OK' : 'FAIL'}`)
if (problems.length) {
  for (const p of problems) console.error('  - ' + p)
  process.exitCode = 1
}