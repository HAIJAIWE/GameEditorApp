/**
 * 一键生成「未应用结果」的草稿快照（2026-11-11）。
 *
 * 背景：AiFullGeneratePanel 的一键生成把每章结果只放在 React 内存
 * （resultsRef / setResults），窗口意外关闭 ⇒ 整轮约 30 分钟的生成白跑。
 * 用户要求「修生成结果不落盘」。
 *
 * 设计决策：**不**自动写进策划书正文。那会绕过用户要的「人工确认后再生成 / 应用」
 * 语义，把未经审阅的 AI 文案当既定事实落库。这里只做一份按 ceshuId 隔离的
 * 草稿快照：重开面板时由 UI 展示「恢复上次未应用结果」横幅，用户点恢复才回填；
 * 「全部应用并保存」成功后再 clear。
 *
 * 为什么全部函数「永不抛错」：localStorage 在隐私模式 / 配额超限 / 被策略禁用时，
 * getItem / setItem / removeItem 都会抛异常，而这是每章结果都要走的高频旁路。
 * 一次落盘失败绝不能打断整轮生成，也不能反噬「保存成功」，故一律降级为
 * false / null / void。
 *
 * 为什么 storage 可注入：vitest 的 node 环境没有 jsdom，注入最小假实现即可验证；
 * 也让「setItem 抛 QuotaExceededError」这类分支变得可测。
 */

export const AI_FULL_DRAFT_VERSION = 1

export interface AiFullDraft {
  version: 1
  ceshuId: string
  savedAt: number
  stage: string
  scope: string
  briefConfirmed: boolean
  results: Record<string, Record<string, unknown>>
  statuses: Record<string, 'pending' | 'running' | 'done' | 'failed'>
  errors: Record<string, string>
  usageTotal: number
  summary: string | null
  /**
   * 分步向导的位置（2026-11-11 新增，可选）。
   *
   * 旧快照没有这两个字段 ⇒ 读出来是 undefined，恢复时按「从第一章找第一个
   * 有结果但没写盘的章」处理，与旧行为等价。可选而非必填，是为了不把
   * AI_FULL_DRAFT_VERSION 抬版本——升版本会让用户手里上一版留下的 15 章
   * 结果全部作废（isAiFullDraft 会直接判无效），那代价比字段可选大得多。
   */
  applied?: string[]
  skipped?: string[]
}

/** localStorage 的最小契约：只取用到的三个方法，便于注入、不绑定完整 Storage */
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const DRAFT_STATUS_VALUES: readonly string[] = ['pending', 'running', 'done', 'failed']

export function aiFullDraftKey(ceshuId: string): string {
  return `mb.aiFull.draft.${ceshuId}`
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 只校验「形状」，不靠 as 断言：坏 JSON / 旧版本 / 被截断或被改坏的快照
 * 一律当作没有草稿。键里已经带了 ceshuId 还要再比一次 draft.ceshuId，
 * 是为了防止跨策划书串数据（键被写错或旧数据手工迁移时，仅靠键不够）。
 */
function isAiFullDraft(value: unknown, ceshuId: string): value is AiFullDraft {
  if (!isPlainRecord(value)) return false
  if (value.version !== AI_FULL_DRAFT_VERSION) return false
  if (value.ceshuId !== ceshuId) return false
  if (typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) return false
  if (typeof value.stage !== 'string') return false
  if (typeof value.scope !== 'string') return false
  if (typeof value.briefConfirmed !== 'boolean') return false
  if (typeof value.usageTotal !== 'number' || !Number.isFinite(value.usageTotal)) return false
  if (value.summary !== null && typeof value.summary !== 'string') return false

  const { results, statuses, errors } = value
  if (!isPlainRecord(results) || !isPlainRecord(statuses) || !isPlainRecord(errors)) return false
  for (const chapter of Object.values(results)) {
    if (!isPlainRecord(chapter)) return false
  }
  for (const status of Object.values(statuses)) {
    if (typeof status !== 'string' || !DRAFT_STATUS_VALUES.includes(status)) return false
  }
  for (const message of Object.values(errors)) {
    if (typeof message !== 'string') return false
  }
  for (const list of [value.applied, value.skipped]) {
    if (list === undefined) continue
    if (!Array.isArray(list)) return false
    if (!list.every((item) => typeof item === 'string')) return false
  }
  return true
}

/** 注入优先；未注入时探测 window.localStorage，任何异常都降级为「存储不可用」。 */
function resolveStorage(injected?: DraftStorage): DraftStorage | null {
  if (injected !== undefined) return injected
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage ?? null
  } catch {
    // 访问 window.localStorage 本身也会抛（被策略禁用的 iframe / 沙箱）
    return null
  }
}

export function saveAiFullDraft(
  draft: AiFullDraft,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): boolean {
  try {
    const target = resolveStorage(storage)
    if (target === null) return false
    target.setItem(aiFullDraftKey(draft.ceshuId), JSON.stringify(draft))
    return true
  } catch {
    // 配额超限 / storage 被禁用 / 序列化失败（循环引用等）
    return false
  }
}

export function loadAiFullDraft(
  ceshuId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): AiFullDraft | null {
  try {
    const target = resolveStorage(storage)
    if (target === null) return null
    const raw = target.getItem(aiFullDraftKey(ceshuId))
    if (raw === null || raw === undefined) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isAiFullDraft(parsed, ceshuId)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearAiFullDraft(
  ceshuId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
): void {
  try {
    const target = resolveStorage(storage)
    if (target === null) return
    target.removeItem(aiFullDraftKey(ceshuId))
  } catch {
    // 「全部应用并保存」已成功，清草稿失败不能反噬这次成功
  }
}
