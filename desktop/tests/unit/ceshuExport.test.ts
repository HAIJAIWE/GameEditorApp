import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportCeshuDocument } from '../../src/main/ceshu/export/exporter'
import { renderCeshuHtml } from '../../src/main/ceshu/export/html'
import { renderCeshuMarkdown } from '../../src/main/ceshu/export/markdown'
import { renderCeshuNarrative } from '../../src/main/ceshu/export/narrative'
import { CHAPTER_LABELS, type CeshuDocument } from '../../src/shared/ceshu/reference/ceshuConstants'
import { setFieldStatuses } from '../../src/shared/ceshu/fields/ceshuFieldStatus'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'

function makeDoc(scope: 'full' | 'lite' = 'full'): CeshuDocument {
  const doc = createDefaultCeshu({ scope, name: '测试游戏' })
  doc.meta.game_type = 'RPG'
  doc.meta.positioning = '一句话定位'
  doc.meta.tags = ['剧情向']
  doc.combat.damage_formula = '伤害 = 攻击 - 防御'
  const battle = doc.systems.battle as { enabled: boolean; config: Record<string, unknown> }
  battle.enabled = true
  battle.config.turn_mode = 'turn_based'
  return doc
}

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-ceshu-export-'))
}

describe('策划书导出：Markdown', () => {
  it('头部 / 目录锚点 / 章节字段 / systems 表格与配置详情 / 完成度附录', () => {
    const markdown = renderCeshuMarkdown(makeDoc())

    expect(markdown.startsWith('# 测试游戏')).toBe(true)
    expect(markdown).toContain('> 版本: v1.0 | 类型: RPG')
    expect(markdown).toContain('1. [文档信息](#ch1)')
    expect(markdown).toContain('17. [第十六章·可访问性与本地化](#ch17)')
    expect(markdown).toContain('<a id="ch12"></a>')
    expect(markdown).toContain('## 6. 第五章·战斗系统设计')
    // 打磨后：导出用中文字段标签，不再裸露原始 key
    expect(markdown).toContain('**伤害公式**: 伤害 = 攻击 - 防御')
    expect(markdown).toContain('**特色标签**: - 剧情向')
    expect(markdown).not.toContain('**damage_formula**')
    expect(markdown).toContain('| battle | ✅ 启用 | battle | 战斗 |')
    expect(markdown).toContain('| character | ⬜ 未启用 | character | 角色 |')
    expect(markdown).toContain('### 已启用系统配置详情')
    expect(markdown).toContain('#### 战斗 (battle)')
    expect(markdown).toContain('- **turn_mode**: turn_based')
    expect(markdown).toContain('## 附录：数据校验报告')
    expect(markdown).toContain('共发现 ')
    expect(markdown).toContain('问题：')
    expect(markdown).toContain('\n\n---\n\n')
  })

  it('lite 档只导出基础 9 章（序号仍为全局章号）', () => {
    const markdown = renderCeshuMarkdown(makeDoc('lite'))
    expect(markdown).toContain('10. [第九章·音频设计](#ch10)')
    expect(markdown).not.toContain('第十章·市场分析')
    expect(markdown).not.toContain('第十八章·可访问性与本地化')
  })

  it('审核进度附录：全文档汇总 + 只列待审章，且排在校验报告之前', () => {
    const doc = makeDoc()
    const at = '2026-10-23T10:00:00.000Z'
    doc.meta = setFieldStatuses(doc.meta, 'meta', { positioning: 'ai_draft' }, at)
    // 状态表统一挂在 meta.field_status 上（按章节分组），不是挂在章节对象上
    doc.meta = setFieldStatuses(doc.meta, 'combat', { damage_formula: 'ai_draft', skill_system: 'approved' }, at)

    const markdown = renderCeshuMarkdown(doc)

    expect(markdown).toContain('## 附录：审核进度')
    expect(markdown).toContain('- 全文档：2 待审 · 1 已批准')
    // 章名走 CHAPTER_LABELS，避免章号调整时测试假失败
    expect(markdown).toContain(`- ${CHAPTER_LABELS.meta}：1 待审`)
    expect(markdown).toContain(`- ${CHAPTER_LABELS.combat}：1 待审`)
    // 没有待审的章不出现
    expect(markdown).not.toContain(`- ${CHAPTER_LABELS.vision}：`)
    expect(markdown.indexOf('附录：审核进度')).toBeLessThan(markdown.indexOf('附录：数据校验报告'))
  })

  it('审核进度附录：无 field_status 时仍输出，写「无审核记录」', () => {
    const markdown = renderCeshuMarkdown(makeDoc())
    expect(markdown).toContain('## 附录：审核进度')
    expect(markdown).toContain('- 全文档：无审核记录')
  })
})

