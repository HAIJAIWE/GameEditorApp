import { useMemo, useState } from 'react'

import type { CeshuSummary } from '../../../shared/ceshuConstants'
import {
  RECENT_LIMIT,
  buildCeshuCards,
  filterCeshuCards,
  pickRecentCeshu
} from '../../../shared/domain/ceshu/ceshuHome'

import HomeAiEntryCard from './ceshu/HomeAiEntryCard'
import LucideIcon from './LucideIcon'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 策划书首页（对应 Python `ui/ceshu/home_view.py` + `home_card.py`）：
 * 搜索 + 最近打开 + 新建入口 + 卡片网格 + 卡片操作（重命名/复制/派生/删除）。
 *
 * 有意偏离 Python：
 *  - PyQt 用右键 `QMenu` 承载卡片操作；TS 改为卡片内联按钮（可发现、可测）。
 *  - 「从模板新建」未移植：Python 的 `CeshuTemplate` 是**整份文档模板**，TS 的模板体系是
 *    **章节级**模板（W27–W29），两者不是同一概念。
 */

interface CeshuHomePanelProps {
  summaries: CeshuSummary[]
  activeId: string | null
  onOpen: (id: string) => void
  /** 列表发生变化（新建/复制/重命名/删除）后让上层重新加载 */
  onChanged: () => void
  /** 某份策划书被删除（上层据此清掉已失效的选中态） */
  onDeleted: (id: string) => void
  /**
   * AI 入口卡发送：上层负责组装引导前缀并投递给右侧 AI 面板
   * （对齐 PyQt `home_view.py::_on_ai_send`）。
   */
  onSendToAi?: (text: string) => void
}

