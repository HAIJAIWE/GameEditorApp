import { describe, expect, it } from 'vitest'

import type { CeshuChangelog } from '../../src/shared/ceshuDiff'
import {
  buildChangelogHtml,
  buildChangelogMarkdown,
  buildChangelogText,
  buildValidationReportMarkdown,
  categorizeValidationError
} from '../../src/shared/ceshuReports'

describe('categorizeValidationError（对齐 Python validation_dialog._categorize）', () => {
  it('按关键字归类，判定顺序为 dep > conflict > warning > required', () => {
    expect(categorizeValidationError('依赖缺失：第五章 systems.battle 已启用')).toBe('dep')
    expect(categorizeValidationError('一致性冲突：combat.combat_mode 不一致')).toBe('conflict')
    expect(categorizeValidationError('一致性警告：risk_matrix 内容不一致')).toBe('warning')
    expect(categorizeValidationError("元信息：字段 'game_name' 为必填项")).toBe('required')
    expect(categorizeValidationError('某个未知问题')).toBe('other')
  })
})

describe('buildValidationReportMarkdown（对齐 Python _build_markdown）', () => {
  const progress: Record<string, number> = { meta: 1, systems: 0.5, total: 0.75 }

  it('评分 = max(0, 100 - 错误数*3)，并按分类计数', () => {
    const errors = [
      "元信息：字段 'game_name' 为必填项",
      '一致性冲突：A 与 B 不一致',
      '一致性警告：C 与 D 不一致',
      '依赖缺失：systems.battle 依赖未启用'
    ]
    const md = buildValidationReportMarkdown('墨白', 'v1.2', '2026-10-07 21:00:00', errors, progress)
    expect(md).toContain('# 工业级 GDD 校验报告')
    expect(md).toContain('**项目名称**: 墨白  ')
    expect(md).toContain('**版本**: v1.2  ')
    expect(md).toContain('**生成时间**: 2026-10-07 21:00:00  ')
    // 100 - 4*3 = 88 ⇒ ✓ 通过
    expect(md).toContain('**完整性评分**: **88/100** (✓ 通过)  ')
    expect(md).toContain('**总进度**: 75%  ')
    expect(md).toContain('- 问题总数: **4**')
    expect(md).toContain('- 🔴 必填字段缺失: 1')
    expect(md).toContain('- 🟠 一致性冲突: 1')
    expect(md).toContain('- 🟡 一致性警告: 1')
    expect(md).toContain('- 🔵 依赖缺失: 1')
    expect(md).toContain('- ⚪ 其他问题: 0')
    // 问题清单分组标题
    expect(md).toContain('### 🔴 必填字段缺失 (1)')
    expect(md).toContain('### 🔵 依赖缺失 (1)')
    expect(md).toContain('| 章节 | 完成度 | 状态 |')
  })

  it('评分下限 0 与不合格；无错误时输出「校验通过」段', () => {
    const many = Array.from({ length: 40 }, () => '一致性冲突：x')
    const md = buildValidationReportMarkdown('', '', 't', many, progress)
    expect(md).toContain('**项目名称**: 未命名  ')
    expect(md).toContain('**版本**: v1.0  ')
    expect(md).toContain('**完整性评分**: **0/100** (✗ 不合格)  ')
    expect(md).toContain('## 问题清单')

    const ok = buildValidationReportMarkdown('G', 'v1.0', 't', [], progress)
    expect(ok).toContain('**完整性评分**: **100/100** (✓ 通过)  ')
    expect(ok).toContain('## ✓ 校验通过')
    expect(ok).not.toContain('## 问题清单')
    expect(ok).toContain('策划书已达工业级 GDD 完整性标准，可进入开发评审阶段。')
  })

  it('章节完成度状态阈值与 Python 一致（>=80 ✓ / >=50 ⚠ / 否则 ✗）', () => {
    const md = buildValidationReportMarkdown('G', 'v1.0', 't', [], { meta: 0.8, systems: 0.5, total: 0.6 })
    expect(md).toContain('| 第一章·项目元信息 | 80% | ✓ |')
    expect(md).toContain('| 第五章·游戏系统设计 | 50% | ⚠ |')
  })
})

describe('变更日志三格式（对齐 Python Changelog.to_{markdown,text,html}）', () => {
  const log: CeshuChangelog = {
    entries: [
      {
        version: 'v1.1',
        date: '2026-10-07',
        summary: '新增 1 / 删除 0 / 修改 1（共 2 处）',
        changes: [
          { type: 'added', chapter: '元信息', field: 'game_name', old: '(空)', new: '墨白', description: '新增字段 game_name：墨白' },
          { type: 'modified', chapter: '核心玩法', field: 'core_loop', old: 'a', new: 'b', description: '修改字段 core_loop：a → b' }
        ]
      }
    ]
  }

  it('markdown：标题/版本/按章节分组', () => {
    const md = buildChangelogMarkdown(log)
    expect(md).toContain('# 变更日志')
    expect(md).toContain('共 1 个版本，2 处变更。')
    expect(md).toContain('## v1.1 — 新增 1 / 删除 0 / 修改 1（共 2 处）')
    expect(md).toContain('**日期**: 2026-10-07 | **变更数**: 2')
    expect(md).toContain('### 元信息')
    expect(md).toContain('- [added] 新增字段 game_name：墨白')
    expect(md).toContain('### 核心玩法')
  })

  it('text：分隔线 + 缩进层级', () => {
    const txt = buildChangelogText(log)
    expect(txt.split('\n')[0]).toBe('变更日志')
    expect(txt).toContain('='.repeat(40))
    expect(txt).toContain('[v1.1] 新增 1 / 删除 0 / 修改 1（共 2 处）')
    expect(txt).toContain('  日期: 2026-10-07 | 变更数: 2')
    expect(txt).toContain('  [元信息]')
    expect(txt).toContain('    - (added) 新增字段 game_name：墨白')
  })

  it('html：内联样式 + 转义特殊字符', () => {
    const html = buildChangelogHtml(log)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<h1>变更日志</h1>')
    expect(html).toContain("<span class='type-added'>[added]</span>")
    const risky: CeshuChangelog = {
      entries: [
        {
          version: 'v1',
          date: '',
          summary: '<script>',
          changes: [{ type: 'added', chapter: 'A&B', field: 'f', old: '', new: '', description: '<b>x</b>' }]
        }
      ]
    }
    const escaped = buildChangelogHtml(risky)
    expect(escaped).toContain('&lt;script&gt;')
    expect(escaped).toContain('A&amp;B')
    expect(escaped).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(escaped).not.toContain('<b>x</b>')
  })

  it('空日志：三种格式各自输出「暂无变更记录」占位', () => {
    const empty: CeshuChangelog = { entries: [] }
    expect(buildChangelogMarkdown(empty)).toBe('# 变更日志\n\n（暂无变更记录）')
    expect(buildChangelogText(empty)).toContain('（暂无变更记录）')
    expect(buildChangelogHtml(empty)).toContain('<p>（暂无变更记录）</p>')
  })
})
