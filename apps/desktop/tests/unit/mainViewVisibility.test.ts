import { afterEach, describe, expect, it } from 'vitest'

import {
  GAME_DATA_VIEW_ID,
  getHiddenMainViewIds,
  hiddenMainViewIdsForDocKind,
  setHiddenMainViewIds,
  subscribeHiddenMainViewIds
} from '../../src/renderer/src/plugins/context'

/** 测试间隔离：把模块级快照复位，避免串味 */
afterEach(() => {
  setHiddenMainViewIds([])
})

describe('主区页签可见性规则', () => {
  it('只有显式 application 才隐藏数据编辑；game / undefined 零变化', () => {
    expect(GAME_DATA_VIEW_ID).toBe('data.mainView')
    expect(hiddenMainViewIdsForDocKind('application')).toEqual(['data.mainView'])
    expect(hiddenMainViewIdsForDocKind('game')).toEqual([])
    expect(hiddenMainViewIdsForDocKind(undefined)).toEqual([])
  })
})

describe('隐藏清单通道（供命令面板订阅）', () => {
  it('写入后可读，订阅者收到通知', () => {
    let notified = 0
    const unsubscribe = subscribeHiddenMainViewIds(() => {
      notified += 1
    })
    setHiddenMainViewIds(['data.mainView'])
    expect([...getHiddenMainViewIds()]).toEqual(['data.mainView'])
    expect(notified).toBe(1)
    unsubscribe()
  })

  it('内容相同不换快照、不通知（满足 uSES 稳定快照要求）', () => {
    setHiddenMainViewIds(['data.mainView'])
    const before = getHiddenMainViewIds()
    let notified = 0
    const unsubscribe = subscribeHiddenMainViewIds(() => {
      notified += 1
    })
    setHiddenMainViewIds(['data.mainView'])
    expect(getHiddenMainViewIds()).toBe(before)
    expect(notified).toBe(0)
    unsubscribe()
  })

  it('取消订阅后不再收到通知', () => {
    let notified = 0
    const unsubscribe = subscribeHiddenMainViewIds(() => {
      notified += 1
    })
    unsubscribe()
    setHiddenMainViewIds(['data.mainView'])
    expect(notified).toBe(0)
  })
})
