import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

interface ChecklistSnapshot {
  ceshuId: string
  total: number
  passed: number
  failed: number
  warnings: number
  manual: number
  readiness: number
  ready: boolean
}

test('完备性检查清单：IPC 精确结果 + 一键修复 + UI 面板', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-checklist-e2e-'))
  const reportPath = join(userDataDir, 'checklist-report.md')
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // IPC 侧：空文档（仅填游戏名）→ 检查清单精确数字
    const before = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              checklist: (req: { id: string }) => Promise<{
                total_items: number
                passed: number
                failed: number
                warnings: number
                manual: number
                not_applicable: number
                readiness_score: number
                is_production_ready: boolean
                results: Array<{ item_id: string; status: string; message: string }>
              }>
            }
          }
        }
      ).mbApi

      const created = await api.ceshu.create({ name: '清单E2E', scope: 'full' })
      const report = await api.ceshu.checklist({ id: created.ceshu_id })
      const itemOf = (id: string) => report.results.find((item) => item.item_id === id)
      return {
        ceshuId: created.ceshu_id,
        total: report.total_items,
        passed: report.passed,
        failed: report.failed,
        warnings: report.warnings,
        manual: report.manual,
        notApplicable: report.not_applicable,
        readiness: report.readiness_score,
        ready: report.is_production_ready,
        gameNameItem: itemOf('PB-01')?.message ?? '',
        platformItem: itemOf('PB-03')?.message ?? '',
        manualItem: itemOf('TM-01')?.status ?? ''
      }
    })) as ChecklistSnapshot & { notApplicable: number; gameNameItem: string; platformItem: string; manualItem: string }

    expect(before.total).toBe(50)
    expect(before.passed).toBe(2)
    expect(before.failed).toBe(30)
    expect(before.warnings).toBe(5)
    expect(before.manual).toBe(13)
    expect(before.notApplicable).toBe(0)
    expect(before.readiness).toBe(5.4)
    expect(before.ready).toBe(false)
    expect(before.gameNameItem).toBe('游戏名称: 清单E2E')
    expect(before.platformItem).toBe('目标平台未设置')
    expect(before.manualItem).toBe('manual')

    // UI 侧：打开清单面板 → 一键修复 → 就绪度与统计刷新
    await window.getByTestId('mode-ceshu').click()
    await expect(window.getByTestId('ceshu-row')).toHaveCount(1)
    await window.getByTestId('ceshu-checklist').click()
    await expect(window.getByTestId('checklist-panel')).toBeVisible()
    await expect(window.getByTestId('checklist-score')).toHaveText('5')
    await expect(window.getByTestId('checklist-status')).toHaveText('❌ 未就绪')
    await expect(window.getByTestId('checklist-stats')).toContainText('通过 2')
    await expect(window.getByTestId('checklist-stats')).toContainText('共 50 项')
    await expect(window.getByTestId('checklist-category')).toHaveCount(6)
    await expect(window.getByTestId('checklist-category').first()).toContainText('项目基础（1/8）')
    await expect(window.getByTestId('checklist-item')).toHaveCount(8)
    await expect(window.getByTestId('checklist-item-msg').first()).toContainText('游戏名称: 清单E2E')

    // 切到「团队与流程」：全为人工核查项
    await window.getByTestId('checklist-category').nth(4).click()
    await expect(window.getByTestId('checklist-item')).toHaveCount(6)
    await expect(window.getByTestId('checklist-item-msg').first()).toContainText('请人工核查')

    await window.getByTestId('checklist-autofill').click()
    await expect(window.getByTestId('checklist-notice')).toContainText('已自动填充 34 个空必填字段')
    await expect(window.getByTestId('checklist-score')).toHaveText('65')
    await expect(window.getByTestId('checklist-stats')).toContainText('通过 24')
    await expect(window.getByTestId('checklist-stats')).toContainText('失败 9')
    await expect(window.getByTestId('checklist-category').first()).toContainText('项目基础（6/8）')

    await window.getByTestId('checklist-close').click()
    await expect(window.getByTestId('checklist-panel')).toHaveCount(0)

    // 回读磁盘：填充结果已落盘（整文档写入）
    const persisted = (await window.evaluate(
      async (args: { id: string; path: string }) => {
        const api = (
          globalThis as unknown as {
            mbApi: {
              ceshu: {
                get: (req: { id: string }) => Promise<{ meta: Record<string, unknown>; combat: Record<string, unknown> }>
                exportChecklistReport: (req: { path: string; content: string }) => Promise<{ filePath: string }>
              }
            }
          }
        ).mbApi
        const doc = await api.ceshu.get({ id: args.id })
        const exported = await api.ceshu.exportChecklistReport({ path: args.path, content: '# 检查报告\n' })
        return {
          positioning: doc.meta.positioning,
          combatMode: doc.combat.combat_mode,
          exportedPath: exported.filePath
        }
      },
      { id: before.ceshuId, path: reportPath }
    )) as { positioning: string; combatMode: string; exportedPath: string }

    expect(persisted.positioning).toBe('清单E2E - RPG 类型项目')
    expect(persisted.combatMode).toBe('回合制')
    expect(persisted.exportedPath).toBe(reportPath)
    expect(readFileSync(reportPath, 'utf-8')).toBe('# 检查报告\n')
  } finally {
    await app.close()
  }
})