describe('策划书导出：HTML', () => {
  it('自包含可打印 HTML：转义、章节锚点、systems 表格、完成度附录', () => {
    const doc = makeDoc()
    doc.meta.positioning = '含 <b>标签</b> 的定位'
    const html = renderCeshuHtml(doc)

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<title>测试游戏</title>')
    expect(html).toContain('含 &lt;b&gt;标签&lt;/b&gt; 的定位')
    expect(html).not.toContain('含 <b>标签</b> 的定位')
    expect(html).toContain('<h2 id="ch6">6. 第五章·战斗系统设计</h2>')
    expect(html).toContain('<td>battle</td><td>✅ 启用</td>')
    expect(html).toContain('附录：章节完成度')
    expect(html).toContain('@media print')
  })

  it('审核进度附录：全文档汇总 + 只列待审章，且排在完成度附录之前', () => {
    const doc = makeDoc()
    const at = '2026-10-23T10:00:00.000Z'
    doc.meta = setFieldStatuses(doc.meta, 'meta', { positioning: 'ai_draft' }, at)
    // 状态表统一挂在 meta.field_status 上（按章节分组），不是挂在章节对象上
    doc.meta = setFieldStatuses(doc.meta, 'combat', { damage_formula: 'ai_draft', skill_system: 'approved' }, at)

    const html = renderCeshuHtml(doc)

    expect(html).toContain('附录：审核进度')
    expect(html).toContain('全文档：2 待审 · 1 已批准')
    // 章名走 CHAPTER_LABELS，避免章号调整时测试假失败
    expect(html).toContain(`${CHAPTER_LABELS.meta}：1 待审`)
    expect(html).toContain(`${CHAPTER_LABELS.combat}：1 待审`)
    // 没有待审的章不出现
    expect(html).not.toContain(`${CHAPTER_LABELS.vision}：`)
    // HTML 里唯一的既有附录是「章节完成度」，审核进度应排在它之前
    expect(html.indexOf('附录：审核进度')).toBeLessThan(html.indexOf('附录：章节完成度'))
  })

  it('审核进度附录：无 field_status 时仍输出，写「无审核记录」', () => {
    const html = renderCeshuHtml(makeDoc())
    expect(html).toContain('附录：审核进度')
    expect(html).toContain('全文档：无审核记录')
  })
})

describe('策划书导出：管道', () => {
  it('按格式渲染并原子写盘（自动补扩展名、无残留 tmp 文件）', async () => {
    const dir = makeDir()
    const doc = makeDoc()

    const mdResult = await exportCeshuDocument(doc, 'markdown', join(dir, 'gdd'))
    expect(mdResult.filePath).toBe(join(dir, 'gdd.md'))
    expect(mdResult.bytes).toBeGreaterThan(0)
    expect(readFileSync(mdResult.filePath, 'utf-8')).toContain('# 测试游戏')

    const htmlResult = await exportCeshuDocument(doc, 'html', join(dir, 'gdd.html'))
    expect(htmlResult.filePath).toBe(join(dir, 'gdd.html'))
    expect(readFileSync(htmlResult.filePath, 'utf-8')).toContain('<!doctype html>')

    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })
})

