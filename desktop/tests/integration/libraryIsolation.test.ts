import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LibraryManager } from '../../src/main/library/manager'
import { buildStores, type AppStores } from '../../src/main/stores'

/**
 * 库间隔离集成测试（A2-1 降级验证的补强）。
 *
 * 与单测的区别：这里用**真实 store**——真 SQLite（`mb-editor.db`）、真策划书文件、真目录布局，
 * 走的是 `main/stores.ts::buildStores()`（主进程实际使用的那一份构造代码，已从 `index.ts` 抽出
 * 以便脱离 Electron 运行）。
 *
 * 它验证的正是「A2-1 换存储地基」最需要人工确认的那件事：**数据确实按库隔离、且落在新布局下**。
 */

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'mb-library-iso-'))
}

/** 构造一批 store 并在用完后统一释放（避免 SQLite 句柄/WAL 残留） */
async function withStores<T>(libDir: string, task: (stores: AppStores) => Promise<T>): Promise<T> {
  const stores = buildStores(libDir)
  try {
    return await task(stores)
  } finally {
    stores.dataService.dispose()
  }
}

describe('库间隔离（真实 SQLite + 真实目录）', () => {
  it('数据表与策划书按库隔离；切回后各自读回自己的数据', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()
    await manager.create('项目 A')

    // 初始库：写一条角色 + 一份策划书
    await withStores(manager.activeDir(), async (stores) => {
      await stores.dataService.createItem({ type: 'role', data: { name: '初始库法师' } })
      await stores.ceshuManager.create({ scope: 'lite', name: '初始库策划书' })
    })

    // 切到项目 A：全新 store → 必须是空的（隔离）
    await manager.switch('项目 A')
    await withStores(manager.activeDir(), async (stores) => {
      expect(stores.dataService.listItems('role')).toHaveLength(0)
      expect(stores.ceshuManager.list()).toHaveLength(0)

      await stores.dataService.createItem({ type: 'role', data: { name: '项目A法师' } })
      await stores.ceshuManager.create({ scope: 'lite', name: '项目A策划书' })
    })

    // 模拟重启：新建 manager 实例（读同一注册表）→ 活跃库保持；切回初始库
    const restarted = new LibraryManager(root)
    expect(restarted.active()).toBe('项目 A')
    await restarted.switch('初始库')

    await withStores(restarted.activeDir(), async (stores) => {
      const rows = stores.dataService.listItems('role')
      expect(rows).toHaveLength(1)
      expect(rows[0]?.data['name']).toBe('初始库法师')
      expect(stores.ceshuManager.list().map((item) => item.gameName)).toEqual(['初始库策划书'])
    })

    // 再确认项目 A 那侧也还在（不是被覆盖）
    await restarted.switch('项目 A')
    await withStores(restarted.activeDir(), async (stores) => {
      expect(stores.dataService.listItems('role').map((item) => item.data['name'])).toEqual(['项目A法师'])
      expect(stores.ceshuManager.list().map((item) => item.gameName)).toEqual(['项目A策划书'])
    })
  })

  it('真实落盘位置符合新布局：libraries/<库>/ 下各有独立 db 与策划书目录', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()
    await manager.create('项目 A')

    await withStores(manager.activeDir(), async (stores) => {
      await stores.dataService.createItem({ type: 'role', data: { name: 'x' } })
    })
    await manager.switch('项目 A')
    await withStores(manager.activeDir(), async (stores) => {
      await stores.ceshuManager.create({ scope: 'lite', name: 'y' })
    })

    const initialDir = join(root, 'libraries', '初始库')
    const projectDir = join(root, 'libraries', '项目 A')
    expect(existsSync(join(initialDir, 'mb-editor.db'))).toBe(true)
    expect(existsSync(join(projectDir, 'mb-editor.db'))).toBe(true)
    // 初始库没建过策划书 → 其 ceshu 目录不应存在；项目 A 建过 → 应存在
    expect(existsSync(join(initialDir, 'ceshu'))).toBe(false)
    expect(existsSync(join(projectDir, 'ceshu'))).toBe(true)

    // 注册表落在 root 下（不是库内）
    expect(existsSync(join(root, 'libraries.json'))).toBe(true)
    expect(existsSync(join(initialDir, 'libraries.json'))).toBe(false)
  })

  it('库内 Agent 工作区随库隔离（会话文件写在 <库>/agent 下）', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()

    await withStores(manager.activeDir(), async (stores) => {
      await stores.agentSessionStore.save([{ role: 'user', content: '初始库的会话' }])
      expect(stores.agentSessionStore.sessionFilePath).toBe(
        join(root, 'libraries', '初始库', 'agent', 'active_session.json')
      )
      expect(stores.agentSessionStore.info().hasSession).toBe(true)
    })

    await manager.create('项目 A')
    await manager.switch('项目 A')
    await withStores(manager.activeDir(), async (stores) => {
      // 新库里看不到初始库的会话
      expect(stores.agentSessionStore.info().hasSession).toBe(false)
    })
  })
})
