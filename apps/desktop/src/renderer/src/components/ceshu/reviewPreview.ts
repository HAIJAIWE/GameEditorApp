/**
 * 审阅队列的内联预览工具（纯函数，便于单测）。
 *
 * 队列原先只有「章节 · 字段名」，审核人必须点「查看」跳章才知道 AI 写了什么，
 * 来回跳很累。这里把字段值压成一行短文本塞进队列行，让「扫一眼 → 接受」成立。
 */

import { translate } from '@mobai/shared/i18n'

import { getLocalePreference } from '../../localePreference'

/** 预览占位：空值统一显示，避免行内出现空白让人误以为渲染坏了 */
function emptyText(): string {
  return translate(getLocalePreference(), 'reviewPreview.empty')
}

/** 单个数组项转文本：字符串原样（不套引号），对象用紧凑 JSON，其余走 String */
function arrayItemText(item: unknown): string {
  if (typeof item === 'string') return item
  if (item === null || item === undefined) return ''
  if (typeof item === 'object') return JSON.stringify(item) ?? ''
  return String(item)
}

/** 单行化：连续空白（含换行）压成单空格 —— 预览必须只占一行 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 超长截断并加省略号；长度按字符数算（中文一个字算一个） */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 把任意字段值压成单行预览文本。
 *
 * `max` 是截断上限（省略号不计入），默认 60 字：队列行本身不宽，
 * 再多也放不下，反而挤掉右侧的「查看 / 接受」按钮。
 */
export function previewFieldValue(value: unknown, max = 60): string {
  if (value === undefined || value === null) return emptyText()
  if (typeof value === 'string') {
    const text = oneLine(value)
    return text === '' ? emptyText() : truncate(text, max)
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return emptyText()
    // 最多列两项：第三项起只会被截断，干脆用「 …」提示还有更多
    const head = value.slice(0, 2).map(arrayItemText)
    const text = head.join(' / ') + (value.length > 2 ? ' …' : '')
    return truncate(oneLine(text), max)
  }
  if (typeof value === 'object' && Object.keys(value as Record<string, unknown>).length === 0) {
    return emptyText()
  }
  // 数字 / 布尔 / 非空对象：JSON 能保住类型语义（数字不带引号、布尔是 true/false）
  const text = JSON.stringify(value) ?? ''
  return text === '' ? emptyText() : truncate(oneLine(text), max)
}

/** 普通对象判定：数组和 null 不算，点路径读到它们中间就断了 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 按点路径读字段值（如 `user_personas.primary`）。
 *
 * 中间节点不是普通对象时返回 `undefined` —— 队列预览宁可显示「（空）」，
 * 也不该在渲染期抛错把整个浮层打挂。
 */
export function readFieldValue(data: Record<string, unknown>, path: string): unknown {
  let current: unknown = data
  for (const segment of path.split('.')) {
    if (segment === '') continue
    if (!isPlainRecord(current)) return undefined
    current = current[segment]
  }
  return current
}
