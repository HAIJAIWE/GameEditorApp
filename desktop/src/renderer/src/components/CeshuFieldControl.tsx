import type { CeshuColumnDef, CeshuFieldDef } from '../../../shared/ceshuConstants'

/**
 * 策划书通用字段控件：由字段 schema（kind）驱动渲染，
 * 并提供「数据值 ↔ 控件编辑值」双向转换（stringList / pipeList / json 等复杂类型在此收敛）。
 */

export type FieldInput = string | number | boolean | string[]

interface FieldControlProps {
  field: CeshuFieldDef
  value: FieldInput
  onChange: (next: FieldInput) => void
  testId?: string
}

/** 数据值 → 控件编辑值 */
export function fieldValueToInput(field: CeshuFieldDef, raw: unknown): FieldInput {
  switch (field.kind) {
    case 'number':
      return typeof raw === 'number' ? raw : Number(raw ?? 0) || 0
    case 'checkbox':
      return raw === true
    case 'multiCombo':
      return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
    case 'stringList':
      return joinList(raw, field.separator === 'comma' ? ', ' : '\n')
    case 'pipeList':
      return joinPipeList(raw, field.columns ?? [])
    case 'json':
      return raw === undefined ? '{}' : JSON.stringify(raw, null, 2)
    default:
      return typeof raw === 'string' ? raw : raw === null || raw === undefined ? '' : String(raw)
  }
}

/** 控件编辑值 → 数据值（json/pipeList 内容非法时抛错，由表单展示错误） */
export function inputToFieldValue(field: CeshuFieldDef, input: FieldInput): unknown {
  switch (field.kind) {
    case 'number':
      return typeof input === 'number' ? input : Number(input) || 0
    case 'checkbox':
      return input === true
    case 'stringList': {
      const text = String(input)
      const parts = field.separator === 'comma' ? text.split(',') : text.split('\n')
      return parts.map((part) => part.trim()).filter((part) => part !== '')
    }
    case 'pipeList': {
      const text = String(input).trim()
      if (!text) return []
      return text
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => {
          const parts = line.split('|').map((part) => part.trim())
          const row: Record<string, string> = {}
          for (const [index, column] of (field.columns ?? []).entries()) {
            row[column.key] = parts[index] ?? ''
          }
          return row
        })
    }
    case 'json': {
      const text = String(input).trim()
      if (!text) return {}
      try {
        return JSON.parse(text)
      } catch {
        throw new Error(`「${field.label}」不是合法的 JSON`)
      }
    }
    default:
      return typeof input === 'string' ? input : String(input)
  }
}

export function CeshuFieldControl({ field, value, onChange, testId }: FieldControlProps) {
  const id = testId ?? `ceshu-field-${field.key}`

  if (field.kind === 'textarea' || field.kind === 'stringList' || field.kind === 'pipeList' || field.kind === 'json') {
    const placeholder =
      field.placeholder ??
      (field.kind === 'pipeList'
        ? `每行一条：${(field.columns ?? []).map((column) => column.label).join(' | ')}`
        : field.kind === 'json'
          ? 'JSON 格式'
          : '')
    return (
      <div className="form-row">
        <label className="form-label" htmlFor={id}>
          {field.label}
        </label>
        <textarea
          id={id}
          data-testid={id}
          className="form-textarea"
          value={String(value)}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    )
  }

  if (field.kind === 'number') {
    return (
      <div className="form-row">
        <label className="form-label" htmlFor={id}>
          {field.label}
        </label>
        <input
          id={id}
          data-testid={id}
          type="number"
          className="form-input"
          value={typeof value === 'number' ? value : Number(value) || 0}
          min={field.from}
          max={field.to}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    )
  }

  if (field.kind === 'combo') {
    return (
      <div className="form-row">
        <label className="form-label" htmlFor={id}>
          {field.label}
        </label>
        <select
          id={id}
          data-testid={id}
          className="form-select"
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">（未设置）</option>
          {(field.values ?? []).map((option) => (
            <option key={option} value={option}>
              {field.optionLabels?.[option] ?? option}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (field.kind === 'multiCombo') {
    const selected = Array.isArray(value) ? value : []
    return (
      <div className="form-row">
        <span className="form-label">{field.label}</span>
        <div className="check-group" data-testid={id}>
          {(field.values ?? []).map((option) => (
            <label key={option} className="check-option">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option]
                    : selected.filter((item) => item !== option)
                  onChange(next)
                }}
              />
              {field.optionLabels?.[option] ?? option}
            </label>
          ))}
        </div>
      </div>
    )
  }

  if (field.kind === 'checkbox') {
    return (
      <div className="form-row">
        <label className="check-option">
          <input
            type="checkbox"
            data-testid={id}
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          {field.label}
        </label>
      </div>
    )
  }

  return (
    <div className="form-row">
      <label className="form-label" htmlFor={id}>
        {field.label}
      </label>
      <input
        id={id}
        data-testid={id}
        type="text"
        className="form-input"
        value={String(value)}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** 列表显示：字符串原样；对象取 name/label/title/phase，否则序列化（对齐 Python _join_items 容错） */
function joinList(raw: unknown, separator: string): string {
  if (!Array.isArray(raw)) return ''
  return raw
    .map((item) => {
      if (typeof item === 'string') return item
      if (item !== null && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const name = obj.name ?? obj.label ?? obj.title ?? obj.phase
        return typeof name === 'string' && name ? name : JSON.stringify(obj)
      }
      return String(item)
    })
    .join(separator)
}

/** 结构化行列表显示：对象按列顺序拼接，字符串原样（对齐 Python 管道分隔编辑格式） */
function joinPipeList(raw: unknown, columns: CeshuColumnDef[]): string {
  if (!Array.isArray(raw)) return ''
  return raw
    .map((item) => {
      if (typeof item === 'string') return item
      if (item !== null && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        return columns.map((column) => (obj[column.key] === null || obj[column.key] === undefined ? '' : String(obj[column.key]))).join(' | ')
      }
      return String(item)
    })
    .join('\n')
}