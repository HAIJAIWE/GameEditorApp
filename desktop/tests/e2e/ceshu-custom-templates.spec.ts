import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Page, expect, test } from '@playwright/test'
import { launchApp, libraryDir, waitReady } from './helpers/app'
import { countChapterTemplates } from '../../src/shared/ceshuTemplates'

interface StoredTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  chapter_key: string
  data: Record<string, unknown>
  created_at: string
  updated_at: string
  source_game: string
}

/** 读取模板分类文件（磁盘回读核对） */
function readCategoryFile(userDataDir: string, category: string): StoredTemplate[] {
  const path = join(libraryDir(userDataDir), 'ceshu_templates', `${category}.json`)
  if (!existsSync(path)) return []
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { templates: StoredTemplate[] }
  return raw.templates
}

async function readChapterPositioning(window: Page, id: string): Promise<string> {
  return window.evaluate(async (ceshuId: string) => {
    const api = (
      globalThis as unknown as {
        mbApi: { ceshu: { get: (req: { id: string }) => Promise<{ meta: Record<string, unknown> }> } }
      }
    ).mbApi
    const doc = await api.ceshu.get({ id: ceshuId })
    return typeof doc.meta.positioning === 'string' ? doc.meta.positioning : ''
  }, id)
}

test('自定义模板：另存为模板（章节/全局）→ 来源筛选 → 套用覆盖 → 删除（IPC 与 UI 全链路）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-custom-templates-e2e-'))
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
      const doc = await api.ceshu.create({ name: '自定义模板E2E', scope: 'full' })
      return doc.ceshu_id
    })) as string

    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '自定义模板E2E' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('ceshu-field-game_name')).toHaveValue('自定义模板E2E')

    // 准备模板快照内容
    await window.getByTestId('ceshu-field-positioning').fill('模板快照定位')

    // 打开模板库：仅 3 个内置模板（自定义模板目录尚不存在）
    await window.getByTestId('template-picker-open').click()
    await expect(window.getByTestId('template-item')).toHaveCount(3)
    await expect(window.getByTestId('template-badge').nth(0)).toHaveText('内置')

    // 另存为模板：名称为空时保存按钮禁用
    await window.getByTestId('template-save-open').click()
    await expect(window.getByTestId('template-save-form')).toBeVisible()
    await expect(window.getByTestId('template-save-confirm')).toBeDisabled()
    await window.getByTestId('template-save-name').fill('我的元信息模板')
    await window.getByTestId('template-save-description').fill('E2E 描述')
    await window.getByTestId('template-save-tags').fill('测试, 元信息')
    await expect(window.getByTestId('template-save-confirm')).toBeEnabled()
    await window.getByTestId('template-save-confirm').click()

    await expect(window.getByTestId('template-notice')).toContainText('已保存为自定义模板「我的元信息模板」')
    await expect(window.getByTestId('template-item')).toHaveCount(4)
    await expect(window.getByTestId('template-item').nth(3)).toContainText('自定义')
    await expect(window.getByTestId('template-item').nth(3)).toContainText('[文档信息] 我的元信息模板')
    await expect(window.getByTestId('template-item').nth(3)).toContainText('测试 · 元信息')

    // 磁盘回读：<userData>/ceshu_templates/meta.json
    const metaFile = readCategoryFile(userDataDir, 'meta')
    expect(metaFile).toHaveLength(1)
    expect(metaFile[0]?.id).toMatch(/^[0-9a-f]{12}$/)
    expect(metaFile[0]).toMatchObject({
      name: '我的元信息模板',
      description: 'E2E 描述',
      tags: ['测试', '元信息'],
      chapter_key: 'meta',
      source_game: '自定义模板E2E'
    })
    expect(metaFile[0]?.data['positioning']).toBe('模板快照定位')
    expect(metaFile[0]?.data['game_name']).toBe('自定义模板E2E')

    // 来源筛选：仅自定义 1 项 / 仅内置 3 项
    await window.getByTestId('template-source').selectOption('custom')
    await expect(window.getByTestId('template-item')).toHaveCount(1)
    await window.getByTestId('template-source').selectOption('builtin')
    await expect(window.getByTestId('template-item')).toHaveCount(3)
    await window.getByTestId('template-source').selectOption('all')
    await expect(window.getByTestId('template-item')).toHaveCount(4)

    // 返回表单，把字段改坏
    await window.getByTestId('template-close').click()
    await expect(window.getByTestId('template-panel')).toHaveCount(0)
    await window.getByTestId('ceshu-field-positioning').fill('被改坏')

    // 重新打开模板库（从磁盘重载）→ 预览自定义模板 → 覆盖模式套用
    await window.getByTestId('template-picker-open').click()
    await expect(window.getByTestId('template-item')).toHaveCount(4)
    await window.getByTestId('template-item').nth(3).click()
    await expect(window.getByTestId('template-preview-rows')).toContainText('positioning: 模板快照定位')
    await window.getByTestId('template-mode').selectOption('overwrite')
    await window.getByTestId('template-apply').click()
    await window.getByTestId('template-apply-confirm').click()
    await expect(window.getByTestId('template-panel')).toHaveCount(0)
    await expect(window.getByTestId('ceshu-field-positioning')).toHaveValue('模板快照定位')

    // 保存本章 → 落盘核对
    await window.getByTestId('chapter-save').click()
    await expect.poll(() => readChapterPositioning(window, ceshuId)).toBe('模板快照定位')

    // 另存为全局模板（chapter_key 空 → global.json）
    await window.getByTestId('template-picker-open').click()
    await window.getByTestId('template-save-open').click()
    await window.getByTestId('template-save-name').fill('全局通用模板')
    await window.getByTestId('template-save-scope').selectOption('global')
    await window.getByTestId('template-save-confirm').click()
    await expect(window.getByTestId('template-notice')).toContainText('已保存为自定义模板「全局通用模板」')

    // 章节筛选 = meta 时全局模板不出现；切「全部章节」后可见（全部内置 + 2 自定义）并标注 [全局]
    await expect(window.getByTestId('template-item')).toHaveCount(4)
    await window.getByTestId('template-chapter').selectOption('')
    // 内置模板数不写死：由 `countChapterTemplates()` 派生（补模板时不必再改这里）
    await expect(window.getByTestId('template-item')).toHaveCount(countChapterTemplates() + 2)
    const globalRow = window.getByTestId('template-row').filter({ hasText: '全局通用模板' })
    await expect(globalRow.getByTestId('template-item')).toContainText('[全局] 全局通用模板')
    await expect(globalRow.getByTestId('template-badge')).toHaveText('自定义')
    expect(readCategoryFile(userDataDir, 'global')).toHaveLength(1)
    expect(readCategoryFile(userDataDir, 'global')[0]?.chapter_key).toBe('')

    // 删除全局模板（二次确认）→ 列表与磁盘同步
    await globalRow.getByTestId('template-delete').click()
    await globalRow.getByTestId('template-delete-confirm').click()
    await expect(window.getByTestId('template-notice')).toContainText('已删除自定义模板')
    await expect(window.getByTestId('template-item')).toHaveCount(countChapterTemplates() + 1)
    expect(readCategoryFile(userDataDir, 'global')).toEqual([])
    expect(readCategoryFile(userDataDir, 'meta')).toHaveLength(1)
  } finally {
    await app.close()
  }
})