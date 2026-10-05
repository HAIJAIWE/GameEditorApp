import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { type Page, expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

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

function readCategoryFile(userDataDir: string, category: string): StoredTemplate[] {
  const path = join(userDataDir, 'ceshu_templates', `${category}.json`)
  try {
    return (JSON.parse(readFileSync(path, 'utf-8')) as { templates: StoredTemplate[] }).templates
  } catch {
    return []
  }
}

async function readMeta(window: Page, id: string): Promise<Record<string, unknown>> {
  return window.evaluate(async (ceshuId: string) => {
    const api = (
      globalThis as unknown as {
        mbApi: { ceshu: { get: (req: { id: string }) => Promise<{ meta: Record<string, unknown> }> } }
      }
    ).mbApi
    const doc = await api.ceshu.get({ id: ceshuId })
    return doc.meta
  }, id)
}

test('模板编辑器：列表筛选 → 新建/保存 → 编辑更新 → 应用到该章节 → 删除 → 导出/导入（UI 与 IPC 全链路）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-template-editor-e2e-'))
  const filesDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-template-editor-files-'))
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
      const doc = await api.ceshu.create({ name: '模板编辑器E2E', scope: 'full' })
      return doc.ceshu_id
    })) as string

    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '模板编辑器E2E' }).getByTestId('home-card-open').click()

    // 打开编辑器：默认筛选当前章节（meta 的 3 个内置模板）
    // 「ceshu-template-editor」已收进工具栏「更多 ▸」下拉（对齐 PyQt），需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-template-editor').click()
    await expect(window.getByTestId('template-editor-panel')).toBeVisible()
    await expect(window.getByTestId('editor-item')).toHaveCount(3)
    await expect(window.getByTestId('editor-count')).toHaveText('3 个模板')
    await expect(window.getByTestId('editor-item').nth(0)).toContainText('[内置] 仙侠 RPG 项目样板  (第一章·项目元信息)')
    await expect(window.getByTestId('editor-delete')).toBeDisabled()

    // 新建：清空 + 从当前章节预填（名称自动生成）
    await window.getByTestId('editor-new').click()
    await expect(window.getByTestId('editor-name')).toHaveValue('第一章·项目元信息 模板')
    await expect(window.getByTestId('editor-data')).toHaveValue(/"game_name": "模板编辑器E2E"/)

    // 编辑并保存为自定义模板
    await window.getByTestId('editor-name').fill('E2E 编辑器模板')
    await window.getByTestId('editor-description').fill('E2E 描述')
    await window.getByTestId('editor-tags').fill('编辑器, E2E')
    await window.getByTestId('editor-source').fill('模板编辑器E2E')
    await window.getByTestId('editor-save').click()
    await expect(window.getByTestId('editor-notice')).toContainText('模板「E2E 编辑器模板」已保存。')
    await expect(window.getByTestId('editor-item')).toHaveCount(4)
    // 自定义在前、内置在后（与 Python _refresh_list 顺序一致）
    await expect(window.getByTestId('editor-item').nth(0)).toContainText('[自定义] E2E 编辑器模板  (第一章·项目元信息)')
    await expect(window.getByTestId('editor-item').nth(0)).toContainText('编辑器 · E2E')
    await expect(window.getByTestId('editor-delete')).toBeEnabled()

    // 磁盘回读
    const saved = readCategoryFile(userDataDir, 'meta')
    expect(saved).toHaveLength(1)
    expect(saved[0]?.id).toMatch(/^[0-9a-f]{12}$/)
    expect(saved[0]).toMatchObject({
      name: 'E2E 编辑器模板',
      description: 'E2E 描述',
      tags: ['编辑器', 'E2E'],
      chapter_key: 'meta',
      source_game: '模板编辑器E2E'
    })
    expect(saved[0]?.data['game_name']).toBe('模板编辑器E2E')

    // 编辑更新（同 id 不新增）
    await window.getByTestId('editor-name').fill('E2E 编辑器模板（改）')
    await window.getByTestId('editor-data').fill('{\n  "game_name": "改后游戏名"\n}')
    await window.getByTestId('editor-save').click()
    await expect(window.getByTestId('editor-notice')).toContainText('模板「E2E 编辑器模板（改）」已更新。')
    await expect(window.getByTestId('editor-item')).toHaveCount(4)
    const updatedFile = readCategoryFile(userDataDir, 'meta')
    expect(updatedFile).toHaveLength(1)
    expect(updatedFile[0]).toMatchObject({ id: saved[0]?.id, name: 'E2E 编辑器模板（改）' })
    expect(updatedFile[0]?.data).toEqual({ game_name: '改后游戏名' })

    // 应用到该章节：覆盖语义合并后直接写入文档（保留非模板字段）
    await window.getByTestId('editor-chapter').selectOption('meta')
    await window.getByTestId('editor-data').fill('{\n  "positioning": "编辑器应用定位"\n}')
    await window.getByTestId('editor-apply-current').click()
    await expect(window.getByTestId('editor-notice')).toContainText('模板数据已应用到「第一章·项目元信息」（已写入文档）')
    await expect.poll(() => readMeta(window, ceshuId)).toMatchObject({
      positioning: '编辑器应用定位',
      game_name: '模板编辑器E2E'
    })

    // 全局章节 + 非对象 JSON 的错误路径
    await window.getByTestId('editor-chapter').selectOption('')
    await window.getByTestId('editor-apply-current').click()
    await expect(window.getByTestId('editor-error')).toContainText('请选择具体章节（不能为全局）')
    await window.getByTestId('editor-chapter').selectOption('meta')
    await window.getByTestId('editor-data').fill('[1, 2]')
    await window.getByTestId('editor-apply-current').click()
    await expect(window.getByTestId('editor-error')).toContainText('数据必须是 JSON 对象')
    await window.getByTestId('editor-data').fill('{ bad')
    await window.getByTestId('editor-apply-current').click()
    await expect(window.getByTestId('editor-error')).toContainText('JSON 格式错误')

    // 筛选与搜索
    await window.getByTestId('editor-filter').selectOption('__custom__')
    await expect(window.getByTestId('editor-item')).toHaveCount(1)
    await window.getByTestId('editor-filter').selectOption('__builtin__')
    await expect(window.getByTestId('editor-item')).toHaveCount(34)
    await window.getByTestId('editor-filter').selectOption('')
    await expect(window.getByTestId('editor-item')).toHaveCount(35)
    await window.getByTestId('editor-search').fill('仙侠')
    await expect(window.getByTestId('editor-item')).toHaveCount(8)
    await window.getByTestId('editor-search').fill('zzz')
    await expect(window.getByTestId('editor-empty')).toBeVisible()
    await window.getByTestId('editor-search').fill('')

    // 内置模板选中 → 保存按钮文案为「另存为自定义」，删除不可用
    await window.getByTestId('editor-filter').selectOption('meta')
    await window.getByTestId('editor-item').nth(1).click()
    await expect(window.getByTestId('editor-save')).toContainText('另存为自定义')
    await expect(window.getByTestId('editor-delete')).toBeDisabled()

    // 删除自定义模板（二次确认）
    await window.getByTestId('editor-filter').selectOption('__custom__')
    await window.getByTestId('editor-item').nth(0).click()
    await expect(window.getByTestId('editor-save')).toContainText('保存')
    await window.getByTestId('editor-delete').click()
    await window.getByTestId('editor-delete-confirm').click()
    await expect(window.getByTestId('editor-notice')).toContainText('模板已删除。')
    await expect(window.getByTestId('editor-empty')).toBeVisible()
    expect(readCategoryFile(userDataDir, 'meta')).toEqual([])

    // 导出/导入走 IPC（原生文件对话框无法自动化）；按钮存在性另测
    await expect(window.getByTestId('editor-export')).toBeVisible()
    await expect(window.getByTestId('editor-import')).toBeVisible()
    await expect(window.getByTestId('editor-overwrite')).toBeVisible()

    const exportPath = join(filesDir, 'out', 'custom_templates')
    const exported = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              templates: {
                exportAll: (req: { path: string }) => Promise<{ filePath: string; count: number }>
              }
            }
          }
        }
      ).mbApi
      return api.ceshu.templates.exportAll({ path })
    }, exportPath)) as { filePath: string; count: number }
    expect(exported).toEqual({ filePath: `${exportPath}.json`, count: 0 })

    // 导入两条（其中一条带固定 id，便于验证重复跳过与覆盖）
    const importPath = join(filesDir, 'incoming.json')
    writeFileSync(
      importPath,
      JSON.stringify({
        templates: [
          { id: 'import000001', name: '导入模板A', chapter_key: 'meta', data: { a: 1 } },
          { name: '导入模板B', chapter_key: 'vision' }
        ]
      }),
      'utf-8'
    )
    const importOnce = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              templates: {
                importAll: (req: { path: string; overwrite: boolean }) => Promise<{ imported: number; skipped: number }>
              }
            }
          }
        }
      ).mbApi
      return api.ceshu.templates.importAll({ path, overwrite: false })
    }, importPath)) as { imported: number; skipped: number }
    expect(importOnce).toEqual({ imported: 2, skipped: 0 })
    expect(readCategoryFile(userDataDir, 'meta')).toHaveLength(1)
    expect(readCategoryFile(userDataDir, 'vision')).toHaveLength(1)

    // 再次导入：同 id 跳过（导入模板B 无 id，会生成新 id 再入一条）
    const importAgain = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              templates: {
                importAll: (req: { path: string; overwrite: boolean }) => Promise<{ imported: number; skipped: number }>
              }
            }
          }
        }
      ).mbApi
      return api.ceshu.templates.importAll({ path, overwrite: false })
    }, importPath)) as { imported: number; skipped: number }
    expect(importAgain).toEqual({ imported: 1, skipped: 1 })

    // 覆盖模式：同 id 覆盖（不重复）
    const importOverwrite = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              templates: {
                importAll: (req: { path: string; overwrite: boolean }) => Promise<{ imported: number; skipped: number }>
              }
            }
          }
        }
      ).mbApi
      return api.ceshu.templates.importAll({ path, overwrite: true })
    }, importPath)) as { imported: number; skipped: number }
    expect(importOverwrite).toEqual({ imported: 2, skipped: 0 })
    expect(readCategoryFile(userDataDir, 'meta').filter((item) => item.id === 'import000001')).toHaveLength(1)

    // 导出内容（含 _export_meta 与 _category）
    const exportedAgain = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: { templates: { exportAll: (req: { path: string }) => Promise<{ filePath: string; count: number }> } }
          }
        }
      ).mbApi
      return api.ceshu.templates.exportAll({ path })
    }, exportPath)) as { filePath: string; count: number }
    expect(exportedAgain.count).toBeGreaterThan(0)
    const payload = JSON.parse(readFileSync(exportedAgain.filePath, 'utf-8')) as {
      _export_meta: { template_count: number }
      templates: Array<Record<string, unknown>>
    }
    expect(payload._export_meta.template_count).toBe(exportedAgain.count)
    expect(payload.templates.map((item) => item['_category'])).toContain('meta')
  } finally {
    await app.close()
  }
})