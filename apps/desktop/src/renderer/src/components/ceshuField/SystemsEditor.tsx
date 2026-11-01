import { SYSTEM_LABELS, type ChapterData } from '@mobai/shared/ceshu/reference'
import { isPlainObject } from '@mobai/shared/ceshu/model'
import { SYSTEM_CONFIG_SCHEMA } from '@mobai/shared/ceshu/model'

import { CeshuFieldControl, fieldValueToInput, inputToFieldValue } from './CeshuFieldControl'

interface SystemsEditorProps {
  systems: ChapterData
  onChange: (next: ChapterData) => void
}

interface SystemEntryValue {
  enabled: boolean
  name: string
  config: Record<string, unknown>
  [key: string]: unknown
}

/**
 * 游戏系统编辑器（第四章）：逐系统启用开关 + 标准 config 字段表单。
 * config 控件由 SYSTEM_CONFIG_SCHEMA驱动。
 */
export default function SystemsEditor({ systems, onChange }: SystemsEditorProps) {
  const standardKeys = Object.keys(SYSTEM_CONFIG_SCHEMA)
  const extraKeys = Object.keys(systems).filter((key) => !(key in SYSTEM_CONFIG_SCHEMA))
  const order = [...standardKeys, ...extraKeys]

  const updateEntry = (key: string, patch: Partial<SystemEntryValue>): void => {
    const current = normalizeEntry(systems[key], key)
    onChange({ ...systems, [key]: { ...current, ...patch } })
  }

  return (
    <div className="systems-editor" data-testid="systems-editor">
      {order.map((key) => {
        const entry = normalizeEntry(systems[key], key)
        const schema = SYSTEM_CONFIG_SCHEMA[key] ?? {}
        return (
          <div className="system-row" key={key}>
            <label className="system-head">
              <input
                type="checkbox"
                data-testid={`system-toggle-${key}`}
                checked={entry.enabled}
                onChange={(event) => updateEntry(key, { enabled: event.target.checked })}
              />
              {SYSTEM_LABELS[key] ?? entry.name ?? key}
            </label>
            {entry.enabled && Object.keys(schema).length > 0 && (
              <div className="system-config">
                {Object.entries(schema).map(([fieldKey, def]) => {
                  const field = { key: fieldKey, ...def }
                  const input = fieldValueToInput(field, entry.config[fieldKey])
                  return (
                    <CeshuFieldControl
                      key={fieldKey}
                      field={field}
                      value={input}
                      testId={`system-field-${key}-${fieldKey}`}
                      onChange={(next) =>
                        updateEntry(key, {
                          config: { ...entry.config, [fieldKey]: inputToFieldValue(field, next) }
                        })
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** 归一化系统条目：容忍旧数据缺 name/config，保留未知键 */
function normalizeEntry(raw: unknown, key: string): SystemEntryValue {
  const source = isPlainObject(raw) ? raw : {}
  const name = typeof source.name === 'string' && source.name ? source.name : (SYSTEM_LABELS[key] ?? key)
  return {
    ...source,
    enabled: source.enabled === true,
    name,
    config: isPlainObject(source.config) ? source.config : {}
  }
}