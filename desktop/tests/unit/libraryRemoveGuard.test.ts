import { describe, expect, it } from 'vitest'

import { libraryRemoveInputSchema } from '../../src/shared/schemas'
import { registerLibraryIpc } from '../../src/main/ipc/libraryIpc'

/**
 * `library:remove` 契约层 confirm 守卫。
 *
 * ## 为什么这条必须有测试（铁律：安全字段要有用例证明「它真的在拦」）
 * 删除整库是本应用**最破坏性**的动作：`rmSync(dir, {recursive, force})` 抹掉该库全部
 * 策划书 / 数据 / 图片，且**不进撤销栈**（撤销只覆盖数据条目）。此前该通道既无契约层
 * `confirm`、渲染层点一下就直接删 ⇒ 误点一次即永久丢失整个库。
 *
 * 本测试从两层各钉一针：
 * 1. **schema 层**：缺 `confirm` 的请求直接解析失败（漏传编译期/运行期就红）；
 * 2. **handler 层**：即使绕过 schema 直接调 handler，`confirm !== true` 仍抛错、
 *    **且绝不会调用 libraryManager.remove**（证明守卫在真删之前拦下）。
 */

type Handler = (req: unknown, event?: unknown) => unknown

function collectHandlers(removeCalls: string[]): Map<string, Handler> {
  const map = new Map<string, Handler>()
  // deps 只用到 libraryManager.remove 与 onSwitchLibrary；这里给最小桩
  const libraryManager = {
    list: () => [],
    active: () => '初始库',
    create: () => ({}),
    rename: async () => undefined,
    remove: async (name: string) => {
      removeCalls.push(name)
      return { switchedTo: '初始库' }
    }
  }
  const handle = (channel: string, _schema: unknown, fn: Handler): void => {
    map.set(channel, fn)
  }
  registerLibraryIpc({ libraryManager, onSwitchLibrary: async () => undefined } as never, handle as never)
  return map
}

describe('library:remove 契约层 confirm 守卫', () => {
  it('schema：缺 confirm ⇒ 解析失败（调用点漏传立即红）', () => {
    const result = libraryRemoveInputSchema.safeParse({ name: '项目 A' })
    expect(result.success).toBe(false)
  })

  it('schema：confirm 为 false ⇒ 解析通过但 handler 必须拒绝', () => {
    // schema 只保证「有这个键且是布尔」，真假由 handler 判定
    const parsed = libraryRemoveInputSchema.safeParse({ name: '项目 A', confirm: false })
    expect(parsed.success).toBe(true)
  })

  it('handler：confirm 非 true ⇒ 抛错且绝不调用 remove（真删前拦下）', async () => {
    const calls: string[] = []
    const handlers = collectHandlers(calls)
    const remove = handlers.get('library:remove')!
    await expect(async () => remove({ name: '项目 A', confirm: false })).rejects.toThrow('删除游戏库需要确认')
    expect(calls).toEqual([])
  })

  it('handler：缺 confirm（绕过 schema）⇒ 同样抛错，不落到删除', async () => {
    const calls: string[] = []
    const handlers = collectHandlers(calls)
    const remove = handlers.get('library:remove')!
    await expect(async () => remove({ name: '项目 A' })).rejects.toThrow('删除游戏库需要确认')
    expect(calls).toEqual([])
  })

  it('handler：confirm:true ⇒ 放行并调用 remove（守卫不误伤正常路径）', async () => {
    const calls: string[] = []
    const handlers = collectHandlers(calls)
    const remove = handlers.get('library:remove')!
    await remove({ name: '项目 A', confirm: true })
    expect(calls).toEqual(['项目 A'])
  })
})