/** 卡片上的内联编辑/确认动作 */
type CardAction = { kind: 'rename' | 'derive' | 'delete'; id: string }

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export default function CeshuHomePanel({
  summaries,
  activeId,
  onOpen,
  onChanged,
  onDeleted,
  onSendToAi
}: CeshuHomePanelProps) {
  const [keyword, setKeyword] = useState('')
  const [action, setAction] = useState<CardAction | null>(null)
  const [actionText, setActionText] = useState('')
  const [copyPickerOpen, setCopyPickerOpen] = useState(false)
  const [copySourceId, setCopySourceId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const cards = useMemo(() => buildCeshuCards(summaries), [summaries])
  const visibleCards = useMemo(() => filterCeshuCards(cards, keyword), [cards, keyword])
  const recents = useMemo(() => pickRecentCeshu(summaries, RECENT_LIMIT), [summaries])

  const beginAction = (next: CardAction, initialText = ''): void => {
    setError(null)
    setNotice(null)
    setCopyPickerOpen(false)
    setAction(next)
    setActionText(initialText)
  }

  const closeAction = (): void => {
    setAction(null)
    setActionText('')
    setCopyPickerOpen(false)
  }

  /** 统一的任务包装：busy + 错误捕获 + 完成后关内联区 + 刷新列表 */
  const run = async (task: () => Promise<string>): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const message = await task()
      closeAction()
      onChanged()
      setNotice(message)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleCreateBlank = (): void =>
    void run(async () => {
      const doc = await window.mbApi.ceshu.create({ name: '', scope: 'full' })
      onOpen(doc.ceshu_id)
      return '已新建空白策划书'
    })

  const handleDuplicate = (id: string): void =>
    void run(async () => {
      const doc = await window.mbApi.ceshu.duplicate({ id })
      const name = typeof doc.meta.game_name === 'string' ? doc.meta.game_name : ''
      onOpen(doc.ceshu_id)
      return `已复制为「${name}」`
    })

  const handleRename = (id: string): void =>
    void run(async () => {
      const name = actionText.trim()
      if (!name) throw new Error('新名称不能为空')
      await window.mbApi.ceshu.rename({ id, name })
      return `已重命名为「${name}」`
    })

  const handleDerive = (id: string): void =>
    void run(async () => {
      const doc = await window.mbApi.ceshu.derive({ id, note: actionText.trim() })
      onOpen(doc.ceshu_id)
      return `已派生新版本 ${doc.version_label}`
    })

  const handleDelete = (id: string): void =>
    void run(async () => {
      // `confirm` 是契约层要求的显式确认（此处必然来自用户点了「确认删除」）
      const result = await window.mbApi.ceshu.remove({ id, confirm: true })
      if (!result.deleted) throw new Error('策划书不存在，可能已被删除')
      onDeleted(id)
      return '已删除策划书'
    })

  return (
    <div className="changelog-panel" data-testid="ceshu-home-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">📚 策划书</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="home-new-blank"
            disabled={busy}
            onClick={handleCreateBlank}
          >
            <LucideIcon name="plus" size={16} />
            空白策划书
          </button>
          <button
            type="button"
            className="btn"
            data-testid="home-new-copy"
            disabled={busy}
            onClick={() => {
              setAction(null)
              setError(null)
              setNotice(null)
              setCopyPickerOpen((open) => !open)
              setCopySourceId(summaries[0]?.id ?? '')
            }}
          >
            从已有复制…
          </button>
        </div>
      </div>

      {/* AI 入口卡（对齐 PyQt `home_view.py:103-137`）：紧贴标题行下方，是首页最醒目的入口 */}
      {onSendToAi !== undefined && <HomeAiEntryCard onSend={onSendToAi} disabled={busy} />}

      <div className="item-meta">
        共 {summaries.length} 份策划书 · 点击卡片打开编辑
      </div>

      {error && (
        <div className="form-error" data-testid="home-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner inline" data-testid="home-notice">
          {notice}
        </div>
      )}

      {copyPickerOpen && (
        <div className="home-copy-picker" data-testid="home-copy-picker">
          <select
            className="form-input"
            data-testid="home-copy-select"
            value={copySourceId}
            onChange={(event) => setCopySourceId(event.target.value)}
          >
            {summaries.map((item) => (
              <option key={item.id} value={item.id}>
                {item.gameName || '未命名'}（{item.versionLabel || 'v1.0'}）
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn primary"
            data-testid="home-copy-confirm"
            disabled={busy || !copySourceId}
            onClick={() => handleDuplicate(copySourceId)}
          >
            复制为独立副本
          </button>
          <button type="button" className="btn" data-testid="home-copy-cancel" disabled={busy} onClick={closeAction}>
            取消
          </button>
        </div>
      )}

      <input
        className="form-input home-search"
        data-testid="home-search"
        placeholder="🔍 搜索策划书..."
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
      />

      {recents.length > 0 && (
        <div className="home-recent" data-testid="home-recent">
          <span className="home-section-label">最近打开</span>
          {recents.map((item) => (
            <button
              key={item.id}
              type="button"
              className="btn slim"
              data-testid="home-recent-item"
              onClick={() => onOpen(item.id)}
            >
              {(item.gameName || '未命名').slice(0, 12)}
            </button>
          ))}
        </div>
      )}

      <span className="home-section-label">全部策划书</span>

      {visibleCards.length === 0 ? (
        <div className="empty" data-testid="home-empty">
          {summaries.length === 0
            ? '暂无策划书，点击右上角「+ 空白策划书」开始吧'
            : `未找到匹配 '${keyword}' 的策划书`}
        </div>
      ) : (
        <div className="home-grid" data-testid="home-grid">
          {visibleCards.map((card) => {
            const current = action?.id === card.id ? action.kind : null
            return (
              <div
                className={`home-card${card.id === activeId ? ' active' : ''}`}
                data-testid="home-card"
                data-ceshu-id={card.id}
                key={card.id}
              >
                <button type="button" className="home-card-body" data-testid="home-card-open" onClick={() => onOpen(card.id)}>
                  <span className="home-card-title" data-testid="home-card-title">
                    {card.title}
                  </span>
                  <span className="home-card-badges">
                    <span className="home-badge home-badge-type" data-testid="home-card-type">
                      {card.typeLabel}
                    </span>
                    <span className={`home-badge home-badge-status status-${card.statusKey}`} data-testid="home-card-status">
                      {card.statusLabel}
                    </span>
                    {card.versionBadge && (
                      <span className="home-badge home-badge-version" data-testid="home-card-version">
                        {card.versionBadge}
                      </span>
                    )}
                  </span>
                  <span className="home-card-date" data-testid="home-card-date">
                    {card.updatedDisplay}
                  </span>
                  <span className="home-card-progress" data-testid="home-card-progress">
                    <span className="home-card-progress-fill" style={{ width: `${clampPercent(card.progressPercent)}%` }} />
                  </span>
                </button>

                <div className="home-card-actions">
                  <button
                    type="button"
                    className="btn slim"
                    data-testid="home-card-rename"
                    disabled={busy}
                    onClick={() => beginAction({ kind: 'rename', id: card.id }, card.title)}
                  >
                    重命名
                  </button>
                  <button
                    type="button"
                    className="btn slim"
                    data-testid="home-card-copy"
                    disabled={busy}
                    onClick={() => handleDuplicate(card.id)}
                  >
                    复制
                  </button>
                  <button
                    type="button"
                    className="btn slim"
                    data-testid="home-card-derive"
                    disabled={busy}
                    onClick={() => beginAction({ kind: 'derive', id: card.id })}
                  >
                    派生
                  </button>
                  <button
                    type="button"
                    className="btn slim danger"
                    data-testid="home-card-delete"
                    disabled={busy}
                    onClick={() => beginAction({ kind: 'delete', id: card.id })}
                  >
                    删除
                  </button>
                </div>

                {current === 'rename' && (
                  <div className="home-card-inline" data-testid="home-rename-box">
                    <input
                      className="form-input"
                      data-testid="home-rename-input"
                      value={actionText}
                      onChange={(event) => setActionText(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn primary slim"
                      data-testid="home-rename-save"
                      disabled={busy}
                      onClick={() => handleRename(card.id)}
                    >
                      保存
                    </button>
                    <button type="button" className="btn slim" data-testid="home-rename-cancel" onClick={closeAction}>
                      取消
                    </button>
                  </div>
                )}

                {current === 'derive' && (
                  <div className="home-card-inline" data-testid="home-derive-box">
                    <input
                      className="form-input"
                      data-testid="home-derive-input"
                      placeholder="本次迭代说明（可留空）"
                      value={actionText}
                      onChange={(event) => setActionText(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn primary slim"
                      data-testid="home-derive-save"
                      disabled={busy}
                      onClick={() => handleDerive(card.id)}
                    >
                      派生
                    </button>
                    <button type="button" className="btn slim" data-testid="home-derive-cancel" onClick={closeAction}>
                      取消
                    </button>
                  </div>
                )}

                {current === 'delete' && (
                  <div className="home-card-inline" data-testid="home-delete-box">
                    <span className="form-hint">删除「{card.title}」？此操作不可撤销。</span>
                    <button
                      type="button"
                      className="btn danger slim"
                      data-testid="home-delete-confirm"
                      disabled={busy}
                      onClick={() => handleDelete(card.id)}
                    >
                      确认删除
                    </button>
                    <button type="button" className="btn slim" data-testid="home-delete-cancel" onClick={closeAction}>
                      取消
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
