import { useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { SYSTEM_LABELS, type CeshuDocument } from '@mobai/shared/ceshu/reference'
import {
  HYBRID_GAMEPLAY_PRESETS,
  PRESET_KEYS,
  filterPresets,
  formatModuleBadge,
  formatRecommendedSystems,
  formatSecondaryModules,
  styleBadgeColor
} from '@mobai/shared/ceshu/reference'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * 混合玩法预设市场：
 * 卡片式展示 18 个工业级预设，支持搜索（名称/风格/模块类型/特色/键）与一键应用。
 * 应用语义：启用推荐系统（已启用的不关闭）+ 空 game_type 时写入预设模块类型，由主进程一次写盘。
 */

interface PresetMarketPanelProps {
  ceshuId: string
  onApplied: (doc: CeshuDocument, enabledCount: number, presetLabel: string) => void
  onClose: () => void
}

export default function PresetMarketPanel({ ceshuId, onApplied, onClose }: PresetMarketPanelProps) {
  const t = useT()
  const [keyword, setKeyword] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const entries = useMemo(() => filterPresets(keyword), [keyword])
  const pending = pendingKey ? HYBRID_GAMEPLAY_PRESETS[pendingKey] : undefined

  /** 应用预设：走 IPC 在主进程启用推荐系统并写盘，返回更新后的文档 */
  const handleApply = async (presetKey: string): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.applyPreset({ id: ceshuId, presetKey })
      setPendingKey(null)
      setNotice(t('presetMarket.applied', { label: result.presetLabel, count: result.enabledCount }))
      onApplied(result.doc, result.enabledCount, result.presetLabel)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="changelog-panel" data-testid="preset-market-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t('presetMarket.title')}</span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="preset-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="item-meta">{t('presetMarket.count', { n: PRESET_KEYS.length })}</div>

      {error && (
        <div className="form-error" data-testid="preset-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner inline" data-testid="preset-notice">
          {notice}
        </div>
      )}

      <input
        className="form-input preset-search"
        data-testid="preset-search"
        placeholder={t('presetMarket.searchPlaceholder')}
        value={keyword}
        onChange={(event) => {
          setKeyword(event.target.value)
          setPendingKey(null)
        }}
      />

      {pendingKey && pending && (
        <div className="preset-confirm" data-testid="preset-confirm-box">
          <div className="form-label">{t('presetMarket.applyPending', { label: pending.label })}</div>
          <div className="item-meta">
            {t('presetMarket.styleModule', { style: pending.style, module: pending.moduleType })}
          </div>
          <div className="form-label">{t('presetMarket.enableSystems', { n: pending.recommendedSystems.length })}</div>
          <ul className="preset-confirm-list">
            {pending.recommendedSystems.map((system) => (
              <li key={system}>✓ {SYSTEM_LABELS[system] ?? system}</li>
            ))}
          </ul>
          <div className="item-meta">{t('presetMarket.notClose')}</div>
          <div className="editor-actions">
            <button
              type="button"
              className="btn primary"
              data-testid="preset-confirm"
              disabled={busy}
              onClick={() => void handleApply(pendingKey)}
            >
              {busy ? t('presetMarket.applying') : t('presetMarket.confirm')}
            </button>
            <button type="button" className="btn" data-testid="preset-cancel" disabled={busy} onClick={() => setPendingKey(null)}>
              {t('presetMarket.cancel')}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty" data-testid="preset-empty">
          {t('presetMarket.empty', { keyword })}
        </div>
      ) : (
        <div className="preset-grid" data-testid="preset-grid">
          {entries.map((entry) => (
            <div className="preset-card" data-testid="preset-card" key={entry.key}>
              <div className="preset-card-head">
                <span className="preset-card-title" data-testid="preset-label">
                  {entry.label}
                </span>
                <span className="preset-badge" data-testid="preset-style" style={{ background: styleBadgeColor(entry.style) }}>
                  {entry.style}
                </span>
                <span className="preset-badge preset-badge-module" data-testid="preset-module">
                  {formatModuleBadge(entry.moduleType)}
                </span>
              </div>
              {entry.highlight && (
                <div className="preset-highlight" data-testid="preset-highlight">
                  💡 {entry.highlight}
                </div>
              )}
              {entry.recommendedSystems.length > 0 && (
                <div className="preset-systems" data-testid="preset-systems">
                  {t('presetMarket.recommendedSystems', { list: formatRecommendedSystems(entry) })}
                </div>
              )}
              {entry.secondaryModules.length > 0 && (
                <div className="preset-secondary" data-testid="preset-secondary">
                  {t('presetMarket.secondaryModules', { list: formatSecondaryModules(entry) })}
                </div>
              )}
              <div className="editor-actions">
                <button
                  type="button"
                  className="btn primary"
                  data-testid="preset-apply"
                  disabled={busy}
                  onClick={() => {
                    setError(null)
                    setNotice(null)
                    setPendingKey(entry.key)
                  }}
                >
                  {t('presetMarket.apply')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
