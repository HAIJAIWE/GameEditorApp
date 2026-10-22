/**
 * 「当前选中字段」跨组件桥（中间编辑器 ↔ 右侧 AI 停靠栏）。
 *
 * ## 为什么不用 React Context
 * `ChapterForm`（中间编辑器）与 `FieldActionStrip`（右侧停靠栏）在组件树上相距很远，
 * 且停靠栏（DigitalPanel）是自包含面板、不接收业务 prop。用一个模块级微存储
 * （订阅 + 不可变快照）让两边通过 `useSyncExternalStore` 各自读取，避免为了传一个
 * 字段 key 把整条 prop 链打通。
 *
 * ## 两段状态
 * - `active`：当前聚焦的字段（ChapterForm 在字段获得焦点时写入；卸载时清理）；
 * - `request`：停靠栏发起、等待 ChapterForm 执行的局部重生成请求（带 nonce，
 *   同一动作重复点击也会各自触发一次）。
 */

import { useSyncExternalStore } from 'react'

import type { ChapterKey } from '../../shared/ceshuConstants'
import type { FieldReviewStatus } from '../../shared/ceshuFieldStatus'
import type { FieldAction } from '../../shared/ceshuFieldAction'

export interface ActiveCeshuField {
  chapter: ChapterKey
  /** 字段 key（支持点路径，如 user_personas.primary） */
  key: string
  label: string
  /** 该字段当前的审核状态（来自 meta.field_status）；无记录为 undefined */
  status?: FieldReviewStatus
  /** 每次聚焦递增，供 UI 区分「重新聚焦同一字段」 */
  nonce: number
}

export interface FieldActionRequest {
  chapter: ChapterKey
  key: string
  action: FieldAction
  /** 每次发起递增：effect 依赖 request 对象 identity，靠 nonce 保证重复点击不丢 */
  nonce: number
}

interface FieldFocusState {
  active: ActiveCeshuField | null
  /** active 字段是否正在 AI 生成（停靠栏据此禁用按钮） */
  busy: boolean
  request: FieldActionRequest | null
}

let state: FieldFocusState = { active: null, busy: false, request: null }
let nonce = 0
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): FieldFocusState {
  return state
}

/** 订阅「当前字段」全量状态（停靠栏用） */
export function useCeshuFieldFocus(): FieldFocusState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** 非 hook 的当前状态读取（测试 / 一次性断言用；组件里请用 useCeshuFieldFocus） */
export function getCeshuFieldFocus(): FieldFocusState {
  return state
}

/**
 * 订阅「局部重生成请求」：仅在 request 出现时触发一次（ChapterForm 用）。
 *
 * 为什么不用 effect 订阅 `request` 状态：effect 体内同步 setState 会触发
 * 「cascading renders」（react-hooks/set-state-in-effect）。而「订阅外部系统、
 * 在回调里 setState」正是 effect 的合规用法 —— 请求由停靠栏点击产生，
 * 本质就是一次外部事件，走订阅回调而非渲染态派生。
 */
export function subscribeFieldRequest(listener: (request: FieldActionRequest) => void): () => void {
  const wrapped = (): void => {
    const request = state.request
    if (request === null) return
    listener(request)
  }
  listeners.add(wrapped)
  return () => {
    listeners.delete(wrapped)
  }
}

/** 字段获得焦点：更新当前字段（同一字段重复聚焦也刷新 nonce，UI 可据此复位） */
export function setActiveCeshuField(field: {
  chapter: ChapterKey
  key: string
  label: string
  status?: FieldReviewStatus
}): void {
  nonce += 1
  state = {
    ...state,
    active: { ...field, nonce },
    // 换字段时旧的进行中状态不再适用于新字段
    busy: false
  }
  for (const listener of listeners) listener()
}

/** 表单卸载 / 切换章节：清理当前字段（仅当没有进行中的请求时保留请求，避免丢失点击） */
export function clearActiveCeshuField(): void {
  if (state.active === null && !state.busy) return
  state = { ...state, active: null, busy: false }
  for (const listener of listeners) listener()
}

/** 标记当前字段的 AI 生成进行中（停靠栏禁用按钮 + 显示状态） */
export function setCeshuFieldBusy(busy: boolean): void {
  if (state.busy === busy) return
  state = { ...state, busy }
  for (const listener of listeners) listener()
}

/** 停靠栏发起局部重生成请求 */
export function requestFieldAction(action: FieldAction): void {
  if (state.active === null) return
  nonce += 1
  state = {
    ...state,
    request: { chapter: state.active.chapter, key: state.active.key, action, nonce }
  }
  for (const listener of listeners) listener()
}

/** ChapterForm 取走并清空请求（执行前调用；同步清空避免重复执行） */
export function consumeFieldRequest(): FieldActionRequest | null {
  const request = state.request
  if (request === null) return null
  state = { ...state, request: null }
  for (const listener of listeners) listener()
  return request
}

/** 丢弃未执行的请求（章节切换时的兜底，避免请求落到不匹配的表单上烂掉） */
export function clearFieldRequest(): void {
  if (state.request === null) return
  state = { ...state, request: null }
  for (const listener of listeners) listener()
}

/** 测试专用：重置到初始状态 */
export function resetCeshuFieldFocusForTest(): void {
  nonce = 0
  state = { active: null, busy: false, request: null }
  for (const listener of listeners) listener()
}
