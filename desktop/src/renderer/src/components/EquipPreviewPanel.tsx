import { useEffect, useMemo, useState } from 'react'

import {
  buffRecordToItem,
  computeEquipComparison,
  EQUIP_SLOTS,
  equipRecordToItem,
  formatPreviewNumber,
  type EquipPreviewItem
} from '../../../shared/domain/attr/equipPreview'
import type { AttrSystem } from '../../../shared/ceshu/reference/attrSystem'

/**
 * 装备预览视图：
 * - 左侧：装备/Buff 数据列表（来自数据表，挂载时加载）；点击装备放入其「部位」槽，点击 Buff 加入激活列表（可重复）
 * - 右侧：基础值输入（默认值，避免与实时预览跨视图耦合）、装备槽（可卸下）、已激活 Buff（可移除）
 * - 底部：属性对比（全部属性「基础 → 最终」与差值，正绿负红）
 * 偏差记录：旧版 用拖拽（TS 用点击，可测且避免 DnD 脆弱性）；旧版 Buff 卡片不参与计算（TS 参与）
 */

interface EquipPreviewPanelProps {
  system: AttrSystem
}

interface LoadedItems {
  equips: EquipPreviewItem[]
  buffs: EquipPreviewItem[]
  error: string | null
  loaded: boolean
}

