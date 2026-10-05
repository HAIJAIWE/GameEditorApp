import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/**
 * 通用撤销/重做 E2E（迁移收尾第三项）。
 *
 * 用 `window.evaluate` 直调 `mbApi.data.undo()/redo()/undoState()`（先例 data-io.spec.ts 的 cast 写法），
 * 再用 `listItems` 断言数据往返；键盘路径用 `page.keyboard.press('Control+z' / 'Control+y')` 覆盖。
 * 种子数据落在 `MB_USER_DATA_DIR` 临时目录（先例 data-batch.spec.ts）。
 */
test('通用撤销/重做：创建→撤销→重做（evaluate + 键盘）往返一致', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-undo-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 直调 IPC 创建一条角色（绕开 UI 时序）
    const id = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { createItem: (req: { type: string; data: Record<string, unknown> }) => Promise<{ id: string }> } }
        }
      ).mbApi
      const created = await api.data.createItem({ type: 'role', data: { name: '撤销往返' } })
      return created.id
    })
    expect(id).toBeTruthy()

    // 撤销（evaluate 直调）→ 项消失
    const undoRes = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              undo: () => Promise<{ applied: number; canUndo: boolean; canRedo: boolean }>
              listItems: (req: { type: string }) => Promise<Array<{ id: string }>>
            }
          }
        }
      ).mbApi
      const res = await api.data.undo()
      const list = await api.data.listItems({ type: 'role' })
      return { res, remaining: list.length }
    })
    expect(undoRes.res.applied).toBe(1)
    expect(undoRes.remaining).toBe(0)

    // 重做（evaluate 直调）→ 项回来
    const redoRes = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              redo: () => Promise<{ applied: number; canUndo: boolean; canRedo: boolean }>
              listItems: (req: { type: string }) => Promise<Array<{ id: string }>>
            }
          }
        }
      ).mbApi
      const res = await api.data.redo()
      const list = await api.data.listItems({ type: 'role' })
      return { res, remaining: list.length }
    })
    expect(redoRes.res.applied).toBe(1)
    expect(redoRes.remaining).toBe(1)

    // 键盘路径：Control+z 撤销 → 项消失；Control+y 重做 → 项回来
    await window.keyboard.press('Control+z')
    const afterUndo = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as { mbApi: { data: { listItems: (req: { type: string }) => Promise<Array<{ id: string }>> } } }
      ).mbApi
      return (await api.data.listItems({ type: 'role' })).length
    })
    expect(afterUndo).toBe(0)

    await window.keyboard.press('Control+y')
    const afterRedo = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as { mbApi: { data: { listItems: (req: { type: string }) => Promise<Array<{ id: string }>> } } }
      ).mbApi
      return (await api.data.listItems({ type: 'role' })).length
    })
    expect(afterRedo).toBe(1)

    // 状态接口：撤销后应可重做
    const state = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { undoState: () => Promise<{ canUndo: boolean; canRedo: boolean }> } }
        }
      ).mbApi
      return api.data.undoState()
    })
    expect(state.canUndo).toBe(true)
    expect(state.canRedo).toBe(false)
  } finally {
    await app.close()
  }
})
