import { useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'
import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
import {
  RECENT_LIMIT,
  buildCeshuCards,
  filterCeshuCards,
  filterPendingCards,
  pickRecentCeshu
} from '@mobai/shared/ceshu/notes'

import { LucideIcon } from '../common'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * 策划书首页（dsh 风格「开始」欢迎屏）：
 *  - 居中 hero（品牌标记 + 标语）；
 *  - 竖向「快捷操作」动作卡片（新建空白 / 从已有复制 / 从想法复刻 / 打开项目文件夹），
 *    对齐 dsh 开始屏那种「居中的大圆角卡片列表」视觉；
 *  - 「最近打开」快捷入口；
 *  - 「全部策划书」卡片网格（搜索 / 只看待审 / 重命名 / 复制 / 派生 / 删除），
 *    文档管理能力一个不少——只是从「首页头部按钮行」下沉为独立区块。
 *
 * 与旧版差异（有意）：
 *  - 旧版 用右键 `QMenu` 承载卡片操作；TS 改为卡片内联按钮（可发现、可测）。
 *  - 「从模板新建」未移植：旧版 的 `CeshuTemplate` 是**整份文档模板**，TS 的模板体系是
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
  onDeleted
}: CeshuHomePanelProps) {
  const t = useT()
  const [keyword, setKeyword] = useState('')
  /** 只看有待审的策划书（纯展示层过滤，不影响搜索逻辑） */
  const [pendingOnly, setPendingOnly] = useState(false)
  const [action, setAction] = useState<CardAction | null>(null)
  const [actionText, setActionText] = useState('')
  const [copyPickerOpen, setCopyPickerOpen] = useState(false)
  const [copySourceId, setCopySourceId] = useState('')
  const [cloneOpen, setCloneOpen] = useState(false)
  const [cloneName, setCloneName] = useState('')
  const [cloneType, setCloneType] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const cards = useMemo(() => buildCeshuCards(summaries), [summaries])
  // 搜索过滤在前、待审过滤在后：先缩小到用户搜的范围，再看里面哪些还有待审
  const visibleCards = useMemo(
    () => filterPendingCards(filterCeshuCards(cards, keyword), pendingOnly),
    [cards, keyword, pendingOnly]
  )
  /**
   * 「只看待审」专属空态：列表本身有内容、只是没有待审项。
   * 带关键词时不走这里——那种情况该提示「未找到匹配」，否则会把「搜不到」误报成「没有待审」。
   */
  const pendingEmpty =
    pendingOnly && keyword.trim() === '' && visibleCards.length === 0 && summaries.length > 0
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
      return t('home.created')
    })

  /** 复刻/想法入口：参考游戏名 → AI 拆出「立项一页」→ 新建文档并打开 */
  const handleClone = (): void =>
    void run(async () => {
      const gameName = cloneName.trim()
      if (gameName === '') throw new Error(t('home.cloneNameRequired'))
      const { doc } = await window.mbApi.ceshu.cloneDecompose({
        gameName,
        ...(cloneType.trim() !== '' ? { gameType: cloneType.trim() } : {})
      })
      onOpen(doc.ceshu_id)
      setCloneOpen(false)
      setCloneName('')
      setCloneType('')
      return t('home.cloneGenerated')
    })

  /**
   * 打开项目文件夹（一个游戏一个文件夹）：选目录 → 主进程还原文档并落地到本库 → 打开。
   * 不走 `run()`：取消选择时不该弹 notice，也不该刷新列表。
   */
  const handleOpenProjectFolder = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    try {
      const chosen = await window.mbApi.dialog.chooseProjectDir()
      if (chosen.path === null) return
      setBusy(true)
      const { doc } = await window.mbApi.ceshu.openProjectFolder({ path: chosen.path })
      const name = typeof doc.meta.game_name === 'string' ? doc.meta.game_name : ''
      onChanged()
      onOpen(doc.ceshu_id)
      setNotice(name === '' ? t('home.projectOpened') : t('home.projectOpenedNamed', { name }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDuplicate = (id: string): void =>
    void run(async () => {
      const doc = await window.mbApi.ceshu.duplicate({ id })
      const name = typeof doc.meta.game_name === 'string' ? doc.meta.game_name : ''
      onOpen(doc.ceshu_id)
      return t('home.duplicated', { name })
    })

  const handleRename = (id: string): void =>
    void run(async () => {
      const name = actionText.trim()
      if (!name) throw new Error(t('home.renameRequired'))
      await window.mbApi.ceshu.rename({ id, name })
      return t('home.renamed', { name })
    })

  const handleDerive = (id: string): void =>
    void run(async () => {
      const doc = await window.mbApi.ceshu.derive({ id, note: actionText.trim() })
      onOpen(doc.ceshu_id)
      return t('home.derived', { version: doc.version_label })
    })

  const handleDelete = (id: string): void =>
    void run(async () => {
      // `confirm` 是契约层要求的显式确认（此处必然来自用户点了「确认删除」）
      const result = await window.mbApi.ceshu.remove({ id, confirm: true })
      if (!result.deleted) throw new Error(t('home.deleteMissing'))
      onDeleted(id)
      return t('home.deleted')
    })

  return (
    <div className="changelog-panel" data-testid="ceshu-home-panel">
      <div className="home-shell">
        {/* 欢迎 hero：对齐 dsh 开始屏的居中品牌区 */}
        <div className="home-hero">
          <div className="home-hero-mark" aria-hidden>
            <LucideIcon name="book-open" size={40} />
          </div>
          <h1 className="home-hero-title">{t('app.brand')}</h1>
          <p className="home-hero-tagline">{t('home.heroTagline')}</p>
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

        {/* 快捷操作：dsh 风格竖向动作卡片 */}
        <section className="home-quick">
          <span className="home-section-label">{t('home.quickActions')}</span>
          <div className="home-actions">
            <button
              type="button"
              className="home-action-card primary"
              data-testid="home-new-blank"
              disabled={busy}
              onClick={handleCreateBlank}
            >
              <LucideIcon name="plus" size={20} className="home-action-icon" />
              <span className="home-action-label">{t('home.newBlank')}</span>
              <LucideIcon name="arrow-right" size={16} className="home-action-chevron" />
            </button>
            <button
              type="button"
              className="home-action-card"
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
              <LucideIcon name="file-text" size={20} className="home-action-icon" />
              <span className="home-action-label">{t('home.copyFromExisting')}</span>
              <LucideIcon name="chevron-down" size={16} className="home-action-chevron" />
            </button>
            <button
              type="button"
              className="home-action-card"
              data-testid="home-clone-open"
              disabled={busy}
              onClick={() => {
                setAction(null)
                setError(null)
                setNotice(null)
                setCopyPickerOpen(false)
                setCloneOpen((open) => !open)
              }}
            >
              <LucideIcon name="sparkles" size={20} className="home-action-icon" />
              <span className="home-action-label">{t('home.cloneOpen')}</span>
              <LucideIcon name="chevron-down" size={16} className="home-action-chevron" />
            </button>
            <button
              type="button"
              className="home-action-card"
              data-testid="home-open-folder"
              disabled={busy}
              title={t('home.openFolderTitle')}
              onClick={() => void handleOpenProjectFolder()}
            >
              <LucideIcon name="folder" size={20} className="home-action-icon" />
              <span className="home-action-label">{t('home.openFolder')}</span>
              <LucideIcon name="chevron-right" size={16} className="home-action-chevron" />
            </button>
          </div>

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
                    {t('home.copyOption', {
                      name: item.gameName || t('home.untitled'),
                      version: item.versionLabel || 'v1.0'
                    })}
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
                {t('home.copyConfirm')}
              </button>
              <button type="button" className="btn" data-testid="home-copy-cancel" disabled={busy} onClick={closeAction}>
                {t('common.cancel')}
              </button>
            </div>
          )}

          {cloneOpen && (
            <div className="home-copy-picker" data-testid="home-clone-form">
              <input
                className="form-input"
                data-testid="home-clone-name"
                placeholder={t('home.cloneNamePlaceholder')}
                value={cloneName}
                onChange={(event) => setCloneName(event.target.value)}
              />
              <input
                className="form-input"
                data-testid="home-clone-type"
                placeholder={t('home.cloneTypePlaceholder')}
                value={cloneType}
                onChange={(event) => setCloneType(event.target.value)}
              />
              <button
                type="button"
                className="btn primary"
                data-testid="home-clone-confirm"
                disabled={busy || cloneName.trim() === ''}
                onClick={handleClone}
              >
                {busy ? t('home.generating') : t('home.generate')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="home-clone-cancel"
                disabled={busy}
                onClick={() => setCloneOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </section>

        {/* 最近打开 */}
        {recents.length > 0 && (
          <div className="home-recent" data-testid="home-recent">
            <span className="home-section-label">{t('home.recent')}</span>
            <div className="home-recent-chips">
              {recents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="btn slim"
                  data-testid="home-recent-item"
                  onClick={() => onOpen(item.id)}
                >
                  {(item.gameName || t('home.untitled')).slice(0, 12)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 全部策划书 */}
        <section className="home-library">
          <div className="home-library-head">
            <span className="home-section-label">{t('home.all')}</span>
            <span className="item-meta">{t('home.countSummary', { n: summaries.length })}</span>
          </div>

          {/* 搜索 + 「只看待审」同一行：两者共同决定「看到哪些卡」 */}
          <div className="home-filter-row">
            <input
              className="form-input home-search"
              data-testid="home-search"
              placeholder={t('home.searchPlaceholder')}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />

            {/* 紧跟搜索框：两者共同决定「看到哪些卡」。不新增样式类，复用既有 slim / accent-outline */}
            <button
              type="button"
              className={`btn slim${pendingOnly ? ' accent-outline' : ''}`}
              data-testid="home-pending-filter"
              aria-pressed={pendingOnly}
              title={t('home.pendingOnlyTitle')}
              onClick={() => setPendingOnly((value) => !value)}
            >
              {t('home.pendingOnly')}
            </button>
          </div>

          {pendingEmpty ? (
            <div className="empty" data-testid="home-pending-empty">
              {t('home.pendingEmpty')}
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="empty" data-testid="home-empty">
              {summaries.length === 0 ? t('home.emptyAll') : t('home.emptySearch', { keyword })}
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
                      {card.pendingCount > 0 && (
                        <span className="item-meta" data-testid="home-card-pending">{t('toolbar.pendingReview', { n: card.pendingCount })}</span>
                      )}
                    </button>

                    <div className="home-card-actions">
                      <button
                        type="button"
                        className="btn slim"
                        data-testid="home-card-rename"
                        disabled={busy}
                        onClick={() => beginAction({ kind: 'rename', id: card.id }, card.title)}
                      >
                        {t('home.rename')}
                      </button>
                      <button
                        type="button"
                        className="btn slim"
                        data-testid="home-card-copy"
                        disabled={busy}
                        onClick={() => handleDuplicate(card.id)}
                      >
                        {t('common.copy')}
                      </button>
                      <button
                        type="button"
                        className="btn slim"
                        data-testid="home-card-derive"
                        disabled={busy}
                        onClick={() => beginAction({ kind: 'derive', id: card.id })}
                      >
                        {t('home.derive')}
                      </button>
                      <button
                        type="button"
                        className="btn slim danger"
                        data-testid="home-card-delete"
                        disabled={busy}
                        onClick={() => beginAction({ kind: 'delete', id: card.id })}
                      >
                        {t('common.delete')}
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
                          {t('common.save')}
                        </button>
                        <button type="button" className="btn slim" data-testid="home-rename-cancel" onClick={closeAction}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    )}

                    {current === 'derive' && (
                      <div className="home-card-inline" data-testid="home-derive-box">
                        <input
                          className="form-input"
                          data-testid="home-derive-input"
                          placeholder={t('home.deriveNotePlaceholder')}
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
                          {t('home.derive')}
                        </button>
                        <button type="button" className="btn slim" data-testid="home-derive-cancel" onClick={closeAction}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    )}

                    {current === 'delete' && (
                      <div className="home-card-inline" data-testid="home-delete-box">
                        <span className="form-hint">{t('home.deleteConfirm', { title: card.title })}</span>
                        <button
                          type="button"
                          className="btn danger slim"
                          data-testid="home-delete-confirm"
                          disabled={busy}
                          onClick={() => handleDelete(card.id)}
                        >
                          {t('home.deleteConfirmBtn')}
                        </button>
                        <button type="button" className="btn slim" data-testid="home-delete-cancel" onClick={closeAction}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