export default function EquipPreviewPanel({ system }: EquipPreviewPanelProps) {
  const [items, setItems] = useState<LoadedItems>({ equips: [], buffs: [], error: null, loaded: false })
  const [tab, setTab] = useState<'equip' | 'buff'>('equip')
  const [equipped, setEquipped] = useState<Record<string, EquipPreviewItem>>({})
  const [activeBuffs, setActiveBuffs] = useState<EquipPreviewItem[]>([])
  const [baseOverrides, setBaseOverrides] = useState<Record<string, number>>({})
  const [message, setMessage] = useState<string | null>(null)

  // 挂载时从数据表加载装备/Buff（异步回填，不在 effect 体内同步 setState）
  useEffect(() => {
    let cancelled = false
    Promise.all([window.mbApi.data.listItems({ type: 'equip' }), window.mbApi.data.listItems({ type: 'buff' })])
      .then(([equipRecords, buffRecords]) => {
        if (cancelled) return
        setItems({
          equips: equipRecords.map((record) => equipRecordToItem(record.data)),
          buffs: buffRecords.map((record) => buffRecordToItem(record.data)),
          error: null,
          loaded: true
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setItems({
          equips: [],
          buffs: [],
          error: error instanceof Error ? error.message : String(error),
          loaded: true
        })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const baseNames = useMemo(
    () =>
      Object.entries(system.attributes)
        .filter(([, attr]) => attr.type === 'base')
        .map(([name]) => name),
    [system]
  )

  const baseValues = useMemo(() => {
    const values: Record<string, number> = {}
    for (const name of baseNames) {
      values[name] = baseOverrides[name] ?? system.attributes[name].defaultValue
    }
    return values
  }, [baseNames, baseOverrides, system])

  const comparison = useMemo(
    () => computeEquipComparison(system, baseValues, Object.values(equipped), activeBuffs),
    [system, baseValues, equipped, activeBuffs]
  )

  const placeEquip = (item: EquipPreviewItem): void => {
    setMessage(null)
    if (!EQUIP_SLOTS.includes(item.slot)) {
      setMessage(`「${item.name}」的部位「${item.slot || '未填'}」不在可放置槽位（${EQUIP_SLOTS.join(' / ')}）`)
      return
    }
    setEquipped((prev) => ({ ...prev, [item.slot]: item }))
  }

  const removeEquip = (slot: string): void => {
    setEquipped((prev) => {
      const next = { ...prev }
      delete next[slot]
      return next
    })
  }

  const changeBase = (name: string, raw: string): void => {
    const text = raw.trim()
    if (text === '') {
      setBaseOverrides((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      return
    }
    const numeric = Number(text)
    if (!Number.isFinite(numeric)) return
    setBaseOverrides((prev) => ({ ...prev, [name]: numeric }))
  }

  const list = tab === 'equip' ? items.equips : items.buffs

  return (
    <div className="equip-preview">
      <div className="equip-preview-columns">
        <div className="equip-preview-list">
          <div className="equip-preview-tabs">
            <button
              type="button"
              className={`btn${tab === 'equip' ? ' primary' : ''}`}
              data-testid="equip-tab-equip"
              onClick={() => setTab('equip')}
            >
              装备（{items.equips.length}）
            </button>
            <button
              type="button"
              className={`btn${tab === 'buff' ? ' primary' : ''}`}
              data-testid="equip-tab-buff"
              onClick={() => setTab('buff')}
            >
              Buff（{items.buffs.length}）
            </button>
          </div>
          {items.error && <div className="form-error">{items.error}</div>}
          {items.loaded && list.length === 0 && (
            <div className="empty">{tab === 'equip' ? '暂无装备数据（可在数据表中添加）' : '暂无 Buff 数据（可在数据表中添加）'}</div>
          )}
          {list.map((item) => (
            <button
              type="button"
              className="equip-preview-item"
              key={`${tab}:${item.itemId}:${item.name}`}
              data-testid={`equip-item-${item.itemId}`}
              onClick={() => (tab === 'equip' ? placeEquip(item) : setActiveBuffs((prev) => [...prev, item]))}
            >
              <span className="equip-preview-item-name">{item.name}</span>
              <span className="item-meta">{item.slot}</span>
              <span className="equip-preview-item-bonus">{bonusText(item)}</span>
            </button>
          ))}
        </div>

        <div className="equip-preview-inspector">
          <div className="attr-live-section">
            <div className="attr-live-title">基础值（预览输入）</div>
            {baseNames.map((name) => (
              <div className="attr-live-row" key={name}>
                <span className="attr-live-name">{system.attributes[name].displayName}</span>
                <input
                  type="number"
                  step="any"
                  className="form-input attr-live-input"
                  data-testid={`equip-base-${name}`}
                  defaultValue={baseValues[name]}
                  onChange={(event) => changeBase(name, event.target.value)}
                />
              </div>
            ))}
          </div>

          <div className="attr-live-section">
            <div className="attr-live-title">装备槽（点击左侧装备放入，✕ 卸下）</div>
            {EQUIP_SLOTS.map((slot) => (
              <div className="equip-slot-row" key={slot} data-testid={`equip-slot-${slot}`}>
                <span className="equip-slot-name">{slot}</span>
                {equipped[slot] ? (
                  <>
                    <span className="equip-slot-item">{equipped[slot].name}</span>
                    <button
                      type="button"
                      className="btn slim danger"
                      data-testid={`equip-unequip-${slot}`}
                      title="卸下"
                      onClick={() => removeEquip(slot)}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <span className="item-meta">未装备</span>
                )}
              </div>
            ))}
          </div>

          <div className="attr-live-section">
            <div className="attr-live-title">已激活 Buff（点击左侧 Buff 添加，可重复）</div>
            {activeBuffs.length === 0 && <div className="item-meta">未激活 Buff</div>}
            {activeBuffs.map((buff, index) => (
              <div className="equip-slot-row" key={`${buff.itemId}:${index}`} data-testid={`equip-buff-${index}`}>
                <span className="equip-slot-item">{buff.name}</span>
                <span className="item-meta">{bonusText(buff)}</span>
                <button
                  type="button"
                  className="btn slim danger"
                  data-testid={`equip-buff-remove-${index}`}
                  title="移除"
                  onClick={() => setActiveBuffs((prev) => prev.filter((_, current) => current !== index))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {message && (
            <div className="form-error" data-testid="equip-message">
              {message}
            </div>
          )}
        </div>
      </div>

      <div className="attr-live-section">
        <div className="attr-live-title">属性对比（基础 → 装备/Buff 后）</div>
        {comparison.cycle && (
          <div className="form-error">属性系统存在循环依赖：{comparison.cycle.join(' → ')}，无法计算</div>
        )}
        <div className="equip-compare">
          {comparison.rows.map((row) => (
            <div className="equip-compare-row" key={row.name}>
              <span className="equip-compare-name">{row.displayName}</span>
              <span className="equip-compare-value" data-testid={`equip-compare-base-${row.name}`}>
                {formatPreviewNumber(row.base)}
              </span>
              <span className="equip-compare-arrow">→</span>
              <span className="equip-compare-value" data-testid={`equip-compare-final-${row.name}`}>
                {formatPreviewNumber(row.final)}
              </span>
              <span
                className={`equip-compare-diff${row.diff > 0 ? ' positive' : row.diff < 0 ? ' negative' : ''}`}
                data-testid={`equip-compare-diff-${row.name}`}
              >
                {row.diff > 0 ? `+${formatPreviewNumber(row.diff)}` : formatPreviewNumber(row.diff)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 条目加成摘要文本（最多 3 项，正负号） */
function bonusText(item: EquipPreviewItem): string {
  const parts: string[] = []
  for (const [name, value] of Object.entries(item.bonuses)) {
    parts.push(`${name}${value > 0 ? '+' : ''}${formatPreviewNumber(value)}`)
  }
  for (const [name, percent] of Object.entries(item.percentageBonuses)) {
    parts.push(`${name}${percent > 0 ? '+' : ''}${formatPreviewNumber(percent)}%`)
  }
  return parts.slice(0, 3).join(' ')
}