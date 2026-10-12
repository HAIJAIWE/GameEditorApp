import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportCeshuDocument } from '../../src/main/ceshu/export/exporter'
import { renderCeshuHtml } from '../../src/main/ceshu/export/html'
import { renderCeshuMarkdown } from '../../src/main/ceshu/export/markdown'
import type { CeshuDocument } from '../../src/shared/ceshu/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'

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
    expect(markdown).toContain('**damage_formula**: 伤害 = 攻击 - 防御')
    expect(markdown).toContain('**tags**: - 剧情向')
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