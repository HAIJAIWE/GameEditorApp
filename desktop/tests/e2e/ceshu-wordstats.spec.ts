import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface WordStatsProbe {
  rowCount: number
  metaWords: number
  metaPercent: number
  metaAdvice: string
  visionWords: number
  visionAdvice: string
  systemsWords: number
  totalWords: number
  totalTarget: number
  overallPercent: number
  overallLevel: string
  firstLabel: string
  lastLabel: string
}

test('字数统计：IPC 精确数字 + 面板表格与总览', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-wordstats-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const probe = (await window.evaluate(async () => {
      interface WordStatRow {
        chapter_key: string
        chapter_label: string
        words: number
        percent: number
        percent_level: string
        advice: string
      }
      interface Report {
        rows: WordStatRow[]
        total_words: number
        total_target: number
        overall_percent: number
        overall_level: string
      }
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              wordStats: (req: { id: string }) => Promise<Report>
            }
          }
        }
      ).mbApi

      // 新建时已填 game_name（13 字 + 日期等默认值），得到与默认文档一致的统计口径
      const created = await api.ceshu.create({ name: '字数E2E', scope: 'full' })
      const report = await api.ceshu.wordStats({ id: created.ceshu_id })
      const rowOf = (key: string) => report.rows.find((row) => row.chapter_key === key)
      const meta = rowOf('meta')
      const vision = rowOf('vision')
      const systems = rowOf('systems')
      return {
        rowCount: report.rows.length,
        metaWords: meta?.words ?? -1,
        metaPercent: meta?.percent ?? -1,
        metaAdvice: meta?.advice ?? '',
        visionWords: vision?.words ?? -1,
        visionAdvice: vision?.advice ?? '',
        systemsWords: systems?.words ?? -1,
        totalWords: report.total_words,
        totalTarget: report.total_target,
        overallPercent: report.overall_percent,
        overallLevel: report.overall_level,
        firstLabel: report.rows[0]?.chapter_label ?? '',
        lastLabel: report.rows[report.rows.length - 1]?.chapter_label ?? ''
      } satisfies WordStatsProbe
    })) as WordStatsProbe

    // 与单测同一口径（游戏名「字数E2E」= 2 中文字 + 1 英文词 → meta 12 字，全域 47 字 / 目标 9200）
    expect(probe.rowCount).toBe(17)
    expect(probe.metaWords).toBe(12)
    expect(probe.metaPercent).toBe(8)
    expect(probe.metaAdvice).toBe('🟠 字数偏少（建议至少 50 字）')
    expect(probe.visionWords).toBe(0)
    expect(probe.visionAdvice).toBe('🔴 章节为空，建议尽快填写')
    expect(probe.systemsWords).toBe(35)
    expect(probe.totalWords).toBe(47)
    expect(probe.totalTarget).toBe(9200)
    expect(probe.overallPercent).toBe(0)
    expect(probe.overallLevel).toBe('low')
    expect(probe.firstLabel).toBe('文档信息')
    expect(probe.lastLabel).toBe('第十六章·可访问性与本地化')

    // UI 侧：文档经 IPC 旁路创建 → 重载首页列表 → 打开唯一卡片 → 面板总览 + 17 行章节表（文档信息 + 16 编号章）
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').first().getByTestId('home-card-open').click()
    // 「ceshu-wordstats」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-wordstats').click()
    await expect(window.getByTestId('wordstats-panel')).toBeVisible()
    await expect(window.getByTestId('wordstats-overview')).toContainText('总字数：47 字')
    await expect(window.getByTestId('wordstats-overview')).toContainText('整体完成度：0%')
    await expect(window.getByTestId('wordstats-row')).toHaveCount(17)
    await expect(window.getByTestId('wordstats-words').first()).toHaveText('12')
    await expect(window.getByTestId('wordstats-percent').first()).toHaveText('8%')
    await expect(window.getByTestId('wordstats-advice').first()).toContainText('🟠 字数偏少（建议至少 50 字）')
    await expect(window.getByTestId('wordstats-row').nth(1)).toContainText('第一章·产品愿景')
    await expect(window.getByTestId('wordstats-row').nth(1)).toContainText('🔴 章节为空，建议尽快填写')

    await window.getByTestId('wordstats-close').click()
    await expect(window.getByTestId('wordstats-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})