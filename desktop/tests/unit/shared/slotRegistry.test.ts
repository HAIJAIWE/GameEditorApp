import { describe, expect, it } from 'vitest'

import {
  SlotDeclarationError,
  SlotRegistrationError,
  SlotRegistry
} from '../../../src/shared/plugin/slotRegistry'
import type { SlotSpec, UiNode } from '../../../src/shared/plugin/types'

const ui = (text: string): UiNode => ({ type: 'text', text })

const ROOT: ReadonlyArray<{ key: string; spec: SlotSpec }> = [
  { key: 'a.single', spec: { kind: 'single' } },
  { key: 'a.list', spec: { kind: 'list' } },
  { key: 'a.keyed', spec: { kind: 'keyed' } },
  { key: 'a.chain', spec: { kind: 'chain' } }
]
const registry = (): SlotRegistry => new SlotRegistry(ROOT)

describe('SlotRegistry（slot 内核）', () => {
  it('注册进未声明 slot → 抛 SlotDeclarationError', () => {
    const r = new SlotRegistry([])
    expect(() => r.register({ key: 'nope', payload: ui('x') })).toThrow(SlotDeclarationError)
  })

  it('single：低优先级胜出（遮蔽）', () => {
    const r = registry()
    r.register({ key: 'a.single', priority: 5, payload: ui('hi') })
    r.register({ key: 'a.single', priority: 1, payload: ui('lo') })
    const entries = r.entriesOfSlot('a.single')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.payload).toEqual(ui('lo'))
  })

  it('single：同优先级先注册者胜', () => {
    const r = registry()
    r.register({ key: 'a.single', payload: ui('first') })
    r.register({ key: 'a.single', payload: ui('second') })
    expect(r.entriesOfSlot('a.single')[0]?.payload).toEqual(ui('first'))
  })

  it('list：不同 id 全部渲染（按 order）；同 id 遮蔽', () => {
    const r = registry()
    r.register({ key: 'a.list', entryKey: 'x', order: 2, payload: ui('x2') })
    r.register({ key: 'a.list', entryKey: 'y', order: 1, payload: ui('y1') })
    r.register({ key: 'a.list', entryKey: 'x', order: 2, priority: -1, payload: ui('x-low') })
    expect(r.entriesOfSlot('a.list').map((entry) => entry.payload)).toEqual([ui('y1'), ui('x-low')])
  })

  it('keyed：每个分派键一条', () => {
    const r = registry()
    r.register({ key: 'a.keyed', entryKey: 'tool.a', payload: ui('A') })
    r.register({ key: 'a.keyed', entryKey: 'tool.b', payload: ui('B') })
    r.register({ key: 'a.keyed', entryKey: 'tool.a', priority: -1, payload: ui('A2') })
    const entries = r.entriesOfSlot('a.keyed')
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.payload)).toContainEqual(ui('A2'))
  })

  it('chain：按优先级选举，第一个非空胜出', () => {
    const r = registry()
    r.register({
      key: 'a.chain',
      priority: 1,
      payload: ui('p1'),
      select: (owner) => ((owner as { on: boolean }).on ? 'yes' : null)
    })
    r.register({ key: 'a.chain', priority: 2, payload: ui('p2'), select: () => 'fallback' })
    expect(r.chainWinner('a.chain', { on: true })?.matched).toBe('yes')
    expect(r.chainWinner('a.chain', { on: false })?.matched).toBe('fallback')
  })

  it('kind 约束：list 缺 entryId / keyed 缺 entryKey / chain 缺 select → 抛错', () => {
    const r = registry()
    expect(() => r.register({ key: 'a.list', payload: ui('x') })).toThrow(SlotRegistrationError)
    expect(() => r.register({ key: 'a.keyed', payload: ui('x') })).toThrow(SlotRegistrationError)
    expect(() => r.register({ key: 'a.chain', payload: ui('x') })).toThrow(SlotRegistrationError)
  })

  it('声明即认领：children 声明子 slot，重复声明抛错；disposer 递归释放', () => {
    const r = registry()
    const dispose = r.register({
      key: 'a.single',
      payload: ui('parent'),
      children: { 'a.child': { kind: 'list' } }
    })
    expect(r.isDeclared('a.child')).toBe(true)
    expect(() =>
      r.register({ key: 'a.single', payload: ui('other'), children: { 'a.child': { kind: 'single' } } })
    ).toThrow(SlotDeclarationError)

    const childDispose = r.register({ key: 'a.child', entryKey: 'c1', payload: ui('child') })
    expect(r.entriesOf('a.child')).toHaveLength(1)

    dispose() // 父条目释放 → 子 slot 的条目与声明一起塌陷
    expect(r.isDeclared('a.child')).toBe(false)
    expect(r.entriesOf('a.child')).toHaveLength(0)
    childDispose() // 幂等，无副作用
  })

  it('store seat：懒创建 + getSnapshot/subscribe/actions', () => {
    const r = registry()
    r.register({
      key: 'a.single',
      payload: ui('x'),
      store: {
        init: () => ({ n: 0 }),
        actions: { inc: (state) => ({ n: (state as { n: number }).n + 1 }) }
      }
    })
    const entry = r.entriesOf('a.single')[0]!
    expect(entry.storeInstance).toBeUndefined() // 懒创建
    const store = r.storeOf(entry)!
    expect(store.getSnapshot()).toEqual({ n: 0 })

    let calls = 0
    const unsubscribe = store.subscribe(() => {
      calls += 1
    })
    store.actions.inc()
    expect(store.getSnapshot()).toEqual({ n: 1 })
    expect(calls).toBe(1)
    unsubscribe()
    store.actions.inc()
    expect(calls).toBe(1)
  })

  it('version/subscribeKey 随注册/释放递增', () => {
    const r = registry()
    let hits = 0
    const unsubscribe = r.subscribeKey('a.single', () => {
      hits += 1
    })
    const before = r.versionOf('a.single')
    const dispose = r.register({ key: 'a.single', payload: ui('x') })
    expect(r.versionOf('a.single')).toBeGreaterThan(before)
    expect(hits).toBeGreaterThan(0)
    dispose()
    unsubscribe()
  })
})
