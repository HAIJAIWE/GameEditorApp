import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 校验与**完备度**：IPC 精确结果 + UI 面板展示（2026-10-27 由 `ceshu-validate-score.spec.ts` 改写）。
 *
 * 100 分制评分（`ceshu:score` / score-panel / 总分 / 等级 / 行业对比）已整体移除，
 * 换成**有明确分母**的完备度报告（`ceshu:readiness` / readiness-panel）：
 * 「每个阶段必填几个 / 填了几个 / 缺哪几个」+ 逐章缺口 + **有出处**的参照对比。
 *
 * 分母口径与 `validateCeshu` / `computeChapterProgress` 同源 —— 这也正是本用例同时
 * 断言 IPC 两侧数字的原因：完备度与校验**不能各说各话**。
 */
interface ValidateReadinessSetup {
  emptyErrorCount: number
  firstError: string
  emptyConceptFilled: number
  emptyConceptTotal: number
  emptyChapterCount: number
  filledErrorCount: number
  filledConceptFilled: number
  filledConceptTotal: number
  filledMetaFilled: number
  filledMetaTotal: number
  filledTotalRequired: number
  filledTotalMissing: number
  referenceCount: number
  referenceKinds: string[]
}

test('校验与完备度：IPC 精确结果 + UI 面板展示', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-readiness-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 侧：空文档校验/完备度 → 填 meta 后再次校验/完备度（分母与校验同源）
    const setup = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              get: (req: { id: string }) => Promise<{ meta: Record<string, unknown> }>
              saveChapter: (req: { id: string; chapter: string; data: unknown }) => Promise<unknown>
              validate: (req: { id: string }) => Promise<string[]>
              readiness: (req: { id: string }) => Promise<{
                concept: { required_filled: number; required_total: number }
                chapters: Array<{ chapter_key: string; required_filled: number; required_total: number }>
                total_required: number
                total_missing: number
                references: Array<{ id: string; kind: string }>
              }>
            }
          }
        }
      ).mbApi

      const created = await api.ceshu.create({ name: '评分测试', scope: 'full' })
      const emptyErrors = await api.ceshu.validate({ id: created.ceshu_id })
      const emptyReadiness = await api.ceshu.readiness({ id: created.ceshu_id })

      const doc = await api.ceshu.get({ id: created.ceshu_id })
      await api.ceshu.saveChapter({
        id: created.ceshu_id,
        chapter: 'meta',
        data: { ...doc.meta, game_type: 'RPG', positioning: '一句话定位', tags: ['标签'] }
      })
      const filledErrors = await api.ceshu.validate({ id: created.ceshu_id })
      const filledReadiness = await api.ceshu.readiness({ id: created.ceshu_id })
      const filledMeta = filledReadiness.chapters.find((chapter) => chapter.chapter_key === 'meta')

      return {
        emptyErrorCount: emptyErrors.length,
        firstError: emptyErrors[0] ?? '',
        emptyConceptFilled: emptyReadiness.concept.required_filled,
        emptyConceptTotal: emptyReadiness.concept.required_total,
        emptyChapterCount: emptyReadiness.chapters.length,
        filledErrorCount: filledErrors.length,
        filledConceptFilled: filledReadiness.concept.required_filled,
        filledConceptTotal: filledReadiness.concept.required_total,
        filledMetaFilled: filledMeta?.required_filled ?? -1,
        filledMetaTotal: filledMeta?.required_total ?? -1,
        filledTotalRequired: filledReadiness.total_required,
        filledTotalMissing: filledReadiness.total_missing,
        referenceCount: filledReadiness.references.length,
        referenceKinds: filledReadiness.references.map((reference) => reference.kind)
      }
    })) as ValidateReadinessSetup

    // 新建时已填 game_name，故校验消息 = 23 条（含「game_type 由人确定」等）。
    // 2026-11-11 起整章未生成只出 1 条「本章尚未生成」建议（warning），不再逐字段报
    // 「为必填项」硬错误，故较旧口径的 42 条少 19 条；只剩 meta / vision 有真实逐字段缺口。
    // ⚠️ 这几个数字是 schema 的派生值：schema 一改（如 2026-11-07「游戏章表默认收敛」、
    // 2026-11-08 补字段）就得同步；本条曾长期停在 48/45/50，与现网 schema 已不符。
    expect(setup.emptyErrorCount).toBe(23)
    // 首条错误可能是「必填项」也可能是「由人确定」（人工决断字段）——两者都算未填
    expect(setup.firstError).toMatch(/为必填项|由人确定/)
    // 空文档：立项 1/16（只有 game_name 有值）、逐章 21 条（= 当前 schema 的章数）
    expect(setup.emptyConceptFilled).toBe(1)
    expect(setup.emptyConceptTotal).toBe(16)
    expect(setup.emptyChapterCount).toBe(21)

    // 填满 meta 四必填：校验消息 20 条，立项 4/16，meta 章 4/4
    expect(setup.filledErrorCount).toBe(20)
    expect(setup.filledConceptFilled).toBe(4)
    expect(setup.filledConceptTotal).toBe(16)
    expect(setup.filledMetaFilled).toBe(4)
    expect(setup.filledMetaTotal).toBe(4)
    // 全文分母 44（= CHAPTER_REQUIRED_FIELDS 之和），缺口 44 - 4 = 40
    expect(setup.filledTotalRequired).toBe(44)
    expect(setup.filledTotalMissing).toBe(40)

    // 参照库有 5 条，且出处类型如实（真实公开 / 本项目交付 / 合成样例）
    expect(setup.referenceCount).toBe(5)
    expect(setup.referenceKinds).toContain('real-public')
    expect(setup.referenceKinds).toContain('project-deliverable')
    expect(setup.referenceKinds).toContain('project-sample')

    // UI 侧：文档经 IPC 旁路创建 → 重载首页列表后打开唯一卡片 → 校验面板与完备度面板
    await window.reload()
    await waitReady(window)
    await expect(window.getByTestId('home-card')).toHaveCount(1)
    await window.getByTestId('home-card').first().getByTestId('home-card-open').click()

    await window.getByTestId('ceshu-validate').click()
    await expect(window.getByTestId('validate-panel')).toBeVisible()
    await expect(window.getByTestId('validate-panel')).toContainText('个问题')
    await expect(window.getByTestId('validate-panel')).toContainText('为必填项')
    // 未生成的章只给一条建议性提示，不再被当成阻断
    await expect(window.getByTestId('validate-panel')).toContainText('本章尚未生成')
    await window.getByTestId('validate-close').click()
    await expect(window.getByTestId('validate-panel')).toHaveCount(0)

    // 「完备度」收在工具栏「更多 ▸」下拉里，需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-readiness').click()
    const panel = window.getByTestId('readiness-panel')
    await expect(panel).toBeVisible()
    await expect(panel).toContainText('立项必填 4/16')
    await expect(panel).toContainText('逐章缺口')
    await expect(panel).toContainText('参照文档对比（有出处）')
    // 参照对比区块（含出处明细）确实渲染
    await expect(window.getByTestId('readiness-references')).toBeVisible()
    await expect(window.getByTestId('readiness-references')).toContainText('真实公开文档')
    await window.getByTestId('readiness-close').click()
    await expect(panel).toHaveCount(0)
  } finally {
    await app.close()
  }
})
