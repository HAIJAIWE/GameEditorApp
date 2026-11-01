import { describe, expect, it } from 'vitest'

import {
  MAIN_VIEW_STORE_KEY,
  createMainViewStoreDecl,
  initialMainViewState
} from '@mobai/shared/plugin/mainViewStore'
import { PluginHost } from '@mobai/shared/plugin/host'
import { createStoreInstance } from '@mobai/shared/plugin/slotRegistry'

/**
 * 主区页签 store + 宿主 `openMainView` 入口。
 *
 * 锁两件事：① 激活态是**根级 store**（外部可写、可订阅）；
 * ② 未声明 store 时 `openMainView` 返回 false 而不是静默成功（调用方能区分「切了」与「没装」）。
 */

describe('mainViewStore', () => {
  it('初始态为空 id（未初始化），由挂载器按持久化补齐', () => {
    expect(initialMainViewState()).toEqual({ activeId: '' })
    const store = createStoreInstance(createMainViewStoreDecl())
    expect(store.getSnapshot()).toEqual({ activeId: '' })
  })

  it('activate 切换激活页签并通知订阅者', () => {
    const store = createStoreInstance(createMainViewStoreDecl())
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })

    store.actions.activate('data')
    expect(store.getSnapshot().activeId).toBe('data')
    expect(calls).toBe(1)
  })

  it('重复 activate 同一 id 不产生新快照（uSES 不会白重渲染）', () => {
    const store = createStoreInstance(createMainViewStoreDecl())
    store.actions.activate('code')
    const before = store.getSnapshot()
    store.actions.activate('code')
    // action 返回 undefined ⇒ 状态引用不变；createStore 只是照样通知，快照仍同一对象
    expect(store.getSnapshot()).toBe(before)
  })

  it('reset 回到未初始化', () => {
    const store = createStoreInstance(createMainViewStoreDecl())
    store.actions.activate('browser')
    store.actions.reset()
    expect(store.getSnapshot().activeId).toBe('')
  })
})

describe('PluginHost.openMainView', () => {
  it('store 未声明时返回 false（调用方能区分「没装」与「切了」）', () => {
    const host = new PluginHost()
    expect(host.openMainView('data')).toBe(false)
    expect(host.mainViewActive()).toBe('')
  })

  it('声明 store 后可切页，mainViewActive 读到最新值', () => {
    const host = new PluginHost()
    host.declareStore(MAIN_VIEW_STORE_KEY, createMainViewStoreDecl())

    expect(host.openMainView('data')).toBe(true)
    expect(host.mainViewActive()).toBe('data')

    // 不校验 id：页签清单是派生的，无效 id 由 MainViewMount 回落首个页签
    expect(host.openMainView('not-exist')).toBe(true)
    expect(host.mainViewActive()).toBe('not-exist')
  })
})