/**
 * 导出成品可读性（2026-10-26 打磨）：
 * 中文标签 / pipeList 真表格 / 机读字段进附录——不再裸露原始 key 与竖线文本。
 */
describe('策划书导出：成品可读性', () => {
  it('pipeList 按 columns 渲染成 Markdown 表格', () => {
    const doc = makeDoc()
    doc.analytics.metric_system = [
      'DAU|日活跃用户|按自然日去重|10000',
      '7日留存|注册后第 7 日仍活跃|按注册日分组|40%'
    ]
    const markdown = renderCeshuMarkdown(doc)

    expect(markdown).toContain('**指标体系**:')
    expect(markdown).toContain('| 指标名 | 定义 | 统计口径 | 目标值 |')
    expect(markdown).toContain('| DAU | 日活跃用户 | 按自然日去重 | 10000 |')
    // 不再是 `- DAU|日活跃用户|...` 这种竖线文本
    expect(markdown).not.toContain('DAU|日活跃用户')
  })

  it('机读字段进「附录：验收与机读数据」，不混进正文章节', () => {
    const doc = makeDoc()
    doc.numeric.numeric_assertions = ['攻击力上限|≤999|战斗章']
    const markdown = renderCeshuMarkdown(doc)

    const at = markdown.indexOf('## 附录：验收与机读数据')
    expect(at).toBeGreaterThan(-1)
    const body = markdown.slice(0, at)
    const appendix = markdown.slice(at)
    expect(appendix).toContain('≤999')
    expect(body).not.toContain('≤999')
  })

  it('HTML 导出同样用中文标签与表格', () => {
    const doc = makeDoc()
    doc.analytics.metric_system = ['DAU|日活跃用户|按自然日去重|10000']
    const html = renderCeshuHtml(doc)

    expect(html).toContain('<th>指标名</th>')
    expect(html).toContain('<td>DAU</td>')
    expect(html).not.toContain('>metric_system<')
  })

  it('叙事版：8 段结构 + 模块附录', () => {
    const doc = makeDoc()
    doc.gameplay.first_30_min = '开局 90 秒：读局面 → 升级 → 撞墙 → 转生'
    doc.numeric.core_formula = 'DPS = 基础 × 1.5^(等级-1)'
    doc.mvp.mvp_scope = '核心循环可玩'
    doc.qa.prototype_acceptance = '首载无错误'
    doc.art.art_style = '深海霓虹'

    const md = renderCeshuNarrative(doc)

    expect(md).toContain('## 玩法走读')
    expect(md).toContain('### 新手体验（前 30 分钟）')
    expect(md).toContain('## 玩法架构')
    expect(md).toContain('## 核心机制')
    expect(md).toContain('## 数值设计')
    expect(md).toContain('## 首个可玩范围（MVP）')
    expect(md).toContain('## 原型验证')
    expect(md).toContain('## 变更记录')
    expect(md).toContain('## 附录：模块细节')
    expect(md).toContain('深海霓虹') // art 章进模块附录
  })

  it('叙事版：新增字段（非目标 / 三层循环 / 120 秒走读）进对应段落', () => {
    const doc = makeDoc()
    doc.meta.non_goals = ['不做 PVP', '不做开放世界']
    doc.gameplay.playthrough_120s = '进入房间 → 第一眼是中央台座 → 选择点亮一盏灯 → 消耗 1 石墨 → 灯光熄灭 3 秒'
    doc.gameplay.loop_three_layers = [
      { layer: '瞬时', question: '手感', action: '点击', system: '灯亮', feedback: '光晕', carrier: '经验' }
    ]

    const md = renderCeshuNarrative(doc)

    expect(md).toContain('**范围与非目标**:')
    expect(md).toContain('不做 PVP')
    expect(md).toContain('### 120 秒走读')
    expect(md).toContain('### 三层循环')
    expect(md).toContain('| 层级 | 关注问题 | 玩家动作 | 系统变化 | 反馈 | 传递物 |') // columns → 真表格
  })
})