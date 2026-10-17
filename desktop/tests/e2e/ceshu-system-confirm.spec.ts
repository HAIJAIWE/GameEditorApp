import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, libraryDir, waitReady } from './helpers/app'

/**
 * W32 系统依赖确认 + 数据同步 端到端验收。
 * 覆盖：
 *  - 系统确认面板渲染、勾选启用、展开字段架构预览
 *  - 新增自定义系统并随确认写回 systems 章
 *  - confirmSystems 触发 systems→data 同步（动态注册自定义类型到 type_schema）
 *  - ceshu:syncData 双向同步（data→systems 回填 actual_count）
 *  - 磁盘原子落盘核对（ceshu/<id>.json）
 */
test('系统确认：勾选启用 + 自定义系统 + 确认落盘 + 双向同步注册类型', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-confirm-e2e-'))
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
      const created = await api.ceshu.create({ name: 'W32系统确认E2E', scope: 'full' })
      return created.ceshu_id
    })) as string

    // 先读默认 systems，挑两个「未启用」的来勾选，保证可预测
    const doc0 = (await window.evaluate(async (id) => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { get: (req: { id: string }) => Promise<{ systems: Record<string, { enabled: boolean; data_type?: string }> }> } }
        }
      ).mbApi
      return api.ceshu.get({ id })
    }, createdId)) as { systems: Record<string, { enabled: boolean; data_type?: string }> }

    const allKeys = Object.keys(doc0.systems)
    expect(allKeys.length).toBeGreaterThan(2)
    const disabledKeys = allKeys.filter((k) => !doc0.systems[k].enabled)
    const [keyA, keyB] = disabledKeys
    const keyC = allKeys.find((k) => k !== keyA && k !== keyB)!
    const customName = 'tower_defense'

    // 对齐 PyQt `ceshu_controller.py:66-71`：确认对话框**没有菜单入口**，
    // 条件是「打开策划书时未确认过系统 且 已有启用系统」→ 自动弹出。
    // 新文档的 systems 全为 disabled，故先旁路启用一个（keyD），让自动弹窗条件成立。
    const keyD = allKeys.find((k) => k !== keyA && k !== keyB && k !== keyC)!
    await window.evaluate(
      async ({ id, key }) => {
        const api = (
          globalThis as unknown as {
            mbApi: {
              ceshu: {
                get: (req: { id: string }) => Promise<{ systems: Record<string, unknown> }>
                saveChapter: (req: { id: string; chapter: string; data: unknown }) => Promise<unknown>
              }
            }
          }
        ).mbApi
        const doc = await api.ceshu.get({ id })
        const systems = { ...doc.systems }
        systems[key] = { ...(systems[key] as Record<string, unknown>), enabled: true }
        await api.ceshu.saveChapter({ id, chapter: 'systems', data: systems })
      },
      { id: createdId, key: keyD }
    )

    // 文档经 IPC 旁路创建 → 重载首页列表 → 打开对应卡片 → **自动**弹出确认对话框
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: 'W32系统确认E2E' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('system-confirm-panel')).toBeVisible()
    await expect(window.getByTestId(`sys-card-${keyA}`)).toBeVisible()

    // 勾选两个内置系统
    await window.getByTestId(`sys-check-${keyA}`).click()
    await window.getByTestId(`sys-check-${keyB}`).click()
    // 勾选即自动展开字段架构（`handleToggle` 在 value=true 时 setExpanded），故此处应直接可见。
    // ⚠️ 不要在这之后再点一次 `sys-toggle-`：那是**收起**——旧断言正是多点了一次，
    // 把刚自动展开的预览又收了起来，然后期待它可见（永久红灯）。
    await expect(window.getByTestId(`sys-fields-${keyA}`)).toBeVisible()
    // 折叠/展开双向各验一次，钉住 toggle 语义
    await window.getByTestId(`sys-toggle-${keyA}`).click()
    await expect(window.getByTestId(`sys-fields-${keyA}`)).toHaveCount(0)
    await window.getByTestId(`sys-toggle-${keyA}`).click()
    await expect(window.getByTestId(`sys-fields-${keyA}`)).toBeVisible()

    // 新增自定义系统
    await window.getByTestId('sys-custom-input').fill(customName)
    await window.getByTestId('sys-add-custom').click()
    await expect(window.getByTestId(`sys-card-${customName}`)).toBeVisible()

    // 确认生成
    await window.getByTestId('sys-confirm').click()
    await expect(window.getByTestId('system-confirm-panel')).toContainText('已确认游戏系统')

    // 确认已写 `meta.system_confirmed` → 重新打开**不再**自动弹（对齐 PyQt 的一次性语义）
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: 'W32系统确认E2E' }).getByTestId('home-card-open').click()
    await expect(window.getByTestId('system-confirm-panel')).toHaveCount(0)

    // IPC 核对：勾选项启用、自定义系统写入、未勾选项保持关闭
    const doc = (await window.evaluate(async (id) => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { get: (req: { id: string }) => Promise<Record<string, unknown>> } }
        }
      ).mbApi
      return api.ceshu.get({ id })
    }, createdId)) as {
      systems: Record<string, { enabled: boolean; config?: Record<string, unknown>; data_type?: string }>
    }
    expect(doc.systems[keyA]?.enabled).toBe(true)
    expect(doc.systems[keyB]?.enabled).toBe(true)
    expect(doc.systems[customName]?.enabled).toBe(true)
    expect(doc.systems[customName]?.config?.note).toBe('自定义系统')
    expect(doc.systems[keyC]?.enabled).toBe(false)

    // systems→data 同步：自定义类型应已注册进 type_schema
    const types = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as { mbApi: { schema: { list: () => Promise<Array<{ id: string }>> } } }
      ).mbApi
      return api.schema.list()
    })) as Array<{ id: string }>
    expect(types.map((t) => t.id)).toContain(customName)

    // 双向同步：ceshu:syncData 回填 actual_count（无数据时为 0，但键应存在）
    const sync = (await window.evaluate(async (id) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              syncData: (req: { id: string }) => Promise<{
                toData: { addedTypes: string[]; ensuredKeys: string[]; errors: string[] }
                toCeshu: Record<string, number>
              }>
            }
          }
        }
      ).mbApi
      return api.ceshu.syncData({ id })
    }, createdId)) as {
      toData: { addedTypes: string[]; ensuredKeys: string[]; errors: string[] }
      toCeshu: Record<string, number>
    }
    expect(Array.isArray(sync.toData.ensuredKeys)).toBe(true)
    expect(sync.toCeshu[keyA]).toBe(0)
    expect(sync.toCeshu[customName]).toBe(0)

    // 磁盘回读：确认 systems 已原子落盘
    const onDisk = JSON.parse(
      readFileSync(join(libraryDir(userDataDir), 'ceshu', `${createdId}.json`), 'utf-8')
    ) as { systems: Record<string, { enabled: boolean; config?: Record<string, unknown> }> }
    expect(onDisk.systems[keyA]?.enabled).toBe(true)
    expect(onDisk.systems[customName]?.enabled).toBe(true)
    expect(onDisk.systems[customName]?.config?.note).toBe('自定义系统')
  } finally {
    await app.close()
  }
})
