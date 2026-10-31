import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { buildExcelWorkbook, renderCeshuExcel } from '../../src/main/ceshu/export/doc/excel'
import { exportCeshuDocument } from '../../src/main/ceshu/export/exporter'
import { CHAPTER_LABELS, type CeshuDocument } from '../../src/shared/ceshu/reference'
import { autoFillRequiredFields } from '../../src/shared/ceshu/workflow'
import { createDefaultCeshu } from '../../src/shared/ceshu/model'

/** 与 旧版 ceshu_excel_exporter 的 8 个 Sheet 顺序一致 */
const SHEET_NAMES = ['概览', '系统配置', '数值表', '角色', '里程碑', '风险', '竞品', '校验报告']

function makeDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', name: '表格游戏' })
  doc.meta.game_type = 'RPG'
  doc.version = '5.0'
  // 数值表：可转数字的字符串 + 不可转的公式文本 + 列表
  doc.numeric.balance_target = '42'
  doc.numeric.ratio = '1.5'
  doc.numeric.core_formulas = '伤害 = 攻击 - 防御'
  // 角色
  doc.story.protagonist = '主角艾拉'
  doc.story.npc_list = [
    { name: '艾拉', role: '法师', location: '塔', personality: '冷静', quest_hook: '找药' },
    { name: '波比', role: '战士' }
  ]
  // 里程碑
  doc.mvp.milestones = [{ name: 'Alpha', date: '2026-11-30', deliverables: ['原型', '数值'], acceptance: '可玩' }]
  // 风险
  doc.risk_handling.risk_matrix = [{ risk: '进度', probability: '中', impact: '高', mitigation: '砍特性', owner: 'PM' }]
  // 竞品
  doc.market_analysis.competitors = [{ name: '竞品A', type: 'RPG', strengths: '画面', weaknesses: '玩法', market_share: '10%' }]
  // 系统：启用 battle 并带 config 值
  const battle = doc.systems.battle as { enabled: boolean; config: Record<string, unknown> }
  battle.enabled = true
  battle.config.turn_mode = 'turn_based'
  return doc
}

/** 构造一份通过全部校验（校验报告为空）的文档 */
function makeCleanDoc(): CeshuDocument {
  const { doc } = autoFillRequiredFields(makeDoc())
  doc.meta.game_type = 'RPG'
  doc.meta.platform = ['PC']
  for (const system of ['battle', 'character', 'skill']) {
    ;(doc.systems[system] as { enabled: boolean }).enabled = true
  }
  doc.tech.core_architecture = '分层架构'
  doc.tech.performance_targets = '60fps / 8GB'
  doc.mvp.milestones = doc.tech.milestones
  doc.mvp.success_criteria = '次日留存 30%'
  doc.market_analysis.market_size = '10 亿人民币'
  doc.market_analysis.kpi_forecast = ['DAU|1000|上线 3 个月']
  // 对齐一致性检查：战斗模式与 battle.config.turn_mode、两份风险矩阵、NPC 数量与列表
  doc.combat.combat_mode = 'turn_based'
  doc.risk_handling.risk_matrix = doc.resources.risk_matrix
  doc.story.main_npc_count = (doc.story.npc_list as unknown[]).length
  /*
   * 字段联动（可开发性）：填了触发字段就得补上依赖字段。
   * 这些字段不是必填，但缺了会报「可开发性缺口」——「干净文档」必须真的是能开工的文档。
   */
  doc.combat.hit_detection = [{ attack: '普攻', shape: '胶囊 0.6m', iframe: '无', super_armor: '无' }]
  doc.performance.quality_tiers = [{ tier: '中', downgrade: '阴影关闭', fps: '60', devices: '中端机' }]
  doc.gameplay.state_machine = ['MainMenu|start|载入|InGame']
  doc.economy.source_sink = '产出：战斗掉落；回收：强化消耗'
  doc.audio.sfx_events = [{ event: '攻击命中', sfx: 'hit', volume: '80', concurrency: '8' }]
  doc.art.asset_spec = [{ type: '角色', size: '2048', format: 'png', naming: 'char_*', note: '' }]
  doc.level_design.content_estimate = [{ stage: '首发', count: '20 关', note: '每关 5 分钟' }]
  return doc
}

function sheetOf(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) throw new Error(`未找到 Sheet ${name}`)
  return sheet
}

/** 读取某行全部单元格值（1-based） */
function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number): ExcelJS.CellValue[] {
  const row = sheet.getRow(rowNumber)
  const values: ExcelJS.CellValue[] = []
  for (let index = 1; index <= row.cellCount; index++) values.push(row.getCell(index).value)
  return values
}

/** 概览 Sheet 的「项目 → 值」映射，便于按标签断言（不必记住行号） */
function overviewMap(sheet: ExcelJS.Worksheet): Map<string, ExcelJS.CellValue> {
  const map = new Map<string, ExcelJS.CellValue>()
  for (let index = 2; index <= sheet.rowCount; index++) {
    map.set(String(sheet.getRow(index).getCell(1).value), sheet.getRow(index).getCell(2).value)
  }
  return map
}

