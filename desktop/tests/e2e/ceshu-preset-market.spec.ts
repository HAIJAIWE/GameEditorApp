import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, libraryDir, waitReady } from './helpers/app'

test('预设市场：18 卡片 + 搜索筛选 + 应用预设（启用推荐系统 / 回填 game_type / 落盘）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-preset-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const createdId = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }> } }
        }
      ).mbApi
      const created = await api.ceshu.create({ name: '预设市场E2E', scope: 'full' })
      return created.ceshu_id
    })) as string

    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片 → 打开预设市场面板
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '预设市场E2E' }).getByTestId('home-card-open').click()
    // 「ceshu-preset-market」已收进工具栏「更多 ▸」下拉，需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-preset-market').click()

    await expect(window.getByTestId('preset-market-panel')).toBeVisible()
    await expect(window.getByTestId('preset-market-panel')).toContainText('共 18 个工业级预设')
    await expect(window.getByTestId('preset-card')).toHaveCount(18)

    // 首卡（仙侠 RPG）：风格/模块徽章 + 推荐系统「前 6 项 + 等 N 项」文案
    const firstCard = window.getByTestId('preset-card').first()
    await expect(firstCard.getByTestId('preset-label')).toHaveText('仙侠 RPG')
    await expect(firstCard.getByTestId('preset-style')).toHaveText('xianxia')
    await expect(firstCard.getByTestId('preset-module')).toHaveText('RPG')
    await expect(firstCard.getByTestId('preset-systems')).toHaveText(
      '⚙ 推荐系统: 角色、战斗、技能、装备、成长、任务 等 9 项'
    )
    await expect(firstCard.getByTestId('preset-secondary')).toHaveText('🔗 副模块: social')

    // 搜索：'仙侠' → 2 张；无匹配 → 空提示；清空 → 18 张
    await window.getByTestId('preset-search').fill('仙侠')
    await expect(window.getByTestId('preset-card')).toHaveCount(2)
    await expect(window.getByTestId('preset-grid')).toContainText('仙侠 MMORPG')
    await window.getByTestId('preset-search').fill('zzz不存在')
    await expect(window.getByTestId('preset-card')).toHaveCount(0)
    await expect(window.getByTestId('preset-empty')).toContainText("未找到匹配 'zzz不存在' 的预设")
    await window.getByTestId('preset-search').fill('')
    await expect(window.getByTestId('preset-card')).toHaveCount(18)

    // 应用「仙侠 RPG」：确认框列出 9 个系统
    await window.getByTestId('preset-card').first().getByTestId('preset-apply').click()
    await expect(window.getByTestId('preset-confirm-box')).toContainText('将应用预设【仙侠 RPG】')
    await expect(window.getByTestId('preset-confirm-box')).toContainText('将启用以下 9 个游戏系统')
    await expect(window.getByTestId('preset-confirm-box')).toContainText('✓ 角色')
    await window.getByTestId('preset-confirm').click()
    await expect(window.getByTestId('preset-notice')).toContainText('已应用预设【仙侠 RPG】，新启用 9 个游戏系统')
    await expect(window.getByTestId('preset-confirm-box')).toHaveCount(0)

    // IPC 核对：推荐系统已启用、未推荐系统保持关闭、meta.game_type 回填
    const doc = (await window.evaluate(async (id) => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { get: (req: { id: string }) => Promise<Record<string, unknown>> } }
        }
      ).mbApi
      return api.ceshu.get({ id })
    }, createdId)) as {
      systems: Record<string, { enabled: boolean }>
      meta: Record<string, unknown>
      enabled_editors: Array<{ key: string }>
    }
    expect(doc.systems.character?.enabled).toBe(true)
    expect(doc.systems.battle?.enabled).toBe(true)
    expect(doc.systems.competitive?.enabled).toBe(false)
    expect(doc.meta.game_type).toBe('rpg')
    expect(doc.enabled_editors.map((editor) => editor.key).sort()).toEqual([
      'battle',
      'character',
      'economy',
      'equipment',
      'growth',
      'item',
      'quest',
      'skill',
      'social'
    ])

    // 磁盘回读：新文档是**项目文件夹**（章节数据与配置分离）——
    // systems 在 `data/systems.json`，品类等配置在 `config.json`。
    const folder = join(libraryDir(userDataDir), 'ceshu', createdId)
    const onDisk = {
      systems: JSON.parse(readFileSync(join(folder, 'data', 'systems.json'), 'utf-8')) as Record<
        string,
        { enabled: boolean }
      >,
      meta: JSON.parse(readFileSync(join(folder, 'config.json'), 'utf-8')) as Record<string, unknown>
    }
    expect(onDisk.systems.economy?.enabled).toBe(true)
    expect(onDisk.meta.game_type).toBe('rpg')

    // 再次应用同一预设：推荐系统均已启用 → 新启用 0
    await window.getByTestId('preset-card').first().getByTestId('preset-apply').click()
    await window.getByTestId('preset-confirm').click()
    await expect(window.getByTestId('preset-notice')).toContainText('新启用 0 个游戏系统')

    await window.getByTestId('preset-close').click()
    await expect(window.getByTestId('preset-market-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('竞品象限图：vision 章渲染散点 + 空数据仅网格', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-chart-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 两份文档：一份 vision 带竞品数据，一份保持默认空
    await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }>
              saveChapter: (req: {
                id: string
                chapter: string
                data: Record<string, unknown>
              }) => Promise<unknown>
            }
          }
        }
      ).mbApi
      const withData = await api.ceshu.create({ name: '竞品图E2E', scope: 'full' })
      await api.ceshu.saveChapter({
        id: withData.ceshu_id,
        chapter: 'vision',
        data: {
          competitive_analysis: [
            { name: '竞品甲', innovation_score: 10, completion_score: 90 },
            { name: '竞品乙', innovation_score: 80, completion_score: 30 }
          ]
        }
      })
      await api.ceshu.create({ name: '竞品图空E2E', scope: 'full' })
    })

    // 文档经 IPC 旁路创建 → 重载首页列表
    await window.reload()
    await waitReady(window)

    // 有数据：2 个散点 + 名称 + 轴标签
    await window.getByTestId('home-card').filter({ hasText: '竞品图E2E' }).getByTestId('home-card-open').click()
    await window.getByTestId('chapter-tab').filter({ hasText: '第一章·产品愿景' }).click()
    await expect(window.getByTestId('competitive-chart')).toBeVisible()
    await expect(window.getByTestId('competitor-point')).toHaveCount(2)
    await expect(window.getByTestId('competitive-chart')).toContainText('竞品甲')
    await expect(window.getByTestId('competitive-chart')).toContainText('竞品乙')
    await expect(window.getByTestId('competitive-chart')).toContainText('创新度 →')
    await expect(window.getByTestId('competitive-chart')).toContainText('完成度 →')

    // 空数据：仍渲染网格，无散点（新 IA 切换策划书需先返回首页再打开另一卡片）
    await window.getByTestId('ceshu-back').click()
    await window.getByTestId('home-card').filter({ hasText: '竞品图空E2E' }).getByTestId('home-card-open').click()
    await window.getByTestId('chapter-tab').filter({ hasText: '第一章·产品愿景' }).click()
    await expect(window.getByTestId('competitive-chart')).toBeVisible()
    await expect(window.getByTestId('competitor-point')).toHaveCount(0)
  } finally {
    await app.close()
  }
})