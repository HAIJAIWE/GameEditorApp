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

// `formatLocalTimestamp` 来自 `shared/util/`（纯工具层），不引入 agent → ceshu 的跨业务域依赖。
import { formatLocalTimestamp } from '../util/datetime'

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

/* ============================================================
   草稿（对齐 Python `ui/digital_panel_workspace.py` 的草稿保存/恢复机制）
   ============================================================ */

/** 草稿文件内容：`<userData>/agent/drafts/<名字>.json` */
export interface DraftFile {
  /** 草稿名（用户填写；也是文件名） */
  name: string
  /** 保存时间（本地时间字符串，与 `formatLocalTimestamp` 同格式） */
  time: string
  /** 会话消息（**存结构化消息，不是 HTML** —— Python 存的是 `QTextEdit.toHtml()`，TS 侧无需如此） */
  messages: Array<Record<string, unknown>>
}

/** 草稿列表项（给 UI 展示用；不含 messages，避免列表响应过大） */
export interface DraftSummary {
  name: string
  time: string
  messageCount: number
  /** 绝对路径（回填用；由主进程生成，UI 不构造） */
  path: string
}

/** 草稿列表最多返回几条（对齐 PyQt `_show_draft_menu` 的「最近草稿」上限 5） */
export const DRAFT_LIST_LIMIT = 5

/** 默认草稿名（对齐 PyQt `对话草稿_{MMdd_HHMM}`） */
export function defaultDraftName(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `对话草稿_${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`
}

/** Windows 文件名非法字符（`\ / : * ? " < > |`） */
const DRAFT_ILLEGAL_CHARS = '<>:"/\\|?*'

/**
 * 文件名安全化：草稿名会直接当文件名用。
 * - 控制字符（U+0000-U+001F、U+007F）与 Windows 非法字符替换为下划线
 * - 末尾的点/空格去掉（Windows 不允许）
 * - 空名回落 `defaultDraftName`
 *
 * **刻意保留空格与连字符**（草稿名里很常见），**不静默截断**（非法字符替换而非删字）。
 * 用显式码点判断而非正则字符类：控制字符写进字符类容易误成范围（踩过 `*-<0x1F>` 这个坑，
 * 那是反向范围，JS 解析期直接 SyntaxError）。
 */
export function safeDraftFileName(name: string, now: Date = new Date()): string {
  const cleaned = [...name]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0
      if (code < 0x20 || code === 0x7f) return '_'
      return DRAFT_ILLEGAL_CHARS.includes(char) ? '_' : char
    })
    .join('')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned === '' ? defaultDraftName(now) : cleaned
}

/** 判断未知值是否为草稿文件（容错读取用：结构不对返回 null 而不抛错） */
export function isDraftFile(value: unknown): value is DraftFile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.name === 'string' && Array.isArray(record.messages)
}

/** 组装草稿文件内容（复用会话的截断/清洗规则，保证草稿与活跃会话同构） */
export function buildDraftFile(
  name: string,
  messages: Array<Record<string, unknown>>,
  now: Date = new Date()
): DraftFile {
  const snapshot = buildSessionSnapshot(messages, now)
  return { name, time: snapshot.meta.saved_at, messages: snapshot.messages }
}

/** 草稿 → 列表项（消息数取实际条数） */
export function draftSummaryOf(draft: DraftFile, path: string): DraftSummary {
  return { name: draft.name, time: draft.time, messageCount: draft.messages.length, path }
}
