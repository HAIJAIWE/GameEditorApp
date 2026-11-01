/**
 * 策划书首页（卡片视图）纯逻辑。
 *
 * 只做「摘要 → 卡片展示模型」的纯映射、搜索过滤、最近打开选取与复制命名；
 * 不触碰磁盘与 React，输入既有对象、返回新对象，便于 Node 环境单测。
 *
 * 有意偏离 旧版（已在路线图记录）：
 *  - `buildDuplicateName` 对空名回退「未命名」；旧版 `duplicate_ceshu` 用
 *    `meta.get("game_name", "未命名")`，键存在但为空串时会产出「 (副本)」这种空名怪值。
 */

import type { CeshuSummary } from '../reference'

/** 策划书状态标签 */
export const CESHU_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  in_progress: '进行中',
  review: '评审中',
  final: '已确认'
}

/** 无名称时的占位 */
export const UNNAMED_CESHU = '未命名'

/** 无游戏类型时的占位 */
export const UNCATEGORIZED_TYPE = '未分类'

/** 复制策划书追加的名称后缀 */
export const DUPLICATE_NAME_SUFFIX = ' (副本)'

/** 最近打开展示条数 */
export const RECENT_LIMIT = 5

/** 卡片更新时间显示的最大长度 */
export const UPDATED_DISPLAY_MAX = 16

/** 状态标签；未知状态原样返回 */
export function ceshuStatusLabel(status: string): string {
  return CESHU_STATUS_LABELS[status] ?? status
}

/** 卡片标题：空名回退「未命名」 */
export function ceshuCardTitle(name: string): string {
  return name === '' ? UNNAMED_CESHU : name
}

/** 类型标签：空回退「未分类」 */
export function ceshuTypeLabel(gameType: string): string {
  return gameType === '' ? UNCATEGORIZED_TYPE : gameType
}

/** 更新时间显示：超过 16 字符截断 */
/**
 * 更新时间显示：超过 16 字符截断。
 *
 * 另把 ISO 的 `T` 归一成空格：本应用自己写盘用 `YYYY-MM-DD HH:mm:ss`（空格分隔），
 * 但**导入/外部来源**可能是 ISO（`2026-01-01T00:00:00`），直接截断会露出一个
 * 突兀的 `T`（预览桩实测）。归一化后两种来源显示一致，也不影响已有格式。
 */
export function ceshuUpdatedDisplay(updatedAt: string): string {
  const normalized = updatedAt.replace('T', ' ')
  return normalized.length > UPDATED_DISPLAY_MAX ? normalized.slice(0, UPDATED_DISPLAY_MAX) : normalized
}

/**
 * 版本徽章文案：
 * `{versionLabel} ({主|子}){ ★}`；无 versionLabel 时返回空串（徽章不显示）。
 * 主/子由 parentId 是否为空判定（无父 = 主策划）。
 */
export function ceshuVersionBadge(
  version: Pick<CeshuSummary, 'versionLabel' | 'parentId' | 'isActive'>
): string {
  if (version.versionLabel === '') return ''
  const suffix = version.parentId === '' ? '主' : '子'
  const star = version.isActive ? ' ★' : ''
  return `${version.versionLabel} (${suffix})${star}`
}

/** 进度百分比 */
export function ceshuProgressPercent(progress: number): number {
  if (!Number.isFinite(progress)) return 0
  return Math.trunc(progress * 100)
}

/** 卡片视图模型 */
export interface CeshuCardView {
  id: string
  /** 展示标题（空名回退「未命名」） */
  title: string
  /** 类型标签（空回退「未分类」） */
  typeLabel: string
  /** 状态原文（用于徽章配色） */
  statusKey: string
  /** 状态标签（未知状态原样） */
  statusLabel: string
  /** 版本徽章（无版本号时为空串） */
  versionBadge: string
  /** 更新时间显示（≤16 字符） */
  updatedDisplay: string
  /** 进度百分比 0~100（截断） */
  progressPercent: number
  /** 待审字段数（0 = 没有待审；卡片据此显示「待审 N」徽标） */
  pendingCount: number
  isMain: boolean
  isActive: boolean
  /** 搜索键：标题小写（搜索不区分大小写） */
  searchKey: string
}

/** 摘要 → 卡片视图模型 */
export function buildCeshuCard(summary: CeshuSummary): CeshuCardView {
  const title = ceshuCardTitle(summary.gameName)
  return {
    id: summary.id,
    title,
    typeLabel: ceshuTypeLabel(summary.gameType),
    statusKey: summary.status,
    statusLabel: ceshuStatusLabel(summary.status),
    versionBadge: ceshuVersionBadge(summary),
    updatedDisplay: ceshuUpdatedDisplay(summary.updatedAt),
    progressPercent: ceshuProgressPercent(summary.progress),
    pendingCount: summary.pendingCount,
    isMain: summary.parentId === '',
    isActive: summary.isActive,
    searchKey: title.toLowerCase()
  }
}

/** 摘要列表 → 卡片视图模型列表 */
export function buildCeshuCards(summaries: CeshuSummary[]): CeshuCardView[] {
  return summaries.map((summary) => buildCeshuCard(summary))
}

/** 按标题不区分大小写子串过滤 */
export function filterCeshuCards(cards: CeshuCardView[], keyword: string): CeshuCardView[] {
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return cards
  return cards.filter((card) => card.searchKey.includes(needle))
}

/**
 * 只保留有待审的卡片（pendingCount > 0）；enabled=false 时原样返回。
 *
 * 首页「只看待审」开关用：版本一多，靠肉眼扫「待审 N」徽标成本太高。
 * 关闭时返回**同一个引用**，让调用方 useMemo 的依赖语义与改动前完全一致。
 */
export function filterPendingCards(cards: CeshuCardView[], enabled: boolean): CeshuCardView[] {
  if (!enabled) return cards
  return cards.filter((card) => card.pendingCount > 0)
}

/** 最近打开：按 updatedAt 倒序取前 count 条 */
export function pickRecentCeshu(summaries: CeshuSummary[], count: number = RECENT_LIMIT): CeshuSummary[] {
  return [...summaries]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(0, count))
}

/**
 * 复制策划书的名称。
 * 偏离：空名回退「未命名」，避免产出「 (副本)」。
 */
export function buildDuplicateName(name: string): string {
  return ceshuCardTitle(name) + DUPLICATE_NAME_SUFFIX
}
