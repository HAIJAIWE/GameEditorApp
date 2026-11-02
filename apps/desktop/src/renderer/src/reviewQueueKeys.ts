/**
 * 审阅队列键盘快捷键的纯解析（供 CeshuView 的 keydown 监听与单测共用）。
 *
 * ## 为什么限定在队列浮层打开时
 * 字母键（j/k/a/v）在表单密集的界面里**绝不能全局生效**——会在用户打字时偷输入。
 * 本模块只回答「这个键当不当成快捷键、是什么动作」，生效范围由调用方
 * （浮层打开 + 焦点不在可编辑元素）把关。
 *
 * ## 键位（对齐常见审阅工具的心智）
 * - j / ↓ 下一条；k / ↑ 上一条；
 * - a 接受当前条（approve）；v 查看并跳到该字段所在章；
 * - Esc 关闭浮层。
 */

import { translate } from '@mobai/shared/i18n'

import { getLocalePreference } from './localePreference'

export type ReviewQueueAction = 'next' | 'prev' | 'accept' | 'goto' | 'close'

export interface ReviewQueueKeyInput {
  key: string
  /** 组合键一律放行（Ctrl/Cmd+R 刷新、Ctrl+A 全选等不是我们的快捷键） */
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  /** 焦点是否在可编辑元素（输入框/文本域/下拉/contenteditable） */
  editable?: boolean
  /** 当前队列长度（为 0 时只认 Esc） */
  queueLength: number
}

const KEY_MAP: Record<string, ReviewQueueAction> = {
  j: 'next',
  arrowdown: 'next',
  k: 'prev',
  arrowup: 'prev',
  a: 'accept',
  v: 'goto',
  escape: 'close'
}

/** 解析一次按键 → 队列动作；不是快捷键（或不该响应）返回 null */
export function resolveReviewQueueKey(input: ReviewQueueKeyInput): ReviewQueueAction | null {
  if (input.ctrlKey === true || input.metaKey === true || input.altKey === true) return null
  if (input.editable === true) return null
  const action = KEY_MAP[input.key.toLowerCase()]
  if (action === undefined) return null
  // 空队列时只有「关闭」有意义（其余动作没有作用对象）
  if (input.queueLength === 0 && action !== 'close') return null
  return action
}

/** 快捷键提示文案（面板底部展示；与 KEY_MAP 同源，避免漂移） */
export function reviewQueueKeyHint(): string {
  return translate(getLocalePreference(), 'reviewQueue.keyHint')
}
