import { useEffect, useRef } from 'react'

import type { CeshuColumnDef, CeshuFieldDef } from '../../../shared/ceshu/reference/ceshuConstants'

/**
 * 策划书通用字段控件：由字段 schema（kind）驱动渲染，
 * 并提供「数据值 ↔ 控件编辑值」双向转换（stringList / pipeList / json 等复杂类型在此收敛）。
 */

/**
 * 多行字段的自动增高上限（px）。
 * 超过后回到内滚动 —— 无上限的话，一段几千字的 AI 生成内容会把整页拉成一条长带，
 * 反而更难扫读（要找下一个字段得滚很久）。
 */
const AUTO_GROW_MAX = 480

/**
 * 自动增高的多行输入。
 *
 * ## 为什么需要
 * `.form-textarea` 是固定 `min-height: 72px`，AI 生成的长段落只能在小框里**内滚动** ——
 * 而本项目的实际工作流是「AI 生成 → 人扫一遍」，读长文时在小框里滚是最反人类的。
 * 这里按 `scrollHeight` 撑到内容高度，到 `AUTO_GROW_MAX` 才封顶。
 *
 * ⚠️ jsdom 不实现 `scrollHeight`（恒为 0），故读到 0 时直接跳过，避免把高度设成 0
 * 而让组件测试里的布局断言失真。
 */
function AutoGrowTextarea(props: {
  id: string
  value: string
  placeholder?: string
  onChange: (next: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const next = el.scrollHeight
    if (next <= 0) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(next, AUTO_GROW_MAX)}px`
    el.style.overflowY = next > AUTO_GROW_MAX ? 'auto' : 'hidden'
  }, [props.value])

  return (
    <textarea
      ref={ref}
      id={props.id}
      data-testid={props.id}
      className="form-textarea"
      value={props.value}
      placeholder={props.placeholder}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}

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
      const lines = text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
      const columns = field.columns ?? []
      /*
       * 无列定义的 pipeList 按**字符串行**存（2026-10-26 修数据丢失）。
       *
       * 历史背景：这类字段用 `placeholder: '类别|数量|规格'` 描述列，但没声明 columns。
       * 此前无论有没有 columns 都按列拆成对象，于是无列字段的每一行都得到 `{}`——
       * 打开再保存一次，账本 / 数值断言 / 第三方依赖等 27 个字段的内容就被清空。
       * 而管道工具（ceshuPipeRows.toRows）本来就是按字符串行读取的，字符串才是正确形态。
       */
      if (columns.length === 0) return lines
      return lines.map((line) => {
        const parts = line.split('|').map((part) => part.trim())
        const row: Record<string, string> = {}
        for (const [index, column] of columns.entries()) {
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
        <AutoGrowTextarea
          id={id}
          value={String(value)}
          placeholder={placeholder}
          onChange={(next) => onChange(next)}
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

/** 列表显示：字符串原样；对象取 name/label/title/phase，否则序列化 */
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

/** 结构化行列表显示：对象按列顺序拼接，字符串原样 */
function joinPipeList(raw: unknown, columns: CeshuColumnDef[]): string {
  if (!Array.isArray(raw)) return ''
  return raw
    .map((item) => {
      if (typeof item === 'string') return item
      if (item !== null && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        /*
         * 无列定义时按对象自身的值顺序拼接：老模板 / 老数据可能以对象形态存在
         * （如 `{ type: '角色', count: 50 }`），此前会拼成空串，一保存就丢。
         */
        const values = columns.length > 0 ? columns.map((column) => obj[column.key]) : Object.values(obj)
        return values.map((value) => (value === null || value === undefined ? '' : String(value))).join(' | ')
      }
      return String(item)
    })
    .join('\n')
}