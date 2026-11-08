import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportCeshuDocument } from '../../src/main/ceshu/export/exporter'
import {
  buildImplementationManifest,
  renderImplementationManifestMarkdown
} from '@mobai/shared/ceshu/export/implementationManifest'
import { CESHU_EXPORT_FORMATS, CESHU_FORMAT_LABELS } from '@mobai/shared/ceshu/reference'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

function filledDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  doc.meta.game_type = 'RPG'
  const gp = asRecord(doc.gameplay)
  gp.core_loop = '探索→战斗→收获'
  gp.core_loop_points = ['探索', '战斗', '收获']
  gp.state_machine = ['主菜单|点击开始|进入对局|对局中', '对局中|生命归零|结算失败|失败']
  const sys = doc.systems as unknown as Record<string, { enabled?: boolean; name?: string; config?: Record<string, string> }>
  sys.battle.enabled = true
  if (sys.battle.config) sys.battle.config['damage_formula'] = 'atk-def'
  asRecord(doc.mvp).milestones = ['α 切片|D1|一局可玩|30 分钟内跑通核心循环']
  asRecord(doc.mvp).core_features = ['探索', '战斗', '突破']
  asRecord(doc.level_design).first_levels = ['新手村', '云海秘境']
  asRecord(doc.numeric).core_formulas_points = ['伤害 = 攻击×倍率−防御×0.5']
  asRecord(doc.qa).acceptance_criteria = ['无阻断 bug']
  asRecord(doc.tech).engine = 'Unity'
  return doc
}

describe('buildImplementationManifest（实现契约派生）', () => {
  it('派生状态机/系统/内容/数值/验收，构建顺序为 5 步', () => {
    const m = buildImplementationManifest(filledDoc())
    expect(m.meta.gameName).toBe('星海计划')
    expect(m.stateMachine).toHaveLength(2)
    expect(m.stateMachine[0]).toMatchObject({ from: '主菜单', event: '点击开始', next: '对局中' })
    expect(m.modules.map((x) => x.key)).toContain('battle')
    expect(m.content.features).toHaveLength(3)
    expect(m.content.firstLevels).toHaveLength(2)
    expect(m.tuning.length).toBeGreaterThanOrEqual(1)
    expect(m.acceptance.length).toBeGreaterThanOrEqual(2) // MVP 里程碑 + QA 准则
    expect(m.buildOrder.map((s) => s.order)).toEqual([1, 2, 3, 4, 5])
    const pending = m.pending.join('\n')
    expect(pending).not.toContain('缺状态机')
    expect(pending).not.toContain('未启用任何系统')
    expect(pending).not.toContain('内容范围未填')
    expect(pending).not.toContain('数值约束未填')
    expect(pending).not.toContain('tech.engine')
  })

  it('空文档：如实报空缺，不编造', () => {
    const m = buildImplementationManifest(createDefaultCeshu({ scope: 'full' }))
    expect(m.stateMachine).toHaveLength(0)
    expect(m.modules).toHaveLength(0)
    const pending = m.pending.join('\n')
    expect(pending).toContain('缺状态机')
    expect(pending).toContain('未启用任何系统')
    expect(pending).toContain('缺可判定验收标准')
    expect(pending).toContain('内容范围未填')
    expect(pending).toContain('数值约束未填')
  })

  it('里程碑为对象行时也能读验收（toRowStrings 兼容对象行）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    asRecord(doc.mvp).milestones = [{ name: 'α', date: 'D1', deliverables: '一局', acceptance: '可跑通核心循环' }]
    const m = buildImplementationManifest(doc)
    expect(m.acceptance.some((a) => a.criterion === '可跑通核心循环')).toBe(true)
  })

  it('Markdown 含状态表/内容/数值/验收/表现基线', () => {
    const md = renderImplementationManifestMarkdown(buildImplementationManifest(filledDoc()))
    expect(md).toContain('| 状态 | 触发事件 | 结算效果 | 新状态 |')
    expect(md).toContain('## 五、内容范围')
    expect(md).toContain('## 六、数值约束')
    expect(md).toContain('## 八、表现基线')
    expect(md).toContain('垂直切片优先')
  })
})

describe('manifest 导出格式（接入导出管道）', () => {
  it('markdown 导出产物是构建清单', async () => {
    expect(CESHU_EXPORT_FORMATS).toContain('manifest')
    expect(CESHU_FORMAT_LABELS.manifest).toContain('实现契约')
    const dir = mkdtempSync(join(tmpdir(), 'mb-manifest-'))
    const res = await exportCeshuDocument(filledDoc(), 'manifest', join(dir, 'impl'))
    expect(res.filePath.endsWith('.md')).toBe(true)
    const text = readFileSync(res.filePath, 'utf8')
    expect(text).toContain('实现契约（构建清单）')
    expect(text).toContain('| 状态 | 触发事件 | 结算效果 | 新状态 |')
  })

  it('manifest-json 导出为可解析的机读结构', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-manifest-json-'))
    const res = await exportCeshuDocument(filledDoc(), 'manifest-json', join(dir, 'impl'))
    expect(res.filePath.endsWith('.json')).toBe(true)
    const parsed = JSON.parse(readFileSync(res.filePath, 'utf8')) as {
      stateMachine: unknown[]
      buildOrder: unknown[]
      content: { features: unknown[] }
      tuning: unknown[]
      pending: unknown[]
    }
    expect(parsed.stateMachine.length).toBe(2)
    expect(parsed.buildOrder.length).toBe(5)
    expect(parsed.content.features.length).toBe(3)
    expect(parsed.tuning.length).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(parsed.pending)).toBe(true)
  })
})
