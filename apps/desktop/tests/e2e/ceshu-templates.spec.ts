import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Page, expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/** 读取 meta 章节关键字段（走 IPC，用于核对落盘结果） */
async function readMeta(window: Page, id: string): Promise<{ gameName: string; positioning: string }> {
  return window.evaluate(async (ceshuId: string) => {
    const api = (
      globalThis as unknown as {
        mbApi: { ceshu: { get: (req: { id: string }) => Promise<{ meta: Record<string, unknown> }> } }
      }
    ).mbApi
    const doc = await api.ceshu.get({ id: ceshuId })
    return {
      gameName: typeof doc.meta.game_name === 'string' ? doc.meta.game_name : '',
      positioning: typeof doc.meta.positioning === 'string' ? doc.meta.positioning : ''
    }
  }, id)
}

test('章节模板库：筛选/预览/三模式应用/保存落盘/无数据模板提示（UI 全链路）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-templates-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const ceshuId = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }> } }
        }
      ).mbApi
      const doc = await api.ceshu.create({ name: '模板E2E', scope: 'full' })
      return doc.ceshu_id
    })) as string

    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '模板E2E' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('ceshu-field-game_name')).toHaveValue('模板E2E')

    // 打开模板库：默认筛选当前章节（meta 3 个模板）
    await window.getByTestId('template-picker-open').click()
    await expect(window.getByTestId('template-panel')).toBeVisible()
    await expect(window.getByTestId('template-item')).toHaveCount(3)
    await expect(window.getByTestId('template-count')).toHaveText('3 个模板')
    await expect(window.getByTestId('template-item').nth(0)).toContainText('[文档信息] 仙侠 RPG 项目样板')
    await expect(window.getByTestId('template-item').nth(0)).toContainText('仙侠 · RPG · 国产 · 双平台')

    // 预览：标题 + 描述 + 标签 + 内容树
    await window.getByTestId('template-item').nth(0).click()
    await expect(window.getByTestId('template-preview-title')).toContainText('[文档信息] 仙侠 RPG 项目样板')
    await expect(window.getByTestId('template-preview')).toContainText('国产仙侠题材 RPG 项目元信息，含 PC + 移动双平台定位')
    await expect(window.getByTestId('template-preview-rows')).toContainText('game_name: 云海仙踪')
    await expect(window.getByTestId('template-preview-rows')).toContainText('platform:')
    await expect(window.getByTestId('template-preview-rows')).toContainText('- PC')

    // 搜索：全部章节 + 关键词（命中 1 个）；无匹配显示占位
    await window.getByTestId('template-chapter').selectOption('')
    await window.getByTestId('template-search').fill('放置')
    await expect(window.getByTestId('template-item')).toHaveCount(1)
    await expect(window.getByTestId('template-item').nth(0)).toContainText('休闲放置样板')
    await window.getByTestId('template-search').fill('zzz')
    await expect(window.getByTestId('template-empty')).toBeVisible()

    // 还原筛选并选中 meta 首个模板
    await window.getByTestId('template-search').fill('')
    await window.getByTestId('template-chapter').selectOption('meta')
    await expect(window.getByTestId('template-item')).toHaveCount(3)
    await window.getByTestId('template-item').nth(0).click()

    // 二次确认：先取消，再确认应用（默认「仅填充空字段」）
    await window.getByTestId('template-apply').click()
    await expect(window.getByTestId('template-confirm')).toBeVisible()
    await expect(window.getByTestId('template-confirm-text')).toContainText(
      '将应用模板「仙侠 RPG 项目样板」到「文档信息」'
    )
    await window.getByTestId('template-apply-cancel').click()
    await expect(window.getByTestId('template-confirm')).toHaveCount(0)

    await window.getByTestId('template-apply').click()
    await window.getByTestId('template-apply-confirm').click()
    await expect(window.getByTestId('template-panel')).toHaveCount(0)
    await expect(window.getByTestId('chapter-form')).toContainText(
      '已应用模板「仙侠 RPG 项目样板」（仅填充空字段）'
    )

    // fillEmpty 语义：已有值（game_name=模板E2E）保留，空字段被填充
    await expect(window.getByTestId('ceshu-field-game_name')).toHaveValue('模板E2E')
    await expect(window.getByTestId('ceshu-field-positioning')).toHaveValue('3D 仙侠开放世界 RPG，重剧情 + 轻社交')
    await expect(window.getByTestId('ceshu-field-platform').getByRole('checkbox', { name: 'PC' })).toBeChecked()

    // 保存 → 落盘核对
    await window.getByTestId('chapter-save').click()
    await expect
      .poll(() => readMeta(window, ceshuId))
      .toEqual({ gameName: '模板E2E', positioning: '3D 仙侠开放世界 RPG，重剧情 + 轻社交' })

    // overwrite 模式：覆盖已有值
    await window.getByTestId('template-picker-open').click()
    await window.getByTestId('template-item').nth(0).click()
    await window.getByTestId('template-mode').selectOption('overwrite')
    await window.getByTestId('template-apply').click()
    await window.getByTestId('template-apply-confirm').click()
    await expect(window.getByTestId('ceshu-field-game_name')).toHaveValue('云海仙踪')
    await expect(window.getByTestId('chapter-form')).toContainText('（覆盖现有字段）')

    // append 模式：文本字段换行追加（第二个模板：科幻射击样板）
    await window.getByTestId('template-picker-open').click()
    await window.getByTestId('template-item').nth(1).click()
    await window.getByTestId('template-mode').selectOption('append')
    await window.getByTestId('template-apply').click()
    await window.getByTestId('template-apply-confirm').click()
    // 单行 input 会丢弃换行（浏览器与 QLineEdit 行为一致），故按正则断言拼接结果
    await expect(window.getByTestId('ceshu-field-game_name')).toHaveValue(/^云海仙踪\s*裂隙边境$/)
    await expect(window.getByTestId('ceshu-field-positioning')).toHaveValue(/^3D 仙侠开放世界 RPG.*近未来科幻 TPS.*$/)
    await window.getByTestId('chapter-save').click()
    await expect.poll(() => readMeta(window, ceshuId)).toEqual({
      gameName: '云海仙踪\n裂隙边境',
      positioning: '3D 仙侠开放世界 RPG，重剧情 + 轻社交\n近未来科幻 TPS，强调战术配合与可破坏场景'
    })

    // 系统章：唯一内置模板无数据 → 展示 note 且应用按钮禁用。
    // 「游戏系统设计」归研发阶段，而编辑器默认按立项阶段筛选 ⇒ 先切「全部阶段」才看得到这一章。
    await window.getByTestId('stage-filter-all').click()
    await window.getByTestId('chapter-tab').filter({ hasText: '4. 游戏系统设计' }).click()
    await window.getByTestId('template-picker-open').click()
    await expect(window.getByTestId('template-item')).toHaveCount(1)
    await window.getByTestId('template-item').nth(0).click()
    await expect(window.getByTestId('template-no-data')).toContainText('请使用「预设」按钮应用 RPG 系统组合')
    await expect(window.getByTestId('template-apply')).toBeDisabled()
    await window.getByTestId('template-close').click()
    await expect(window.getByTestId('template-panel')).toHaveCount(0)
    await expect(window.getByTestId('chapter-form')).toBeVisible()
  } finally {
    await app.close()
  }
})