/**
 * Agent 会话快照纯逻辑（自 旧版 `core/agent/brain_session` 的 `_save_session` /
 * `_try_restore_session` 匹平迁移，A1-3）。
 *
 * 只放可单测的纯映射：**超长内容截断规则**与**快照结构**。落盘（原子写 + 串行队列）在
 * `main/agent/sessionStore.ts`。
 *
 * 有意偏离 旧版：旧版 的 `_save_session` 把「截断规则」内联在闭包里、
 * 「只留最后 50 条」硬编码在切片里，这里提出来做常量并单测锁定。
 */

// `formatLocalTimestamp` 来自 `shared/util/`（纯工具层），不引入 agent → ceshu 的跨业务域依赖。
import { formatLocalTimestamp } from '../util/datetime'

/** 只保留最近 N 条消息 */
export const SESSION_MAX_MESSAGES = 50

/** 单条 content 的截断上限 */
export const SESSION_CONTENT_LIMIT = 2000

export interface SessionSnapshot {
  meta: {
    saved_at: string
    timestamp: number
    /** 保存时的**全量**消息条数 */
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
 * 单条消息截断：
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

/** 由快照生成给 UI/调用方看的信息摘要 */
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
   草稿
   ============================================================ */

/** 草稿文件内容：`<userData>/agent/drafts/<名字>.json` */
export interface DraftFile {
  /** 草稿名（用户填写；也是文件名） */
  name: string
  /** 保存时间（本地时间字符串，与 `formatLocalTimestamp` 同格式） */
  time: string
  /** 会话消息 */
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

/** 草稿列表最多返回几条 */
export const DRAFT_LIST_LIMIT = 5

/** 默认草稿名 */
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

/**
 * 从「轮次日志」派生完整会话消息（Slice 34，事件溯源）。
 *
 * 输入是 `appendTurn` 落盘的记录 `{ messages: Array<Record<string, unknown>> }`（按时间顺序）。
 * 输出是拼接后的**非 system** 消息——system 提示词由每次运行重新生成，不进历史。
 *
 * 与 `deriveTranscript` 的区别：后者是给人看的**轨迹**；本函数重建的是**可回灌给循环的消息**。
 */
export function deriveMessagesFromTurns(
  turns: readonly { messages?: unknown }[]
): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const turn of turns) {
    if (!Array.isArray(turn.messages)) continue
    for (const raw of turn.messages) {
      if (raw === null || typeof raw !== 'object') continue
      const message = raw as Record<string, unknown>
      if (message.role === 'system') continue
      out.push(message)
    }
  }
  return out
}

/**
 * 从事件日志派生**可读轨迹**（回放用，Slice 32）。
 *
 * 输入是 `recordEvents` 落盘的 run 记录（`{ events: BrainEvent[] }`）。
 * 输出是人能读的时间线：工具调用 / 最终答复 / 中止 / 轮次。
 *
 * 注意：这是**轨迹**，不是可恢复的消息历史——恢复仍走 `save()` 快照；
 * 要从事件日志**派生完整历史**需要把 user/system/assistant 消息也记成事件（未做）。
 */
export function deriveTranscript(runs: readonly { events?: unknown }[]): string {
  const lines: string[] = []
  for (const run of runs) {
    const events = Array.isArray(run.events) ? (run.events as unknown[]) : []
    for (const raw of events) {
      if (raw === null || typeof raw !== 'object') continue
      const event = raw as {
        type?: string
        tool?: string
        result?: string
        text?: string
        turn?: number
        reason?: string
      }
      switch (event.type) {
        case 'step_done':
          lines.push(`- 工具 ${event.tool ?? '?'}：${event.result ?? ''}`)
          break
        case 'done':
          lines.push(`- 最终答复：${event.text ?? ''}`)
          break
        case 'terminated':
          lines.push(`- 中止（${event.reason ?? '未知'}）`)
          break
        case 'turn_stats':
          lines.push(`- 第 ${(event.turn ?? 0) + 1} 轮`)
          break
      }
    }
  }
  return lines.join('\n')
}
