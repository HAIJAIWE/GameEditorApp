import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/** 策划书首页卡片视图的 IPC 形状（仅本用例用到的部分） */
interface HomeApi {
  ceshu: {
    create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string; meta: Record<string, unknown> }>
    saveChapter: (req: { id: string; chapter: string; data: Record<string, unknown> }) => Promise<unknown>
    list: () => Promise<Array<{ id: string; gameName: string }>>
  }
}

/**
 * W34 策划书首页（卡片视图）端到端验收：
 * 卡片网格渲染（标题/类型/状态/版本徽章）+ 搜索过滤 + 最近打开 + 重命名/复制/删除。
 */
test('策划书首页：卡片渲染 + 搜索 + 最近打开 + 重命名/复制/删除', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-home-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 造 3 份文档：不同名称 / 类型 / 状态
    const ids = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: HomeApi }).mbApi
      const specs = [
        { name: '首页卡片甲', game_type: 'rpg', status: 'draft' },
        { name: '首页卡片乙', game_type: '', status: 'final' },
        { name: '首页卡片丙', game_type: 'slg', status: 'in_progress' }
      ]
      const out: string[] = []
      for (const spec of specs) {
        const doc = await api.ceshu.create({ name: spec.name, scope: 'full' })
        await api.ceshu.saveChapter({
          id: doc.ceshu_id,
          chapter: 'meta',
          data: { ...doc.meta, game_name: spec.name, game_type: spec.game_type, status: spec.status }
        })
        out.push(doc.ceshu_id)
      }
      return out
    })) as string[]
    const [idA, idB, idC] = ids

    // 新 IA 默认已落在策划书首页：文档经 IPC 旁路创建 → 重载首页列表后核对卡片
    await window.reload()
    await waitReady(window)
    await expect(window.getByTestId('home-card')).toHaveCount(3)

    // 卡片内容：标题 / 类型 / 状态 / 版本徽章 / 日期
    const cardA = window.getByTestId('home-card').filter({ hasText: '首页卡片甲' })
    await expect(cardA.getByTestId('home-card-title')).toHaveText('首页卡片甲')
    await expect(cardA.getByTestId('home-card-type')).toHaveText('rpg')
    await expect(cardA.getByTestId('home-card-status')).toHaveText('草稿')
    await expect(cardA.getByTestId('home-card-version')).toHaveText('v1.0 (主) ★')
    await expect(cardA.getByTestId('home-card-date')).not.toHaveText('')
    await expect(cardA.getByTestId('home-card-progress')).toBeVisible()

    // 空类型回退「未分类」，状态映射 final → 已确认
    const cardB = window.getByTestId('home-card').filter({ hasText: '首页卡片乙' })
    await expect(cardB.getByTestId('home-card-type')).toHaveText('未分类')
    await expect(cardB.getByTestId('home-card-status')).toHaveText('已确认')

    // 最近打开：3 份（≤ 5）
    await expect(window.getByTestId('home-recent-item')).toHaveCount(3)

    // 搜索：按名称（不区分大小写）过滤；无匹配给空态
    await window.getByTestId('home-search').fill('丙')
    await expect(window.getByTestId('home-card')).toHaveCount(1)
    await window.getByTestId('home-search').fill('zzz不存在')
    await expect(window.getByTestId('home-card')).toHaveCount(0)
    await expect(window.getByTestId('home-empty')).toContainText("未找到匹配 'zzz不存在' 的策划书")
    await window.getByTestId('home-search').fill('首页卡片')
    await expect(window.getByTestId('home-card')).toHaveCount(3)
    await window.getByTestId('home-search').fill('')

    // 重命名：内联输入 → 落盘
    await cardA.getByTestId('home-card-rename').click()
    await expect(cardA.getByTestId('home-rename-input')).toHaveValue('首页卡片甲')
    await cardA.getByTestId('home-rename-input').fill('重命名后甲')
    await cardA.getByTestId('home-rename-save').click()
    await expect(window.getByTestId('home-notice')).toContainText('已重命名为「重命名后甲」')
    await expect(window.getByTestId('home-card').filter({ hasText: '重命名后甲' })).toHaveCount(1)

    // 复制：新增一张「 (副本)」卡片
    await window
      .getByTestId('home-card')
      .filter({ hasText: '重命名后甲' })
      .getByTestId('home-card-copy')
      .click()
    await expect(window.getByTestId('home-notice')).toContainText('已复制为「重命名后甲 (副本)」')
    await expect(window.getByTestId('home-card')).toHaveCount(4)
    await expect(window.getByTestId('home-card').filter({ hasText: '重命名后甲 (副本)' })).toHaveCount(1)

    // 删除：二次确认 → 卡片消失 + 磁盘文件移除
    const cardB2 = window.getByTestId('home-card').filter({ hasText: '首页卡片乙' })
    await cardB2.getByTestId('home-card-delete').click()
    await expect(cardB2.getByTestId('home-delete-box')).toContainText('此操作不可撤销')
    await cardB2.getByTestId('home-delete-confirm').click()
    await expect(window.getByTestId('home-notice')).toContainText('已删除策划书')
    await expect(window.getByTestId('home-card')).toHaveCount(3)
    expect(existsSync(join(userDataDir, 'ceshu', `${idB}.json`))).toBe(false)
    // 未删除的仍在
    expect(existsSync(join(userDataDir, 'ceshu', `${idA}.json`))).toBe(true)
    expect(existsSync(join(userDataDir, 'ceshu', `${idC}.json`))).toBe(true)
    // 目录内无残留临时文件
    expect(readdirSync(join(userDataDir, 'ceshu')).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)

    // IPC 复核：列表为 3 份（甲 + 副本 + 丙）
    const list = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: HomeApi }).mbApi
      return api.ceshu.list()
    })) as Array<{ id: string; gameName: string }>
    expect(list).toHaveLength(3)
    expect(list.map((item) => item.gameName).sort()).toEqual(
      ['首页卡片丙', '重命名后甲', '重命名后甲 (副本)'].sort()
    )

    // 点击卡片 → 回到编辑器（首页隐藏）
    await window.getByTestId('home-card').filter({ hasText: '首页卡片丙' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('ceshu-home-panel')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
