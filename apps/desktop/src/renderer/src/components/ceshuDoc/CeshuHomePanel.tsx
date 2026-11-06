import { useMemo, useRef, useState, type ReactElement } from 'react'

import { SlotOutlet, useT } from '@mobai/client-ui'
import type { PluginHost } from '@mobai/shared/plugin/host'
import {
  CESHU_HOME_ACTIONS,
  homeGuideActions,
  showHomeActionDescriptions,
  type CeshuHomeActionId
} from '@mobai/shared/ceshu/homeActions'
import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
import type { DocKind } from '@mobai/shared/ceshu/model'
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
 * 策划书首页 —— 对齐 dsh「开始 / Start」引导屏的视觉真值。
 *
 * 参照 `deepseek-harness-master/.../ui-sidebar-right/src/client/tabs/guide/`：
 *  - `GuideBody.module.css` 的 `.guide` / `.entry`：单列 380px 胶囊、R20、0.5px 细边、
 *    min-height 56px、14px gap、26px 不染色图标盒、14px 常规字、hover 只换背景；
 *    整列 `min-height:100%` + `justify-content:center` 垂直居中，`::after` 上提 5%。
 *  - `GuideTitle.tsx` 的 `CompassGlyph`：56px 罗盘线稿水印（currentColor）。
 *  - README「引导页自己没有文字」：无大标题、无标语、无区块标签，故品牌文案仅作
 *    无障碍 label，不产生可见文字。
 *
 * 与 dsh 的差异（有意，为保留墨白功能且不打乱既有验收）：
 *  - 第 5 枚胶囊「全部策划书」是库管理区的滚动锚点；dsh 用「更多工具」菜单。
 *  - 「最近打开 / 搜索 / 卡片网格 / 重命名 / 复制 / 派生 / 删除」全部保留，
 *    但**滚动下沉**到欢迎屏下方——正对应 dsh 源码注释「长内容撑高进入 pane scroller」。
 *    所有既有 testid 与交互一个不少，DOM 常驻。
 *  - 复制 / 复刻用胶囊下方的内联表单展开，未照抄 dsh 的打开新面板。
 *
 * 旧版差异（沿用）：
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
  /**
   * 插件宿主：有值时开放 `ceshu.home.guide` chain 替换缝，允许插件整体接管引导体。
   * 经 `MainViewContext` 以 prop 注入（不 import plugins/context 单例，避免与
   * coreViewsPlugin 形成模块环）；未注入时直接渲染内置胶囊门。
   */
  host?: PluginHost
}

/** 卡片上的内联编辑/确认动作 */
type CardAction = { kind: 'rename' | 'derive' | 'delete'; id: string }

/**
 * dsh `CompassGlyph` 的线稿：外环 + 指向东北的菱形指针，全部用 currentColor。
 * 纯装饰，容器承担无障碍 label；不引入新的 LucideIconName（允许集无 compass）。
 */
