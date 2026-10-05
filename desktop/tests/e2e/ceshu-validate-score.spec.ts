import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface ValidateScoreSetup {
  emptyErrorCount: number
  firstError: string
  emptyTotal: number
  emptyGrade: string
  chapterCount: number
  filledErrorCount: number
  filledStructure: number
  filledTotal: number
  filledMetaScore: number | undefined
}

test('校验与评分：IPC 精确结果 + UI 面板展示', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-score-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 侧：空文档校验/评分 → 填 meta 后再次校验/评分（数字与 Python 公式一致）
    const setup = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              get: (req: { id: string }) => Promise<{ meta: Record<string, unknown> }>
              saveChapter: (req: { id: string; chapter: string; data: unknown }) => Promise<unknown>
              validate: (req: { id: string }) => Promise<string[]>
              score: (req: { id: string }) => Promise<{
                total_score: number
                structure_score: number
                grade: string
                chapter_scores: Array<{ chapter_key: string; score: number }>
              }>
            }
          }
        }
      ).mbApi

      const created = await api.ceshu.create({ name: '评分测试', scope: 'full' })
      const emptyErrors = await api.ceshu.validate({ id: created.ceshu_id })
      const emptyScore = await api.ceshu.score({ id: created.ceshu_id })

      const doc = await api.ceshu.get({ id: created.ceshu_id })
      await api.ceshu.saveChapter({
        id: created.ceshu_id,
        chapter: 'meta',
        data: { ...doc.meta, game_type: 'RPG', positioning: '一句话定位', tags: ['标签'] }
      })
      const filledErrors = await api.ceshu.validate({ id: created.ceshu_id })
      const filledScore = await api.ceshu.score({ id: created.ceshu_id })

      return {
        emptyErrorCount: emptyErrors.length,
        firstError: emptyErrors[0] ?? '',
        emptyTotal: emptyScore.total_score,
        emptyGrade: emptyScore.grade,
        chapterCount: emptyScore.chapter_scores.length,
        filledErrorCount: filledErrors.length,
        filledStructure: filledScore.structure_score,
        filledTotal: filledScore.total_score,
        filledMetaScore: filledScore.chapter_scores.find((chapter) => chapter.chapter_key === 'meta')?.score
      }
    })) as ValidateScoreSetup

    // 新建时已填 game_name，故必填错误为 35 - 1 = 34 条
    expect(setup.emptyErrorCount).toBe(34)
    expect(setup.firstError).toContain('为必填项')
    // 评分语义：0 不算缺失（同 Python v in (None,"",[],{})），故默认文档结构分为 1.5
    expect(setup.emptyTotal).toBe(1.5)
    expect(setup.emptyGrade).toBe('D')
    expect(setup.chapterCount).toBe(18)
    expect(setup.filledErrorCount).toBe(31)
    expect(setup.filledStructure).toBe(3)
    expect(setup.filledTotal).toBe(3)
    expect(setup.filledMetaScore).toBe(79)

    // UI 侧：校验面板与评分面板
    await window.getByTestId('mode-ceshu').click()
    await expect(window.getByTestId('ceshu-row')).toHaveCount(1)

    await window.getByTestId('ceshu-validate').click()
    await expect(window.getByTestId('validate-panel')).toBeVisible()
    await expect(window.getByTestId('validate-panel')).toContainText('个问题')
    await expect(window.getByTestId('validate-panel')).toContainText('为必填项')
    await window.getByTestId('validate-close').click()
    await expect(window.getByTestId('validate-panel')).toHaveCount(0)

    await window.getByTestId('ceshu-score').click()
    await expect(window.getByTestId('score-panel')).toBeVisible()
    await expect(window.getByTestId('score-panel')).toContainText('结构 3/30')
    await expect(window.getByTestId('score-panel')).toContainText('章节明细')
    await expect(window.getByTestId('score-panel')).toContainText('行业对比')
    await window.getByTestId('score-close').click()
    await expect(window.getByTestId('score-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})