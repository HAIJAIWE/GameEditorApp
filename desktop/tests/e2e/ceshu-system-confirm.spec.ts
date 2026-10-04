import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

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
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

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

    // 进入策划书视图 → 打开系统确认面板
    await window.getByTestId('mode-ceshu').click()
    await window.getByTestId('ceshu-row').filter({ hasText: 'W32系统确认E2E' }).click()
    await window.getByTestId('ceshu-system-confirm').click()
    await expect(window.getByTestId('system-confirm-panel')).toBeVisible()
    await expect(window.getByTestId(`sys-card-${keyA}`)).toBeVisible()

    // 勾选两个内置系统
    await window.getByTestId(`sys-check-${keyA}`).click()
    await window.getByTestId(`sys-check-${keyB}`).click()
    // 展开 keyA 的字段架构预览（验证 formatFieldsPreview 渲染）
    await window.getByTestId(`sys-toggle-${keyA}`).click()
    await expect(window.getByTestId(`sys-fields-${keyA}`)).toBeVisible()

    // 新增自定义系统
    await window.getByTestId('sys-custom-input').fill(customName)
    await window.getByTestId('sys-add-custom').click()
    await expect(window.getByTestId(`sys-card-${customName}`)).toBeVisible()

    // 确认生成
    await window.getByTestId('sys-confirm').click()
    await expect(window.getByTestId('system-confirm-panel')).toContainText('已确认游戏系统')

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
      readFileSync(join(userDataDir, 'ceshu', `${createdId}.json`), 'utf-8')
    ) as { systems: Record<string, { enabled: boolean; config?: Record<string, unknown> }> }
    expect(onDisk.systems[keyA]?.enabled).toBe(true)
    expect(onDisk.systems[customName]?.enabled).toBe(true)
    expect(onDisk.systems[customName]?.config?.note).toBe('自定义系统')
  } finally {
    await app.close()
  }
})