function CompassGlyph({ size }: { size: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z"
        stroke="currentColor"
      />
      <path
        d="M10.6101 5.39014L8.99014 8.99014L5.39014 10.6101L7.01014 7.01014L10.6101 5.39014Z"
        fill="currentColor"
      />
    </svg>
  )
}

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
  host
}: CeshuHomePanelProps) {
  const t = useT()
  const libraryRef = useRef<HTMLDivElement>(null)
  const [keyword, setKeyword] = useState('')
  /** 只看有待审的策划书（纯展示层过滤，不影响搜索逻辑） */
  const [pendingOnly, setPendingOnly] = useState(false)
  const [docKindFilter, setDocKindFilter] = useState<DocKind | 'all'>('all')
  const [action, setAction] = useState<CardAction | null>(null)
  const [actionText, setActionText] = useState('')
  const [blankPickerOpen, setBlankPickerOpen] = useState(false)
  /** 新建时的文档深度：方向版(精简) / 细节版(完整)；仅对新建生效 */
  const [blankScope, setBlankScope] = useState<'lite' | 'full'>('full')
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
    () => filterPendingCards(filterCeshuCards(cards, keyword, docKindFilter), pendingOnly),
    [cards, keyword, docKindFilter, pendingOnly]
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

  const handleCreateBlank = (docKind: 'game' | 'application'): void =>
    void run(async () => {
      const doc = await window.mbApi.ceshu.create({ name: '', scope: blankScope, docKind })
      setBlankPickerOpen(false)
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

  /**
   * 注册表 → 运行时绑定：胶囊的静态契约（标签/图标/testid/描述）来自 shared 的
   * `CESHU_HOME_ACTIONS`，这里只把它们接到组件状态与 IPC 上。新增一个门只需
   * 改注册表 + 在此补一条 handler，不再复制粘贴整段 JSX（对齐 dsh 的 guide entries）。
   */
  const actionHandlers: Record<CeshuHomeActionId, () => void> = {
    blank: () => {
      setAction(null)
      setError(null)
      setNotice(null)
      setCopyPickerOpen(false)
      setCloneOpen(false)
      setBlankPickerOpen((open) => !open)
    },
    copy: () => {
      setAction(null)
      setError(null)
      setNotice(null)
      setCopyPickerOpen((open) => !open)
      setCopySourceId(summaries[0]?.id ?? '')
    },
    clone: () => {
      setAction(null)
      setError(null)
      setNotice(null)
      setCopyPickerOpen(false)
      setCloneOpen((open) => !open)
    },
    folder: () => void handleOpenProjectFolder(),
    library: () => libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  /** 只有展开内联表单的门需要 aria-expanded；其余不渲染该属性。 */
  const expandedActions: Partial<Record<CeshuHomeActionId, boolean>> = {
    blank: blankPickerOpen,
    copy: copyPickerOpen,
    clone: cloneOpen
  }
  /** dsh `MAX_DESCRIBED_ENTRIES`：门 ≤4 时显示 11px 描述，多了就整体收起保持轻量。 */
  const describeActions = showHomeActionDescriptions(homeGuideActions().length)

  /** 内置引导体：chain 缝无赢家时回落渲染（对齐 dsh `ShippedGuide` fallback）。 */
  const welcome = (
        <section className="home-welcome" aria-label={t('home.quickActions')}>
          <div className="home-compass" role="img" aria-label={t('home.heroTagline')}>
            <CompassGlyph size={56} />
          </div>

          <div className="home-quick">
            <div className="home-actions">
              {CESHU_HOME_ACTIONS.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  className="home-action-card"
                  data-testid={def.testId}
                  disabled={def.busySensitive && busy}
                  aria-expanded={expandedActions[def.id]}
                  title={def.titleKey === undefined ? undefined : t(def.titleKey)}
                  onClick={actionHandlers[def.id]}
                >
                  <span className="home-action-icon"><LucideIcon name={def.icon} size={22} /></span>
                  <span className="home-action-text">
                    <span className="home-action-label">{t(def.labelKey)}</span>
                    {describeActions && def.descriptionKey !== undefined && (
                      <span className="home-action-description">{t(def.descriptionKey)}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {blankPickerOpen && (
              <div className="home-copy-picker" data-testid="home-blank-picker">
                <div className="home-blank-scope" data-testid="home-blank-scope">
                  <button
                    type="button"
                    className={`btn slim${blankScope === 'lite' ? ' accent-outline' : ''}`}
                    data-testid="home-blank-scope-lite"
                    aria-pressed={blankScope === 'lite'}
                    disabled={busy}
                    onClick={() => setBlankScope('lite')}
                  >
                    {t('home.scopeDirection')}
                  </button>
                  <button
                    type="button"
                    className={`btn slim${blankScope === 'full' ? ' accent-outline' : ''}`}
                    data-testid="home-blank-scope-full"
                    aria-pressed={blankScope === 'full'}
                    disabled={busy}
                    onClick={() => setBlankScope('full')}
                  >
                    {t('home.scopeDetail')}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  data-testid="home-blank-game"
                  disabled={busy}
                  onClick={() => handleCreateBlank('game')}
                >
                  {t('home.createGame')}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  data-testid="home-blank-app"
                  disabled={busy}
                  onClick={() => handleCreateBlank('application')}
                >
                  {t('home.createApp')}
                </button>
                <button
                  type="button"
                  className="btn"
                  data-testid="home-blank-cancel"
                  disabled={busy}
                  onClick={() => setBlankPickerOpen(false)}
                >
                  {t('common.cancel')}
                </button>
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

            {error && (
              <div className="form-error home-inline-message" data-testid="home-error">
                {error}
              </div>
            )}
            {notice && (
              <div className="notice-banner inline home-inline-message" data-testid="home-notice">
                {notice}
              </div>
            )}
          </div>
        </section>
  )

  return (
    <div className="changelog-panel" data-testid="ceshu-home-panel">
      <div className="home-shell">
        {/* 引导体替换缝：插件往 `ceshu.home.guide` 注册 chain 项即可整体接管；
            无注册项时回落内置胶囊门，默认 UI 与全部 testid 不变。 */}
        {host === undefined ? welcome : (
          <SlotOutlet host={host} slotKey="ceshu.home.guide" empty={welcome} />
        )}

        {/* 库管理区：滚动下沉，保留全部文档管理能力与 testid */}
        <div className="home-manage" ref={libraryRef}>
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
              <button
                type="button"
                className={`btn slim${docKindFilter === 'all' ? ' accent-outline' : ''}`}
                data-testid="home-dockind-all"
                aria-pressed={docKindFilter === 'all'}
                onClick={() => setDocKindFilter('all')}
              >{t('home.docKindAll')}</button>
              <button
                type="button"
                className={`btn slim${docKindFilter === 'game' ? ' accent-outline' : ''}`}
                data-testid="home-dockind-game"
                aria-pressed={docKindFilter === 'game'}
                onClick={() => setDocKindFilter((prev) => (prev === 'game' ? 'all' : 'game'))}
              >{t('home.docKindGame')}</button>
              <button
                type="button"
                className={`btn slim${docKindFilter === 'application' ? ' accent-outline' : ''}`}
                data-testid="home-dockind-app"
                aria-pressed={docKindFilter === 'application'}
                onClick={() => setDocKindFilter((prev) => (prev === 'application' ? 'all' : 'application'))}
              >{t('home.docKindApp')}</button>
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
                          {card.platformLabel && (
                            <span className="home-badge home-badge-platform" data-testid="home-card-platform">
                              {card.platformLabel}
                            </span>
                          )}
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
    </div>
  )
}