describe('策划书导出：Excel', () => {
  it('8 个 Sheet 顺序与中文名，标题行样式/冻结首行/列宽', () => {
    const workbook = buildExcelWorkbook(makeDoc())
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEET_NAMES)

    const overview = sheetOf(workbook, '概览')
    const header = overview.getRow(1)
    expect(header.getCell(1).value).toBe('项目')
    expect(header.getCell(2).value).toBe('值')
    expect(header.font?.bold).toBe(true)
    expect(header.font?.color?.argb).toBe('FFFFFFFF')
    const fill = header.fill
    expect(fill?.type).toBe('pattern')
    if (fill?.type === 'pattern') expect(fill.fgColor?.argb).toBe('FF4472C4')
    expect(overview.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    // 列宽 = 表头/正文首行长度 +2，且 clamp 到 8~60
    const width = overview.getColumn(2).width ?? 0
    expect(width).toBeGreaterThanOrEqual(8)
    expect(width).toBeLessThanOrEqual(60)
  })

  it('概览：文档信息 + 24 章完成度（数值落表为数字）（P2 后 17→24）', () => {
    const workbook = buildExcelWorkbook(makeDoc())
    const overview = sheetOf(workbook, '概览')
    expect(rowValues(overview, 2)).toEqual(['游戏名称', '表格游戏'])
    expect(rowValues(overview, 3)).toEqual(['游戏类型', 'RPG'])
    expect(rowValues(overview, 4)).toEqual(['版本标签', 'v1.0'])
    expect(rowValues(overview, 9)).toEqual(['模块类型', ''])
    // 总完成度 + 25 章（第 10 行总完成度，其后 24 行章节）
    expect(overview.getRow(10).getCell(1).value).toBe('总完成度')
    expect(typeof overview.getRow(10).getCell(2).value).toBe('number')
    expect(overview.getRow(11).getCell(1).value).toBe('文档信息')
    expect(overview.getRow(27).getCell(1).value).toBe('第十六章·可访问性与本地化')
    // 34 行 + 末尾的「审核进度」行（该文档无 field_status，只有汇总行）
    expect(overview.rowCount).toBe(35)
  })

  it('概览：审核进度汇总全文档，且只列出还有待审字段的章节', () => {
    const doc = makeDoc()
    const at = '2026-01-01T00:00:00.000Z'
    doc.meta.field_status = {
      meta: { positioning: { status: 'ai_draft', at } },
      combat: {
        damage_formula: { status: 'ai_draft', at },
        skill_system: { status: 'approved', at }
      }
    }
    const map = overviewMap(sheetOf(buildExcelWorkbook(doc), '概览'))

    // 汇总文案来自 formatFieldStatusSummary：数字在前、标签在后，全零栏不出现
    expect(map.get('审核进度')).toBe('2 待审 · 1 已批准')
    // 章名用 CHAPTER_LABELS 拼，章号随章节顺序变化时不至于测试跟着改
    expect(map.get(`待审字段（${CHAPTER_LABELS.combat}）`)).toBe(1)
    expect(map.get(`待审字段（${CHAPTER_LABELS.meta}）`)).toBe(1)
    // 完全没有状态记录的章节不该出现在待审清单里
    expect(map.has(`待审字段（${CHAPTER_LABELS.vision}）`)).toBe(false)
    // 正好两章有待审：多一行就说明过滤条件失效
    const pendingRows = [...map.keys()].filter((key) => key.startsWith('待审字段（'))
    expect(pendingRows).toHaveLength(2)
  })

  it('概览：完全没有 field_status 时审核进度为「无审核记录」且无章节行', () => {
    const map = overviewMap(sheetOf(buildExcelWorkbook(makeDoc()), '概览'))
    expect(map.get('审核进度')).toBe('无审核记录')
    expect([...map.keys()].some((key) => key.startsWith('待审字段（'))).toBe(false)
  })

  it('系统配置：系统 Key/名称/状态 + config 字段并集', () => {
    const workbook = buildExcelWorkbook(makeDoc())
    const sheet = sheetOf(workbook, '系统配置')
    const headers = rowValues(sheet, 1).map((value) => String(value))
    expect(headers.slice(0, 3)).toEqual(['系统Key', '系统名称', '状态'])
    expect(headers).toContain('turn_mode')
    // battle 行：状态启用 + turn_mode 值
    const battleRow = rowValues(sheet, 2).map((value) => String(value))
    expect(battleRow[0]).toBe('battle')
    expect(battleRow.slice(0, 3)).toEqual(['battle', '战斗', '启用'])
    expect(battleRow[headers.indexOf('turn_mode')]).toBe('turn_based')
    expect(sheet.rowCount).toBe(14) // 13 个系统 + 标题行
  })

  it('数值表：可用数字字符串转 int/float，其余保持文本', () => {
    const workbook = buildExcelWorkbook(makeDoc())
    const sheet = sheetOf(workbook, '数值表')
    const rows = new Map<string, ExcelJS.CellValue>()
    for (let index = 2; index <= sheet.rowCount; index++) {
      rows.set(String(sheet.getRow(index).getCell(1).value), sheet.getRow(index).getCell(2).value)
    }
    expect(rows.get('balance_target')).toBe(42)
    expect(rows.get('ratio')).toBe(1.5)
    expect(rows.get('core_formulas')).toBe('伤害 = 攻击 - 防御')
  })

  it('角色 / 里程碑 / 风险 / 竞品：结构化字段逐列落表', () => {
    const workbook = buildExcelWorkbook(makeDoc())

    const characters = sheetOf(workbook, '角色')
    expect(rowValues(characters, 2)).toEqual([1, '艾拉', '法师', '塔', '冷静', '找药'])
    expect(rowValues(characters, 3)).toEqual([2, '波比', '战士', '', '', ''])
    expect(rowValues(characters, 4)).toEqual(['', '主角', '', '', '', '主角艾拉'])

    const milestones = sheetOf(workbook, '里程碑')
    expect(rowValues(milestones, 2)).toEqual([1, 'Alpha', '2026-11-30', '原型, 数值', '可玩'])

    const risks = sheetOf(workbook, '风险')
    expect(rowValues(risks, 2)).toEqual([1, '进度', '中', '高', '砍特性', 'PM'])

    const competitors = sheetOf(workbook, '竞品')
    expect(rowValues(competitors, 2)).toEqual([1, '竞品A', 'RPG', '画面', '玩法', '10%'])
  })

  it('校验报告：有错误按严重度分组，全部通过时输出通过提示', () => {
    const withErrors = sheetOf(buildExcelWorkbook(makeDoc()), '校验报告')
    expect(rowValues(withErrors, 1)).toEqual(['严重度', '类别', '问题'])
    expect(String(withErrors.getRow(2).getCell(1).value)).toContain('必须修复')
    expect(withErrors.getRow(2).getCell(2).value).toBe('必填缺失')
    expect(String(withErrors.getRow(2).getCell(3).value)).toContain('为必填项')

    const clean = sheetOf(buildExcelWorkbook(makeCleanDoc()), '校验报告')
    expect(clean.rowCount).toBe(2)
    // 无问题时仍是一行提示，只是按三列结构落在「问题」列（前两列留空，不伪造严重度）
    expect(rowValues(clean, 2)).toEqual(['', '', '✅ 所有校验通过，未发现错误'])
  })

  it('校验报告：必须修复组排在建议检查之前，每条都带具体问题', () => {
    const doc = makeDoc()
    // 术语不一致：combat 里两次「生命值」、numeric 里两次「血量」（同属 hp 的两种叫法）
    doc.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    doc.numeric.balance_principles = '血量随等级增长。血量不足时补防。'
    const sheet = sheetOf(buildExcelWorkbook(doc), '校验报告')

    expect(rowValues(sheet, 1)).toEqual(['严重度', '类别', '问题'])

    const rows: string[][] = []
    for (let index = 2; index <= sheet.rowCount; index++) {
      rows.push(rowValues(sheet, index).map((value) => String(value ?? '')))
    }
    // makeDoc 未填必填字段：error 组必定存在，且分组保证它排在最前
    expect(rows[0]?.[0]).toContain('必须修复')
    // 术语不一致落在「建议检查」，确认 warning 组也真的落表了
    expect(rows.some((row) => row[0]?.includes('建议检查'))).toBe(true)
    expect(rows.some((row) => row[1] === '术语不一致')).toBe(true)
    // 问题列全非空：空了说明分组时把文案丢了，报告就失去意义
    for (const row of rows) expect(row[2]).not.toBe('')
    // 所有必须修复行都在第一条建议检查之前
    const firstWarning = rows.findIndex((row) => row[0]?.includes('建议检查'))
    const lastError = rows.map((row) => row[0]?.includes('必须修复') === true).lastIndexOf(true)
    expect(lastError).toBeLessThan(firstWarning)
  })

  it('导出管道：xlsx 落盘（zip 魔数 PK）、原子写无 tmp 残留，且可被 exceljs 回读', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-ceshu-excel-'))
    const result = await exportCeshuDocument(makeDoc(), 'excel', join(dir, 'gdd'))
    expect(result.filePath).toBe(join(dir, 'gdd.xlsx'))
    expect(result.bytes).toBeGreaterThan(5000)
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)

    const bytes = readFileSync(result.filePath)
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK')
    expect(bytes.byteLength).toBe(result.bytes)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(result.filePath)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(SHEET_NAMES)
    expect(sheetOf(workbook, '概览').getRow(2).getCell(2).value).toBe('表格游戏')
    // 渲染器与工作簿构建保持一致
    const buffer = await renderCeshuExcel(makeDoc())
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK')
  })
})