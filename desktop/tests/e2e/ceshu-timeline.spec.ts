import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface TimelineSetupResult {
  rootId: string
  child1Id: string
  child2Id: string
  child1Label: string
  child2Label: string
  nodeIds: string[]
  nodeLabels: string[]
  nodeNotes: string[]
  nodeActive: boolean[]
  nodeParents: string[]
}

test('版本时间线：版本链顺序与节点文案 → 点击详情 → 切换到此版本（IPC 与 UI 全链路）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-timeline-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // IPC 侧：建链（主 + 两个子版本）→ 激活 v1.1 → 读取版本链摘要
    const setup = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              derive: (req: { id: string; note: string }) => Promise<{ ceshu_id: string; version_label: string }>
              setActive: (req: { id: string }) => Promise<unknown>
              versions: (req: { id: string }) => Promise<
                Array<{
                  id: string
                  versionLabel: string
                  versionNote: string
                  isActive: boolean
                  parentId: string
                }>
              >
            }
          }
        }
      ).mbApi

      const root = await api.ceshu.create({ name: '时间线游戏', scope: 'full' })
      const child1 = await api.ceshu.derive({ id: root.ceshu_id, note: '首轮迭代' })
      const child2 = await api.ceshu.derive({ id: root.ceshu_id, note: '二轮迭代' })
      await api.ceshu.setActive({ id: child1.ceshu_id })
      // 从链尾（v1.2）查链，验证返回的是同一版本链
      const chain = await api.ceshu.versions({ id: child2.ceshu_id })

      return {
        rootId: root.ceshu_id,
        child1Id: child1.ceshu_id,
        child2Id: child2.ceshu_id,
        child1Label: child1.version_label,
        child2Label: child2.version_label,
        nodeIds: chain.map((item) => item.id),
        nodeLabels: chain.map((item) => item.versionLabel),
        nodeNotes: chain.map((item) => item.versionNote),
        nodeActive: chain.map((item) => item.isActive),
        nodeParents: chain.map((item) => item.parentId)
      }
    })) as TimelineSetupResult

    // 版本链顺序：主策划在首位，其余按版本号升序
    expect(setup.child1Label).toBe('v1.1')
    expect(setup.child2Label).toBe('v1.2')
    expect(setup.nodeIds).toEqual([setup.rootId, setup.child1Id, setup.child2Id])
    expect(setup.nodeLabels).toEqual(['v1.0', 'v1.1', 'v1.2'])
    expect(setup.nodeNotes).toEqual(['', '首轮迭代', '二轮迭代'])
    expect(setup.nodeActive).toEqual([false, true, false])
    expect(setup.nodeParents).toEqual(['', setup.rootId, setup.rootId])

    // UI 侧：文档经 IPC 旁路创建 → 重载首页列表 → 打开 v1.0 卡片 → 版本时间线面板
    await window.reload()
    await waitReady(window)
    await expect(window.getByTestId('home-card')).toHaveCount(3)
    await window.getByTestId('home-card').filter({ hasText: 'v1.0' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('ceshu-version')).toContainText('v1.0')

    // 「ceshu-timeline」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-timeline').click()
    await expect(window.getByTestId('timeline-panel')).toBeVisible()
    await expect(window.getByTestId('timeline-node')).toHaveCount(3)

    // 节点标题：主策划前缀 ★、激活后缀 ★
    await expect(window.getByTestId('timeline-node').nth(0)).toContainText('★ v1.0')
    await expect(window.getByTestId('timeline-node').nth(1)).toContainText('v1.1 ★')
    await expect(window.getByTestId('timeline-node').nth(2)).toContainText('v1.2')
    await expect(window.getByTestId('timeline-node').nth(0)).toContainText('时间线游戏')

    // 图例
    await expect(window.getByTestId('timeline-legend')).toContainText('激活版本')
    await expect(window.getByTestId('timeline-legend')).toContainText('→ 父→子派生')

    // 默认选中激活版本 v1.1（详情含版本说明）
    await expect(window.getByTestId('timeline-detail-title')).toContainText('版本详情：v1.1（激活版本）')
    await expect(window.getByTestId('timeline-detail')).toContainText('版本说明: 首轮迭代')

    // 点击主策划节点 → 详情切到 v1.0（无版本说明）
    await window.getByTestId('timeline-node').nth(0).click()
    await expect(window.getByTestId('timeline-detail-title')).toContainText('版本详情：v1.0')
    await expect(window.getByTestId('timeline-detail')).toContainText('版本说明: (无版本说明)')

    // 点击 v1.2 节点 → 切换到该版本（面板关闭，工具栏切到 v1.2）
    await window.getByTestId('timeline-node').nth(2).click()
    await expect(window.getByTestId('timeline-detail')).toContainText('版本说明: 二轮迭代')
    await window.getByTestId('timeline-switch').click()
    await expect(window.getByTestId('timeline-panel')).toHaveCount(0)
    await expect(window.getByTestId('ceshu-version')).toContainText('v1.2')
    await expect(window.getByTestId('ceshu-version')).toContainText('未激活')
    await expect(window.getByTestId('ceshu-set-active')).toBeVisible()
  } finally {
    await app.close()
  }
})