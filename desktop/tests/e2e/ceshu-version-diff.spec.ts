import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface DiffProbe {
  rootId: string
  childId: string
  totalAdded: number
  totalRemoved: number
  totalModified: number
  totalUnchanged: number
  metaUnchanged: number
  gameNameField: { old_value: unknown; new_value: unknown; diff_type: string; field_path: string }
  designVisionType: string
  sameIdError: string
}

test('版本对比：派生改字段 → 精确 Diff 计数 + 面板断言 + 导出报告', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-diff-e2e-'))
  const reportPath = join(userDataDir, 'diff-report.md')
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 侧：v1.0 → 派生 v1.1 → 改 meta.game_name 与 vision.design_vision → 对比计数
    const probe = (await window.evaluate(
      async (args: { reportPath: string }) => {
        interface ChapterData {
          [key: string]: unknown
        }
        interface Doc {
          ceshu_id: string
          version_label: string
          meta: ChapterData
          vision: ChapterData
        }
        interface ChapterDiff {
          chapter_key: string
          chapter_label: string
          field_diffs: Array<{
            field_path: string
            field_label: string
            old_value: unknown
            new_value: unknown
            diff_type: string
          }>
          added_count: number
          removed_count: number
          modified_count: number
          unchanged_count: number
        }
        interface VersionDiff {
          chapter_diffs: ChapterDiff[]
          total_added: number
          total_removed: number
          total_modified: number
          total_unchanged: number
        }
        const api = (
          globalThis as unknown as {
            mbApi: {
              ceshu: {
                create: (req: { name: string; scope: string }) => Promise<Doc>
                derive: (req: { id: string; note: string }) => Promise<Doc>
                get: (req: { id: string }) => Promise<Doc>
                saveChapter: (req: { id: string; chapter: string; data: ChapterData }) => Promise<Doc>
                diff: (req: { id: string; otherId: string }) => Promise<VersionDiff>
                exportDiffReport: (req: { path: string; content: string }) => Promise<{ filePath: string }>
              }
            }
          }
        ).mbApi

        const root = await api.ceshu.create({ name: '差异A', scope: 'full' })
        const child = await api.ceshu.derive({ id: root.ceshu_id, note: '改名称与愿景' })
        const childDoc = await api.ceshu.get({ id: child.ceshu_id })
        await api.ceshu.saveChapter({
          id: child.ceshu_id,
          chapter: 'meta',
          data: { ...childDoc.meta, game_name: '差异B' }
        })
        await api.ceshu.saveChapter({
          id: child.ceshu_id,
          chapter: 'vision',
          data: { ...childDoc.vision, design_vision: '新增的愿景文案' }
        })

        const diff = await api.ceshu.diff({ id: root.ceshu_id, otherId: child.ceshu_id })
        const metaChapter = diff.chapter_diffs.find((item) => item.chapter_key === 'meta')
        const visionChapter = diff.chapter_diffs.find((item) => item.chapter_key === 'vision')
        const gameNameField = metaChapter?.field_diffs.find((item) => item.field_label === 'game_name')
        const designVision = visionChapter?.field_diffs.find((item) => item.field_label === 'design_vision')
        const exported = await api.ceshu.exportDiffReport({
          path: args.reportPath,
          content: `# 版本对比报告\n- 修改: ${diff.total_modified}\n`
        })

        let sameIdError = ''
        try {
          await api.ceshu.diff({ id: root.ceshu_id, otherId: root.ceshu_id })
        } catch (error) {
          sameIdError = error instanceof Error ? error.message : String(error)
        }

        return {
          rootId: root.ceshu_id,
          childId: child.ceshu_id,
          totalAdded: diff.total_added,
          totalRemoved: diff.total_removed,
          totalModified: diff.total_modified,
          totalUnchanged: diff.total_unchanged,
          metaUnchanged: metaChapter?.unchanged_count ?? -1,
          gameNameField: gameNameField ?? {
            old_value: null,
            new_value: null,
            diff_type: '',
            field_path: ''
          },
          designVisionType: designVision?.diff_type ?? '',
          sameIdError,
          exportedPath: exported.filePath
        }
      },
      { reportPath }
    )) as DiffProbe & { exportedPath: string }

    expect(probe.totalModified).toBe(1)
    expect(probe.totalAdded).toBe(1)
    expect(probe.totalRemoved).toBe(0)
    // 默认章节内容确定：meta 扁平 10 键（1 处修改 → 未变 9）、全域 190 键（2 处变更 → 未变 188）
    expect(probe.metaUnchanged).toBe(9)
    expect(probe.totalUnchanged).toBe(188)
    expect(probe.gameNameField).toMatchObject({
      field_path: 'meta.game_name',
      old_value: '差异A',
      new_value: '差异B',
      diff_type: 'modified'
    })
    expect(probe.designVisionType).toBe('added')
    expect(probe.sameIdError).toContain('请选择两个不同的版本')
    expect(probe.exportedPath).toBe(reportPath)
    expect(readFileSync(reportPath, 'utf-8')).toContain('- 修改: 1')

    // UI 侧：文档经 IPC 旁路创建 → 重载首页列表 → 打开 v1.0（根）卡片 → 版本对比面板
    await window.reload()
    await waitReady(window)
    await expect(window.getByTestId('home-card')).toHaveCount(2)
    await window.getByTestId('home-card').filter({ hasText: '差异A' }).getByTestId('home-card-open').click()
    // 「ceshu-diff」已收进工具栏「更多 ▸」下拉（对齐 旧版），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-diff').click()
    await expect(window.getByTestId('diff-panel')).toBeVisible()
    await expect(window.getByTestId('diff-old')).toHaveValue(probe.rootId)
    await expect(window.getByTestId('diff-new')).toHaveValue(probe.childId)

    await window.getByTestId('diff-compare').click()
    await expect(window.getByTestId('diff-stats')).toContainText('✚ 新增 1')
    await expect(window.getByTestId('diff-stats')).toContainText('✎ 修改 1')
    await expect(window.getByTestId('diff-stats')).toContainText('变更率')
    await expect(window.getByTestId('diff-chapter')).toHaveCount(17)
    await expect(window.getByTestId('diff-chapter').first()).toContainText('1 处变更')

    // 默认选中第一个有变更的章节（文档信息 meta）：1 个字段 game_name
    await expect(window.getByTestId('diff-field')).toHaveCount(1)
    await expect(window.getByTestId('diff-field').first()).toContainText('game_name')
    await expect(window.getByTestId('diff-field').first()).toContainText('差异B')
    await expect(window.getByTestId('diff-field').first()).toContainText('✎ 修改')

    await window.getByTestId('diff-field').first().click()
    await expect(window.getByTestId('diff-detail')).toContainText('文档信息 · game_name')
    await expect(window.getByTestId('diff-detail')).toContainText('差异A')
    await expect(window.getByTestId('diff-detail')).toContainText('差异B')

    // 切到第一章（愿景）：design_vision 新增
    await window.getByTestId('diff-chapter').nth(1).click()
    await expect(window.getByTestId('diff-field')).toHaveCount(1)
    await expect(window.getByTestId('diff-field').first()).toContainText('design_vision')
    await expect(window.getByTestId('diff-field').first()).toContainText('✚ 新增')

    // 无变更章节：提示无变更
    await window.getByTestId('diff-chapter').nth(2).click()
    await expect(window.getByTestId('diff-panel')).toContainText('该章节无变更')

    await window.getByTestId('diff-close').click()
    await expect(window.getByTestId('diff-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})