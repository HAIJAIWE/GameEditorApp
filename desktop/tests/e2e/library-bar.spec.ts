import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * A2-2 库条端到端验收：新建库 → 切换 → 数据互相隔离 → 切回原库数据仍在 → 重启保持活跃库。
 *
 * 断言数据条数走 `mbApi.data.listItems`（而不是表格 DOM），避免与表格渲染细节耦合。
 */

interface LibraryApi {
  data: {
    createItem: (req: { type: string; data: Record<string, unknown> }) => Promise<{ id: string }>
    listItems: (req: { type: string }) => Promise<unknown[]>
  }
}

/**
 * 切库 = 主进程广播 `library:changed` → App 整页 `location.reload()`（`App.tsx`）。
 *
 * 两件事必须一起做，否则测不到真东西：
 *  1. **先登记 load 事件再触发切换**。`library-active` 读的是组件里的乐观值，
 *     重载前就已经变成目标库 ⇒ 只断言文本「立刻通过」，接着 `page.evaluate` 会撞上
 *     `Execution context was destroyed`（导航中）；而没有重载这一环时，文本断言
 *     也无法证明活跃库指针真的落了盘。
 *  2. 重载后重新 `waitReady`：新档案里 UI 才刚挂载，`mbApi` 虽在 preload 就位，
 *     但库条数据要等一次 `library:list`。
 */
async function switchLibrary(window: Page, name: string): Promise<void> {
  const reloaded = window.waitForEvent('load', { timeout: 15_000 })
  await window.getByTestId('library-select').selectOption(name)
  await reloaded
  await waitReady(window)
  // 重载后的活跃库完全来自主进程（`library:list` 的 active 字段），不是乐观值
  await expect(window.getByTestId('library-active')).toHaveText(name)
}

function makeUserDataDir(tag: string): string {
  return mkdtempSync(join(tmpdir(), `mb-library-bar-${tag}-`))
}

function launch(userDataDir: string): ReturnType<typeof launchApp> {
  return launchApp(userDataDir)
}

test('库条：新建库 → 切换 → 数据互相隔离 → 切回原库数据仍在', async () => {
  const userDataDir = makeUserDataDir('switch')
  const app = await launch(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 初始库的库条状态
    await expect(window.getByTestId('library-bar')).toBeVisible()
    await expect(window.getByTestId('library-active')).toHaveText('初始库')
    // 初始库禁删
    await expect(window.getByTestId('library-remove')).toBeDisabled()

    // 初始库放一条数据
    await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: LibraryApi }).mbApi
      await api.data.createItem({ type: 'role', data: { name: '初始库法师' } })
    })

    // 新建库「项目 A」（不自动切换）
    await window.getByTestId('library-create').click()
    await window.getByTestId('library-name-input').fill('项目 A')
    await window.getByTestId('library-name-submit').click()
    await expect(window.getByTestId('library-select').locator('option', { hasText: '项目 A' })).toHaveCount(1)
    await expect(window.getByTestId('library-active')).toHaveText('初始库')

    // 切到项目 A → 整页重载 → 数据为空（库间隔离）
    await switchLibrary(window, '项目 A')
    const inProjectA = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: LibraryApi }).mbApi
      return api.data.listItems({ type: 'role' })
    })) as unknown[]
    expect(inProjectA).toHaveLength(0)

    // 在项目 A 里建一条，避免「空库看不出隔离」
    await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: LibraryApi }).mbApi
      await api.data.createItem({ type: 'role', data: { name: '项目 A 法师' } })
    })

    // 切回初始库 → 数据仍是原来那条
    await switchLibrary(window, '初始库')
    const backToInitial = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: LibraryApi }).mbApi
      return api.data.listItems({ type: 'role' })
    })) as Array<{ data: { name: string } }>
    expect(backToInitial).toHaveLength(1)
    expect(backToInitial[0]?.data.name).toBe('初始库法师')
  } finally {
    await app.close()
  }
})

test('库条：重启后保持上次的活跃库', async () => {
  const userDataDir = makeUserDataDir('persist')
  const first = await launch(userDataDir)
  try {
    const window = await first.firstWindow()
    await expect(window.getByTestId('library-bar')).toBeVisible()
    await window.getByTestId('library-create').click()
    await window.getByTestId('library-name-input').fill('重启库')
    await window.getByTestId('library-name-submit').click()
    await switchLibrary(window, '重启库')
  } finally {
    await first.close()
  }

  const second = await launch(userDataDir)
  try {
    const window = await second.firstWindow()
    await expect(window.getByTestId('library-active')).toHaveText('重启库', { timeout: 15_000 })
  } finally {
    await second.close()
  }
})

test('库条：非法库名被主进程拒绝并展示中文错误', async () => {
  const userDataDir = makeUserDataDir('invalid')
  const app = await launch(userDataDir)
  try {
    const window = await app.firstWindow()
    await expect(window.getByTestId('library-bar')).toBeVisible()
    await window.getByTestId('library-create').click()
    // 含路径分隔符 → 主进程拒绝（渲染层只做非空/长度预检）
    await window.getByTestId('library-name-input').fill('a/b')
    await window.getByTestId('library-name-submit').click()
    await expect(window.getByTestId('library-error')).toContainText('不能包含')
  } finally {
    await app.close()
  }
})
