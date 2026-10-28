import { useMemo, useState } from 'react'

import { baseAttrNames, computeLivePreview, derivedAndCombatNames } from '../../../shared/domain/attr/attrPreview'
import type { AttrSystem } from '../../../shared/attrSystem'

/**
 * 实时预览视图：
 * - 基础属性数值输入
 * - 装备固定加成（+X）与 Buff 百分比加成（+%，先装备后百分比）作用于基础属性
 * - 结果显示派生/战斗属性（战斗高亮），计算过程按段展示；「重置数值」恢复默认值与零加成
 * 说明：本视图是临时模拟（不写入草稿）；切换视图会重置模拟值。旧版 的「等级」控件无实际计算，未迁移。
 */

interface AttrLivePreviewProps {
  system: AttrSystem
}

export default function AttrLivePreview({ system }: AttrLivePreviewProps) {
  const [baseOverrides, setBaseOverrides] = useState<Record<string, number>>({})
  const [equipBonuses, setEquipBonuses] = useState<Record<string, number>>({})
  const [buffBonuses, setBuffBonuses] = useState<Record<string, number>>({})
  const [resetToken, setResetToken] = useState(0)

  const baseNames = useMemo(() => baseAttrNames(system), [system])
  const resultNames = useMemo(() => derivedAndCombatNames(system), [system])

  const baseValues = useMemo(() => {
    const values: Record<string, number> = {}
    for (const name of baseNames) {
      values[name] = baseOverrides[name] ?? system.attributes[name].defaultValue
    }
    return values
  }, [baseNames, baseOverrides, system])

  const preview = useMemo(
    () => computeLivePreview(system, { baseValues, equipBonuses, buffBonuses }),
    [system, baseValues, equipBonuses, buffBonuses]
  )

  /** 基础属性编辑：空值恢复默认值（重挂载显示默认）；非法输入忽略 */
  const changeBase = (name: string, raw: string): void => {
    const text = raw.trim()
    if (text === '') {
      setBaseOverrides((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      setResetToken((token) => token + 1)
      return
    }
    const numeric = Number(text)
    if (!Number.isFinite(numeric)) return
    setBaseOverrides((prev) => ({ ...prev, [name]: numeric }))
  }

  /** 装备/Buff 加成：空值或 ≤0 视为无加成 */
  const changeBonus = (kind: 'equip' | 'buff', name: string, raw: string): void => {
    const setter = kind === 'equip' ? setEquipBonuses : setBuffBonuses
    const text = raw.trim()
    const numeric = text === '' ? 0 : Number(text)
    if (!Number.isFinite(numeric)) return
    setter((prev) => {
      const next = { ...prev }
      if (numeric <= 0) delete next[name]
      else next[name] = numeric
      return next
    })
  }

  const handleReset = (): void => {
    setBaseOverrides({})
    setEquipBonuses({})
    setBuffBonuses({})
    setResetToken((token) => token + 1)
  }

  return (
    <div className="attr-live">
      <div className="attr-live-section">
        <div className="attr-live-title">基础属性（输入数值）</div>
        {baseNames.map((name) => (
          <div className="attr-live-row" key={name}>
            <span className="attr-live-name">{system.attributes[name].displayName}</span>
            <input
              type="number"
              step="any"
              className="form-input attr-live-input"
              key={`${name}:${resetToken}`}
              data-testid={`live-base-${name}`}
              defaultValue={baseValues[name]}
              onChange={(event) => changeBase(name, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="attr-live-section">
        <div className="attr-live-title">外部加成预览（装备固定加成 / Buff 百分比）</div>
        <div className="attr-live-row">
          <span className="attr-live-name" />
          <span className="attr-live-bonus-label">装备 +X</span>
          <span className="attr-live-bonus-label">Buff +%</span>
        </div>
        {baseNames.map((name) => (
          <div className="attr-live-row" key={name}>
            <span className="attr-live-name">{system.attributes[name].displayName}</span>
            <input
              type="number"
              className="form-input attr-live-bonus"
              key={`equip-${name}:${resetToken}`}
              data-testid={`live-equip-${name}`}
              min={0}
              max={10000}
              defaultValue={equipBonuses[name] ?? 0}
              onChange={(event) => changeBonus('equip', name, event.target.value)}
            />
            <input
              type="number"
              className="form-input attr-live-bonus"
              key={`buff-${name}:${resetToken}`}
              data-testid={`live-buff-${name}`}
              min={0}
              max={500}
              step="0.1"
              defaultValue={buffBonuses[name] ?? 0}
              onChange={(event) => changeBonus('buff', name, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="attr-live-section">
        <div className="attr-live-title">计算结果（派生 / 战斗属性）</div>
        {preview.cycle && (
          <div className="form-error">属性系统存在循环依赖：{preview.cycle.join(' → ')}，无法计算</div>
        )}
        <div className="attr-live-results">
          {resultNames.map((name) => (
            <div className="attr-live-result-row" key={name}>
              <span className="attr-live-name">{system.attributes[name].displayName}</span>
              <span
                className={`attr-live-result-value${system.attributes[name].type === 'combat' ? ' combat' : ''}`}
                data-testid={`live-result-${name}`}
              >
                {formatResult(preview.values[name] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="attr-live-section">
        <div className="attr-live-title">计算过程</div>
        <pre className="attr-live-process" data-testid="live-process">
          {preview.processLines.join('\n')}
        </pre>
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" data-testid="live-reset" onClick={handleReset}>
          重置数值
        </button>
      </div>
    </div>
  )
}

/** 结果展示：整数省略小数，否则 1 位 */
function formatResult(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}