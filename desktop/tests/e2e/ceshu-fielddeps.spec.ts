import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface FieldDepsProbe {
  depCount: number
  okCount: number
  warningCount: number
  violationCount: number
  fieldNodes: number
  fieldEdges: number
  fieldLayers: number
  systemNodes: number
  systemEdges: number
  systemLayers: number
  missingBefore: number
  missingAfter: number
  missingDetail: string
  firstRow: string
}

test('依赖检查：IPC 精确结构 + 字段/系统双视图面板', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-fielddeps-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const probe = (await window.evaluate(async () => {
      interface DepResult {
        dependency: { source_chapter: string; source_field: string; target_chapter: string; target_field: string }
        status: string
        message: string
      }
      interface DepsReport {
        results: DepResult[]
        field_graph: { nodes: unknown[]; edges: unknown[]; layers: string[][] }
        system_graph: {
          nodes: unknown[]
          edges: unknown[]
          layers: string[][]
          missing_dependencies: Array<{ system: string; missing: string[] }>
        }
      }
      interface ChapterData {
        [key: string]: unknown
      }
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string; systems: Record<string, ChapterData> }>
              fieldDeps: (req: { id: string }) => Promise<DepsReport>
              saveChapter: (req: { id: string; chapter: string; data: ChapterData }) => Promise<unknown>
            }
          }
        }
      ).mbApi

      const created = await api.ceshu.create({ name: '依赖E2E', scope: 'full' })
      const before = await api.ceshu.fieldDeps({ id: created.ceshu_id })

      // 仅启用 battle（缺 character / skill）→ 系统依赖缺失应被标出
      const battle = created.systems.battle ?? {}
      await api.ceshu.saveChapter({
        id: created.ceshu_id,
        chapter: 'systems',
        data: { ...created.systems, battle: { ...battle, enabled: true } }
      })
      const after = await api.ceshu.fieldDeps({ id: created.ceshu_id })

      const first = before.results[0]?.dependency
      return {
        depCount: before.results.length,
        okCount: before.results.filter((item) => item.status === 'ok').length,
        warningCount: before.results.filter((item) => item.status === 'warning').length,
        violationCount: before.results.filter((item) => item.status === 'violation').length,
        fieldNodes: before.field_graph.nodes.length,
        fieldEdges: before.field_graph.edges.length,
        fieldLayers: before.field_graph.layers.length,
        systemNodes: before.system_graph.nodes.length,
        systemEdges: before.system_graph.edges.length,
        systemLayers: before.system_graph.layers.length,
        missingBefore: before.system_graph.missing_dependencies.length,
        missingAfter: after.system_graph.missing_dependencies.length,
        missingDetail: after.system_graph.missing_dependencies
          .map((item) => `${item.system}缺少${item.missing.join('、')}`)
          .join('；'),
        firstRow: first
          ? `${first.source_chapter}.${first.source_field}→${first.target_chapter}.${first.target_field}`
          : ''
      } satisfies FieldDepsProbe
    })) as FieldDepsProbe

    // 默认文档：20 条依赖全部通过；字段图 18 节点 / 19 边 / 10 层；系统图 13 节点 / 17 边 / 4 层
    expect(probe.depCount).toBe(20)
    expect(probe.okCount).toBe(20)
    expect(probe.warningCount).toBe(0)
    expect(probe.violationCount).toBe(0)
    expect(probe.fieldNodes).toBe(18)
    expect(probe.fieldEdges).toBe(19)
    expect(probe.fieldLayers).toBe(10)
    expect(probe.systemNodes).toBe(13)
    expect(probe.systemEdges).toBe(17)
    expect(probe.systemLayers).toBe(4)
    expect(probe.missingBefore).toBe(0)
    expect(probe.missingAfter).toBe(1)
    expect(probe.missingDetail).toBe('battle缺少character、skill')
    expect(probe.firstRow).not.toBe('')

    // UI：字段依赖视图（20 行 + 10 层）→ 系统依赖视图（缺失标红）
    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片 → 打开依赖检查面板
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '依赖E2E' }).getByTestId('home-card-open').click()
    // 「ceshu-fielddeps」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-fielddeps').click()
    await expect(window.getByTestId('fielddeps-panel')).toBeVisible()
    await expect(window.getByTestId('fielddeps-summary')).toContainText('字段依赖共 20 条')
    await expect(window.getByTestId('fielddeps-summary')).toContainText('✅ 通过 20')
    await expect(window.getByTestId('fielddeps-summary')).toContainText('章节分层 10 层')
    await expect(window.getByTestId('fielddeps-layer')).toHaveCount(10)
    await expect(window.getByTestId('fielddeps-row')).toHaveCount(20)
    await expect(window.getByTestId('fielddeps-row-status').first()).toContainText('✅ 通过')
    // 依赖表首行是 Python 依赖表首条：combat.combat_mode ↔ systems.battle.config.turn_mode
    await expect(window.getByTestId('fielddeps-row').first()).toContainText('第五章·战斗系统设计')

    await window.getByTestId('fielddeps-view-system').click()
    await expect(window.getByTestId('fielddeps-system-summary')).toContainText('系统依赖缺失 1 项')
    await expect(window.getByTestId('fielddeps-missing')).toContainText('battle 缺少 character、skill')
    await expect(window.getByTestId('fielddeps-system-layer')).toHaveCount(4)
    await expect(window.getByTestId('fielddeps-system-edge')).toHaveCount(17)
    // battle 已启用但其依赖未启用 → 该边标为依赖缺失
    await expect(window.getByTestId('fielddeps-system-edge').first()).toContainText('✖ 依赖缺失')

    await window.getByTestId('fielddeps-close').click()
    await expect(window.getByTestId('fielddeps-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})