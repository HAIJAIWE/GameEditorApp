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

function filledDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  doc.meta.game_type = 'RPG'
  const gp = doc.gameplay as Record<string, unknown>
  gp.core_loop = '探索→战斗→收获'
  gp.core_loop_points = ['探索', '战斗', '收获']
  gp.state_machine = ['主菜单|点击开始|进入对局|对局中', '对局中|生命归零|结算失败|失败']
  const sys = doc.systems as unknown as Record<string, { enabled?: boolean; name?: string; config?: Record<string, string> }>
  sys.battle.enabled = true
  if (sys.battle.config) sys.battle.config['damage_formula'] = 'atk-def'
  const mvp = doc.mvp as Record<string, unknown>
  mvp.milestones = ['α 切片|D1|一局可玩|30 分钟内跑通核心循环']
  ;(doc.tech as Record<string, unknown>).engine = 'Unity'
  return doc
}

describe('buildImplementationManifest（实现契约派生）', () => {
  it('从状态机/系统/核心循环/MVP 验收派生构建清单', () => {
    const m = buildImplementationManifest(filledDoc())
    expect(m.meta.gameName).toBe('星海计划')
    expect(m.stateMachine).toHaveLength(2)
    expect(m.stateMachine[0]).toMatchObject({ from: '主菜单', event: '点击开始', next: '对局中' })
    expect(m.modules.map((x) => x.key)).toContain('battle')
    expect(m.modules.find((x) => x.key === 'battle')?.params).toContainEqual({ key: 'damage_formula', value: 'atk-def' })
    expect(m.acceptance).toHaveLength(1)
    expect(m.buildOrder.map((s) => s.order)).toEqual([1, 2, 3, 4])
    const pending = m.pending.join('\n')
    expect(pending).not.toContain('缺状态机')
    expect(pending).not.toContain('未启用任何系统')
    expect(pending).not.toContain('tech.engine')
    expect(pending).toContain('工程规格')
  })

  it('空文档：如实报空缺，不编造', () => {
    const m = buildImplementationManifest(createDefaultCeshu({ scope: 'full' }))
    expect(m.stateMachine).toHaveLength(0)
    expect(m.modules).toHaveLength(0)
    const pending = m.pending.join('\n')
    expect(pending).toContain('缺状态机')
    expect(pending).toContain('未启用任何系统')
    expect(pending).toContain('缺可判定验收标准')
  })

  it('Markdown 含状态转移表、模块与验收项', () => {
    const md = renderImplementationManifestMarkdown(buildImplementationManifest(filledDoc()))
    expect(md).toContain('| 状态 | 触发事件 | 结算效果 | 新状态 |')
    expect(md).toContain('30 分钟内跑通核心循环')
    expect(md).toContain('### 战斗（battle）')
    expect(md).toContain('垂直切片优先')
  })
})

describe('manifest 导出格式（接入导出管道）', () => {
  it('注册为可导出格式，且导出产物是构建清单', async () => {
    expect(CESHU_EXPORT_FORMATS).toContain('manifest')
    expect(CESHU_FORMAT_LABELS.manifest).toContain('实现契约')
    const dir = mkdtempSync(join(tmpdir(), 'mb-manifest-'))
    const res = await exportCeshuDocument(filledDoc(), 'manifest', join(dir, 'impl'))
    expect(res.filePath.endsWith('.md')).toBe(true)
    const text = readFileSync(res.filePath, 'utf8')
    expect(text).toContain('实现契约（构建清单）')
    expect(text).toContain('| 状态 | 触发事件 | 结算效果 | 新状态 |')
  })
})
