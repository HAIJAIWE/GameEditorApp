import { useState, type ReactElement } from 'react'

import type { OperationRecord } from '@mobai/shared/agent/observability'

/**
 * 对话内联「本轮改动」卡（dsh deliverables 卡的本土对应物）。
 *
 * dsh 的交付物是 workspace 文件 diff；本仓库的数据在 SQLite，行级 diff 无从谈起，
 * 对应物是**操作日志**（新建/修改/删除）。故这里不展示 diff 内容，只把
 * 「这一轮智能体动了哪些数据」摊成行 —— 与 dsh 卡同构的是阅读节奏：
 * 图标 tile + 标题 + 增删统计的卡头，以及「超过 4 行折叠」。
 *
 * 两个导出分工明确：`DigitalChangeList` 纯展示（面板与对话卡共用，避免两份行渲染），
 * `DigitalChangeCard` 只是对话流里的外壳（标签 + 「查看全部」入口）。
 */

/** 折叠前显示的行数（对齐 dsh `ChangedFiles` 的 COLLAPSED_ROWS） */
const COLLAPSED_ROWS = 4

const EMPTY_TEXT = '暂无改动记录（智能体尚未修改数据）'

const OP_LABELS: Record<OperationRecord['opType'], string> = {
  create: '新建',
  update: '修改',
  delete: '删除'
}

/** 操作徽标 / 统计项的顺序（新建 → 修改 → 删除，与用户的心理顺序一致） */
const OP_ORDER: OperationRecord['opType'][] = ['create', 'update', 'delete']

const OP_CLASS: Record<OperationRecord['opType'], string> = {
  create: 'create',
  update: 'update',
  delete: 'delete'
}

/** 零依赖的 tile 图标（20px）：一份带折角的清单，暗示「改动清单」 */
const TILE_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M5.5 2.5h6l3.5 3.5v11a1 1 0 0 1-1 1h-8.5a1 1 0 0 1-1-1v-13.5a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M11.5 2.5V6h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M7.5 10h5M7.5 13h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

/**
 * 纯展示的改动列表：卡头（图标 + 标题 + 统计）+ 行 + 折叠按钮。
 *
 * @param changes 新→旧的改动记录（顺序由调用方保证，本组件不再排序）
 * @param empty 空态文案（默认沿用「暂无改动记录」）
 * @param loading 仅用于标记状态，不影响已渲染的行（避免刷新时列表闪空）
 */
export function DigitalChangeList({
  changes,
  empty,
  loading
}: {
  changes: readonly OperationRecord[]
  empty?: string
  loading?: boolean
}): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const foldable = changes.length > COLLAPSED_ROWS
  const rows = foldable && !expanded ? changes.slice(0, COLLAPSED_ROWS) : changes

  if (changes.length === 0) {
    return (
      <p className="digital-change-empty" data-loading={loading === true ? 'true' : undefined}>
        {empty ?? EMPTY_TEXT}
      </p>
    )
  }

  const title = changes.length === 1 ? `改动「${changes[0].itemName}」` : `改动 ${changes.length} 项`

  return (
    <div className="digital-change-body" data-loading={loading === true ? 'true' : undefined}>
      <div className="digital-change-head">
        <span className="digital-change-tile">{TILE_ICON}</span>
        <span className="digital-change-titles">
          <span className="digital-change-title">{title}</span>
          <span className="digital-change-stat">
            {OP_ORDER.filter((op) => countOf(changes, op) > 0).map((op) => (
              <span key={op} className={`digital-change-stat-item digital-change-stat-${OP_CLASS[op]}`}>
                {OP_LABELS[op]} {countOf(changes, op)}
              </span>
            ))}
          </span>
        </span>
      </div>

      <ul className="digital-change-list">
        {rows.map((change, index) => (
          <li
            key={`${change.itemId}-${change.timestamp}-${index}`}
            className="digital-change-row"
            data-testid="digital-change-row"
            data-op={change.opType}
          >
            <span className={`digital-change-op op-${change.opType}`}>{OP_LABELS[change.opType]}</span>
            <span className="digital-change-name" title={change.itemName}>
              {change.itemName}
            </span>
            <span className="digital-change-meta">
              {change.dataType} · {formatTime(change.timestamp)}
            </span>
          </li>
        ))}
      </ul>

      {foldable && (
        <button
          type="button"
          className="digital-change-toggle"
          data-testid="digital-change-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起 ▴' : `全部 ${changes.length} 项 ▾`}
        </button>
      )}
    </div>
  )
}

/**
 * 对话流里的改动卡外壳。
 *
 * 空列表**整体不渲染**（`return null`）：对话里多一个「本轮没改动」的空卡只会干扰阅读，
 * 与 dsh「无交付物就不出卡」的取舍一致。
 */
export function DigitalChangeCard({
  changes,
  loading,
  since,
  onOpenAll
}: {
  changes: readonly OperationRecord[]
  loading?: boolean
  /** 本轮开始时间（毫秒）；只作调试锚点，不参与展示逻辑 */
  since?: number | null
  /** 有值时卡头右侧出现「查看全部」（跳「最近改动」面板） */
  onOpenAll?: () => void
}): ReactElement | null {
  if (changes.length === 0) return null

  return (
    <div
      className="digital-change-card"
      data-testid="digital-change-card"
      data-count={changes.length}
      data-since={since ?? undefined}
    >
      <div className="digital-change-card-head">
        <span className="home-section-label">本次改动</span>
        {onOpenAll !== undefined && (
          <button type="button" className="btn-link digital-change-all" onClick={onOpenAll}>
            查看全部
          </button>
        )}
      </div>
      <DigitalChangeList changes={changes} loading={loading} />
    </div>
  )
}

function countOf(changes: readonly OperationRecord[], op: OperationRecord['opType']): number {
  return changes.filter((change) => change.opType === op).length
}

/**
 * 时间戳格式化（原 `recentChangesPlugin` 内实现，挪到此处供面板与对话卡共用）。
 * 兼容秒级时间戳：`< 1e12` 视为秒（历史数据/外部写入可能是秒）。
 */
export function formatTime(timestamp: number): string {
  if (!timestamp) return '—'
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
