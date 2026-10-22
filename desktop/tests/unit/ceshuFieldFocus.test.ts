import { afterEach, describe, expect, it } from 'vitest'

import {
  clearActiveCeshuField,
  clearFieldRequest,
  consumeFieldRequest,
  requestFieldAction,
  resetCeshuFieldFocusForTest,
  setActiveCeshuField,
  setCeshuFieldBusy,
  getCeshuFieldFocus
} from '../../src/renderer/src/ceshuFieldFocus'

afterEach(() => {
  resetCeshuFieldFocusForTest()
})

describe('ceshuFieldFocus：当前字段桥（编辑器 ↔ 停靠栏）', () => {
  it('初始态：无选中字段、无请求、非忙碌', () => {
    expect(getCeshuFieldFocus()).toEqual({ active: null, busy: false, request: null })
  })

  it('聚焦字段写入 active；重复聚焦同一字段也刷新 nonce', () => {
    setActiveCeshuField({ chapter: 'story', key: 'main_plot', label: '主线剧情' })
    const first = getCeshuFieldFocus().active
    expect(first).toMatchObject({ chapter: 'story', key: 'main_plot', label: '主线剧情' })
    expect(first?.status).toBeUndefined()

    setActiveCeshuField({ chapter: 'story', key: 'main_plot', label: '主线剧情' })
    const second = getCeshuFieldFocus().active
    expect(second?.nonce).toBe((first?.nonce ?? 0) + 1)
  })

  it('active 带审核状态（停靠栏徽标用）', () => {
    setActiveCeshuField({ chapter: 'meta', key: 'positioning', label: '一句话定位', status: 'ai_draft' })
    expect(getCeshuFieldFocus().active?.status).toBe('ai_draft')
  })

  it('忙碌态：去重相同值；换字段聚焦时自动复位', () => {
    setActiveCeshuField({ chapter: 'meta', key: 'positioning', label: '一句话定位' })
    setCeshuFieldBusy(true)
    expect(getCeshuFieldFocus().busy).toBe(true)
    setCeshuFieldBusy(true)
    expect(getCeshuFieldFocus().busy).toBe(true)
    // 聚焦另一个字段：旧的进行中状态不再适用
    setActiveCeshuField({ chapter: 'meta', key: 'tags', label: '特色标签' })
    expect(getCeshuFieldFocus().busy).toBe(false)
  })

  it('停靠栏发起请求：带 chapter/key/action/nonce；无选中字段时忽略', () => {
    requestFieldAction('rewrite')
    expect(getCeshuFieldFocus().request).toBeNull()

    setActiveCeshuField({ chapter: 'story', key: 'main_plot', label: '主线剧情' })
    requestFieldAction('expand')
    const request = getCeshuFieldFocus().request
    expect(request).toMatchObject({ chapter: 'story', key: 'main_plot', action: 'expand' })

    // 同一动作重复点击：nonce 递增，两次都该被执行（不因对象相同被 effect 吞掉）
    consumeFieldRequest()
    requestFieldAction('expand')
    expect(getCeshuFieldFocus().request?.nonce).toBe((request?.nonce ?? 0) + 1)
  })

  it('consumeFieldRequest：取走并清空；重复调用返回 null', () => {
    setActiveCeshuField({ chapter: 'meta', key: 'positioning', label: '一句话定位' })
    requestFieldAction('condense')
    expect(consumeFieldRequest()?.action).toBe('condense')
    expect(getCeshuFieldFocus().request).toBeNull()
    expect(consumeFieldRequest()).toBeNull()
  })

  it('clearFieldRequest：丢弃未执行请求（切章兜底），不动 active', () => {
    setActiveCeshuField({ chapter: 'meta', key: 'positioning', label: '一句话定位' })
    requestFieldAction('explain')
    clearFieldRequest()
    expect(getCeshuFieldFocus().request).toBeNull()
    expect(getCeshuFieldFocus().active?.key).toBe('positioning')
  })

  it('clearActiveCeshuField：清 active 与 busy；重复调用无副作用', () => {
    setActiveCeshuField({ chapter: 'meta', key: 'positioning', label: '一句话定位' })
    setCeshuFieldBusy(true)
    clearActiveCeshuField()
    expect(getCeshuFieldFocus().active).toBeNull()
    expect(getCeshuFieldFocus().busy).toBe(false)
    clearActiveCeshuField()
    expect(getCeshuFieldFocus().active).toBeNull()
  })
})
