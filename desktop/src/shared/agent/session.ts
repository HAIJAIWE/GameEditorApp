/**
 * Agent 会话快照纯逻辑（自 Python `core/agent/brain_session.py` 的 `_save_session` /
 * `_try_restore_session` 匹平迁移，A1-3）。
 *
 * 只放可单测的纯映射：**超长内容截断规则**与**快照结构**。落盘（原子写 + 串行队列）在
 * `main/agent/sessionStore.ts`。
 *
 * 有意偏离 Python：Python 的 `_save_session` 把「截断规则」内联在闭包里、
 * 「只留最后 50 条」硬编码在切片里，这里提出来做常量并单测锁定。
 */

import { formatLocalTimestamp } from '../ceshuModel'

/** 只保留最近 N 条消息（对齐 Python `messages[-50:]`） */
export const SESSION_MAX_MESSAGES = 50

/** 单条 content 的截断上限（对齐 Python `len(v) > 2000`） */
export const SESSION_CONTENT_LIMIT = 2000

export interface SessionSnapshot {
  meta: {
    saved_at: string
    timestamp: number
    /** 保存时的**全量**消息条数（截断前，对齐 Python `len(messages)`） */
    message_count: number
  }
  /** 已截断的超长内容 */
  messages: Array<Record<string, unknown>>
}

export interface SessionInfo {
  hasSession: boolean
  messageCount: number
  savedAt: string
}

/**
 * 单条消息截断（对齐 Python `_truncate`）：
 * 仅当 `content` 是字符串且超长时截断，并追加 `[...截断 N 字符...]` 标记（**截断而非丢弃**，
 * 以免会话恢复时丢失上下文角色）。其它键原样保留。
 */
export function truncateSessionMessage(
  message: Record<string, unknown>,
  limit: number = SESSION_CONTENT_LIMIT
): Record<string, unknown> {
  const content = message.content
  if (typeof content !== 'string' || content.length <= limit) {
    return { ...message }
  }
  return { ...message, content: `${content.slice(0, limit)}\n[...截断 ${content.length - limit} 字符...]` }
}

/** 构造会话快照：meta（保存时间/全量条数）+ 最近 N 条（逐条截断） */
export function buildSessionSnapshot(
  messages: Array<Record<string, unknown>>,
  now: Date = new Date()
): SessionSnapshot {
  return {
    meta: {
      saved_at: formatLocalTimestamp(now),
      timestamp: Math.floor(now.getTime() / 1000),
      message_count: messages.length
    },
    messages: messages
      .slice(-SESSION_MAX_MESSAGES)
      .map((message) => truncateSessionMessage(message))
  }
}

/** 判断未知值是否为会话快照（容错读取用：结构不对视为无会话） */
export function isSessionSnapshot(value: unknown): value is SessionSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.meta !== null && typeof record.meta === 'object' && Array.isArray(record.messages)
}

/** 由快照生成给 UI/调用方看的信息摘要（对齐 Python `get_pending_session_info`） */
export function sessionInfoFromSnapshot(snapshot: SessionSnapshot | null): SessionInfo {
  if (snapshot === null) return { hasSession: false, messageCount: 0, savedAt: '' }
  const savedAt = snapshot.meta.saved_at
  return {
    hasSession: snapshot.messages.length > 0,
    messageCount: snapshot.messages.length,
    savedAt: typeof savedAt === 'string' ? savedAt : ''
  }
}
