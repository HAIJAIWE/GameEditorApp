import { useEffect, useMemo, useState } from 'react'

import {
  formatFieldsPreview,
  type SystemConfirmCustom
} from '../../../shared/ceshu/ceshuSystemConfirm'
import {
  type CeshuDocument,
  type SystemEntry
} from '../../../shared/ceshu/ceshuConstants'
import { SYSTEM_CONFIG_SCHEMA } from '../../../shared/systemConfigSchema'

interface SystemConfirmPanelProps {
  ceshuId: string
  onApplied: (doc: CeshuDocument, enabledCount: number, addedCustom: number) => void
  onClose: () => void
}

interface RowView {
  key: string
  name: string
  dataType: string
  enabled: boolean
  aiReason: string
  note?: string
  isCustom: boolean
}

function toRow(key: string, entry: SystemEntry): RowView {
  return {
    key,
    name: typeof entry.name === 'string' && entry.name ? entry.name : key,
    dataType: typeof entry.data_type === 'string' && entry.data_type ? entry.data_type : key,
    enabled: entry.enabled === true,
    aiReason: typeof entry.ai_reason === 'string' ? entry.ai_reason : '',
    note: typeof entry.config?.note === 'string' ? entry.config.note : undefined,
    isCustom: !(key in SYSTEM_CONFIG_SCHEMA)
  }
}

/**
 * 系统确认面板（对齐 Python SystemConfirmDialog）：
 * 展示策划书所有游戏系统，可勾选启用、展开查看字段架构预览、增删自定义系统；
 * 确认后写回 systems 章并自动触发数据同步（注册启用系统的数据结构）。
 */
export default function SystemConfirmPanel({ ceshuId, onApplied, onClose }: SystemConfirmPanelProps) {
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [customRows, setCustomRows] = useState<RowView[]>([])
  const [customInput, setCustomInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .get({ id: ceshuId })
      .then((loaded) => {
        if (cancelled) return
        setDoc(loaded)
        const sysMap = loaded.systems as Record<string, SystemEntry>
        const initialChecked: Record<string, boolean> = {}
        const initialExpanded: Record<string, boolean> = {}
        for (const [key, entry] of Object.entries(sysMap)) {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
          const row = toRow(key, entry as SystemEntry)
          initialChecked[key] = row.enabled
          initialExpanded[key] = row.enabled
        }
        setChecked(initialChecked)
        setExpanded(initialExpanded)
        setCustomRows([])
        setError(null)
        setNotice(null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  const allRows = useMemo<RowView[]>(() => {
    if (!doc) return []
    const sysMap = doc.systems as Record<string, SystemEntry>
    const base = Object.entries(sysMap)
      .filter(([, entry]) => entry && typeof entry === 'object' && !Array.isArray(entry))
      .map(([key, entry]) => toRow(key, entry as SystemEntry))
    // 自定义系统（不在原 systems 中的）排在最后
    const customKeys = new Set(customRows.map((row) => row.key))
    const baseWithoutCustom = base.filter((row) => !customKeys.has(row.key))
    return [...baseWithoutCustom, ...customRows]
  }, [doc, customRows])

  const handleToggle = (key: string, value: boolean): void => {
    setChecked((prev) => ({ ...prev, [key]: value }))
    if (value) setExpanded((prev) => ({ ...prev, [key]: true }))
  }

  const handleToggleExpand = (key: string): void => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleAddCustom = (): void => {
    const name = customInput.trim()
    if (!name) return
    if (name in checked || customRows.some((row) => row.key === name)) {
      setError(`系统「${name}」已存在`)
      return
    }
    setError(null)
    const row: RowView = {
      key: name,
      name,
      dataType: name,
      enabled: true,
      aiReason: '',
      note: '自定义系统',
      isCustom: true
    }
    setCustomRows((prev) => [...prev, row])
    setChecked((prev) => ({ ...prev, [name]: true }))
    setExpanded((prev) => ({ ...prev, [name]: true }))
    setCustomInput('')
  }

  const handleConfirm = async (): Promise<void> => {
    if (!doc) return
    setBusy(true)
    setError(null)
    try {
      const enabledKeys = allRows.filter((row) => checked[row.key]).map((row) => row.key)
      const customSystems: SystemConfirmCustom[] = customRows.map((row) => ({ key: row.key, name: row.name }))
      const result = await window.mbApi.ceshu.confirmSystems({ id: ceshuId, enabledKeys, customSystems })
      setDoc(result.doc)
      setNotice(`已确认游戏系统：启用 ${result.enabledCount} 个${result.addedCustom > 0 ? `（新增自定义 ${result.addedCustom} 个）` : ''}`)
      onApplied(result.doc, result.enabledCount, result.addedCustom)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!doc) {
    return (
      <div className="system-confirm-panel" data-testid="system-confirm-panel">
        <div className="empty">正在加载系统配置…</div>
      </div>
    )
  }

  return (
    <div className="system-confirm-panel" data-testid="system-confirm-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">确认游戏系统 + 字段架构预览</span>
        <button type="button" className="btn" data-testid="system-confirm-close" disabled={busy} onClick={onClose}>
          关闭
        </button>
      </div>
      <p className="form-hint">勾选启用你需要的游戏系统，可展开查看标准字段架构；也可新增自定义系统。确认后将写回策划书并注册对应数据结构。</p>

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="system-list">
        {allRows.map((row) => {
          const preview = row.isCustom
            ? ''
            : formatFieldsPreview(row.key, (doc.systems[row.key] as SystemEntry | undefined)?.config ?? {})
          return (
            <div className="system-card" key={row.key} data-testid={`sys-card-${row.key}`}>
              <div className="system-card-head">
                <label className="system-check-label">
                  <input
                    type="checkbox"
                    data-testid={`sys-check-${row.key}`}
                    checked={checked[row.key] ?? false}
                    onChange={(event) => handleToggle(row.key, event.target.checked)}
                  />
                  <span className="system-name">
                    {row.name} <span className="system-datatype">（{row.dataType}）</span>
                  </span>
                </label>
                {row.aiReason && <span className="system-reason">💡 {row.aiReason}</span>}
                {row.isCustom && <span className="system-tag">自定义</span>}
              </div>
              {!row.isCustom && preview && (
                <div className="system-preview">
                  <button
                    type="button"
                    className="btn-link"
                    data-testid={`sys-toggle-${row.key}`}
                    onClick={() => handleToggleExpand(row.key)}
                  >
                    {expanded[row.key] ? '收起字段架构' : '展开字段架构'}
                  </button>
                  {expanded[row.key] && (
                    <pre className="system-fields" data-testid={`sys-fields-${row.key}`}>
                      {preview}
                    </pre>
                  )}
                </div>
              )}
              {row.isCustom && row.note && (
                <div className="system-preview">
                  <pre className="system-fields">📝 {row.note}</pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="custom-system-row">
        <input
          className="form-input"
          data-testid="sys-custom-input"
          placeholder="新增自定义系统名称（如 tower_defense）…"
          value={customInput}
          onChange={(event) => setCustomInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleAddCustom()
          }}
        />
        <button type="button" className="btn" data-testid="sys-add-custom" disabled={busy} onClick={() => handleAddCustom()}>
          + 添加
        </button>
      </div>

      <div className="system-confirm-actions">
        <button
          type="button"
          className="btn primary"
          data-testid="sys-confirm"
          disabled={busy}
          onClick={() => void handleConfirm()}
        >
          ✅ 确认生成
        </button>
        <button type="button" className="btn" data-testid="sys-cancel" disabled={busy} onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
