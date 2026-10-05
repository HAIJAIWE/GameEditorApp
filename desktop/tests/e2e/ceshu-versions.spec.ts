import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface VersionSetupResult {
  rootId: string
  childId: string
  childLabel: string
  childParent: string
  childIsActive: boolean
  rootActiveAfter: boolean
  childActiveAfter: boolean
  changelogCount: number
  changelogVersion: string
  changelogDescriptions: string[]
}

test('版本链：派生 → 编辑子版本 → 变更记录 → 激活切换（IPC 与 UI 全链路）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-versions-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 侧：建链 → 派生 → 改子版本 → 变更记录 → 激活子版本
    const setup = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              derive: (req: { id: string; note: string }) => Promise<{
                ceshu_id: string
                parent_id: string
                version_label: string
                is_active: boolean
              }>
              get: (req: { id: string }) => Promise<{ meta: Record<string, unknown>; is_active: boolean }>
              saveChapter: (req: { id: string; chapter: string; data: unknown }) => Promise<unknown>
              setActive: (req: { id: string }) => Promise<unknown>
              changelog: (req: { id: string }) => Promise<{
                entries: Array<{ version: string; changes: Array<{ description: string }> }>
              }>
            }
          }
        }
      ).mbApi

      const root = await api.ceshu.create({ name: '版本链游戏', scope: 'full' })
      const child = await api.ceshu.derive({ id: root.ceshu_id, note: '首轮迭代' })
      const childDoc = await api.ceshu.get({ id: child.ceshu_id })
      await api.ceshu.saveChapter({
        id: child.ceshu_id,
        chapter: 'meta',
        data: { ...childDoc.meta, game_name: '版本链游戏改' }
      })
      const log = await api.ceshu.changelog({ id: root.ceshu_id })
      await api.ceshu.setActive({ id: child.ceshu_id })
      const rootAfter = await api.ceshu.get({ id: root.ceshu_id })
      const childAfter = await api.ceshu.get({ id: child.ceshu_id })

      return {
        rootId: root.ceshu_id,
        childId: child.ceshu_id,
        childLabel: child.version_label,
        childParent: child.parent_id,
        childIsActive: child.is_active,
        rootActiveAfter: rootAfter.is_active,
        childActiveAfter: childAfter.is_active,
        changelogCount: log.entries.length,
        changelogVersion: log.entries[0]?.version ?? '',
        changelogDescriptions: log.entries.flatMap((entry) => entry.changes.map((change) => change.description))
      }
    })) as VersionSetupResult

    expect(setup.childLabel).toBe('v1.1')
    expect(setup.childParent).toBe(setup.rootId)
    expect(setup.childIsActive).toBe(false)
    expect(setup.rootActiveAfter).toBe(false)
    expect(setup.childActiveAfter).toBe(true)
    expect(setup.changelogCount).toBe(1)
    expect(setup.changelogVersion).toBe('v1.1')
    expect(setup.changelogDescriptions).toContain('修改字段 game_name：版本链游戏 → 版本链游戏改')

    // UI 侧：首页卡片 → 版本徽标 → 变更记录面板 → 派生新版本 → 激活
    await window.reload()
    await waitReady(window)
    await expect(window.getByTestId('home-card')).toHaveCount(2)

    // 打开 v1.1（子版本，激活）卡片
    await window.getByTestId('home-card').filter({ hasText: 'v1.1' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('ceshu-version')).toContainText('v1.1')
    await expect(window.getByTestId('ceshu-version')).toContainText('激活')

    // 切到 v1.0：新 IA 无侧栏列表，需先返回首页再打开另一张卡片
    await window.getByTestId('ceshu-back').click()
    await window.getByTestId('home-card').filter({ hasText: 'v1.0' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('ceshu-version')).toContainText('v1.0')
    await expect(window.getByTestId('ceshu-version')).toContainText('未激活')
    await expect(window.getByTestId('ceshu-set-active')).toBeVisible()

    // 变更记录面板
    // 「ceshu-changelog」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-changelog').click()
    await expect(window.getByTestId('changelog-panel')).toBeVisible()
    await expect(window.getByTestId('changelog-panel')).toContainText('v1.1')
    await expect(window.getByTestId('changelog-panel')).toContainText('修改字段 game_name：版本链游戏 → 版本链游戏改')
    await window.getByTestId('changelog-close').click()
    await expect(window.getByTestId('changelog-panel')).toHaveCount(0)

    // 从 v1.0 派生 v1.2（版本号按链上已有编号递增），派生后自动切到新版本
    // 「ceshu-derive」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-derive').click()
    await window.getByTestId('derive-note').fill('E2E 派生')
    await window.getByTestId('derive-confirm').click()
    await expect(window.getByTestId('ceshu-version')).toContainText('v1.2')
    await expect(window.getByTestId('ceshu-version')).toContainText('未激活')

    // 新 IA 无侧栏列表：返回首页核对新增卡片（3 张），再打开 v1.2
    await window.getByTestId('ceshu-back').click()
    await expect(window.getByTestId('home-card')).toHaveCount(3)
    await window.getByTestId('home-card').filter({ hasText: 'v1.2' }).getByTestId('home-card-open').click()

    // 激活 v1.2：v1.1 自动取消激活
    await window.getByTestId('ceshu-set-active').click()
    await expect(window.getByTestId('ceshu-version')).toContainText('v1.2')
    await expect(window.getByTestId('ceshu-version')).toContainText('激活')
    await window.getByTestId('ceshu-back').click()
    await expect(window.getByTestId('home-card').filter({ hasText: 'v1.1' })).not.toContainText('★')
  } finally {
    await app.close()
  }
})