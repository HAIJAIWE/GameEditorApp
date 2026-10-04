/**
 * 系统确认纯逻辑（自 Python `ui/ceshu/system_confirm_dialog.py` 匹平迁移）。
 * 把「AI 生成策划书后弹出确认」对话框里的可测试逻辑抽成纯函数：
 *  - `formatFieldsPreview`：把某个系统的标准字段架构渲染成可读预览文本
 *  - `buildSystemConfirmResult`：根据最终勾选 + 自定义系统，产出新的 systems 映射
 * 注意：本模块不触碰 CeshuModel / 磁盘，输入原对象、返回新对象。
 */

import { SYSTEM_CONFIG_SCHEMA } from './systemConfigSchema'
import { SYSTEM_LABELS, type SystemEntry } from './ceshuConstants'

/** 字段预览最多展示的字段数（与 Python `_format_fields_preview` 的 `parts[:8]` 一致） */
export const FIELDS_PREVIEW_LIMIT = 8

/**
 * 渲染某系统的标准字段架构预览（对齐 Python `_format_fields_preview`）。
 * 仅当该系统在 SYSTEM_CONFIG_SCHEMA 中有定义时才产生预览；未定义的自定义系统返回空串。
 *
 * 字段行格式：`• {fname}（{label}, {kind}）{= current_val}`；超过 8 个追加「... 共 N 个字段」。
 * `current_val` 取自 config[fname]（Python 的 `config.get(fname, "")`），空值不展示。
 */
export function formatFieldsPreview(sysKey: string, config: Record<string, unknown> = {}): string {
  const fields = SYSTEM_CONFIG_SCHEMA[sysKey]
  if (!fields) return ''

  const parts: string[] = []
  for (const [fname, fieldDef] of Object.entries(fields)) {
    const kind = fieldDef.kind ?? 'text'
    const label = (fieldDef.label ?? fname).replace(/:+$/, '')
    const currentVal = config[fname]
    const valStr = currentVal !== undefined && currentVal !== null && currentVal !== '' ? ` = ${currentVal}` : ''
    parts.push(`• ${fname}（${label}, ${kind}）${valStr}`)
  }

  if (parts.length === 0) return ''
  if (parts.length <= FIELDS_PREVIEW_LIMIT) return parts.join('\n')
  return `${parts.slice(0, FIELDS_PREVIEW_LIMIT).join('\n')}\n... 共 ${parts.length} 个字段`
}

export interface SystemConfirmCustom {
  key: string
  name: string
}

export interface SystemConfirmResult {
  systems: Record<string, SystemEntry>
  /** 确认后处于启用状态的系统键（含自定义系统） */
  enabledKeys: string[]
}

function asSystemEntry(value: unknown, fallbackKey: string): SystemEntry {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entry = { ...(value as Record<string, unknown>) } as SystemEntry
    if (typeof entry.enabled !== 'boolean') entry.enabled = false
    if (typeof entry.name !== 'string' || entry.name === '') entry.name = fallbackKey
    if (typeof entry.config !== 'object' || entry.config === null || Array.isArray(entry.config)) {
      entry.config = {}
    }
    return entry
  }
  return { enabled: false, name: fallbackKey, config: {} }
}

/**
 * 根据最终勾选 + 自定义系统，产出新的 systems 映射（对齐 Python `SystemConfirmDialog._on_confirm`）。
 *
 * 规则：
 *  - 既有系统：enabled 由 enabledKeys 决定（未勾选置 false，已勾选置 true），name/config 保留；
 *  - 自定义系统（customSystems）：若已存在则置 enabled=true 并写入 name；若不存在则新增
 *    `{ enabled: true, name, config: { note: '自定义系统' } }`（对齐 Python `add_system` + 写 name）；
 *  - 返回 enabledKeys 为结果中实际启用的全部系统键（含自定义）。
 */
export function buildSystemConfirmResult(
  systems: Record<string, SystemEntry>,
  enabledKeys: string[],
  customSystems: SystemConfirmCustom[] = []
): SystemConfirmResult {
  const enabled = new Set(enabledKeys)
  const next: Record<string, SystemEntry> = {}

  for (const [key, entry] of Object.entries(systems)) {
    const cloned = asSystemEntry(entry, key)
    cloned.enabled = enabled.has(key)
    next[key] = cloned
  }

  for (const custom of customSystems) {
    const key = custom.key
    if (key in next) {
      next[key] = { ...next[key], enabled: true, name: custom.name }
    } else {
      next[key] = { enabled: true, name: custom.name, config: { note: '自定义系统' } }
    }
  }

  const finalEnabledKeys = Object.keys(next).filter((key) => next[key].enabled === true)
  return { systems: next, enabledKeys: finalEnabledKeys }
}

/** 系统展示名：未设置 name 时回退到 SYSTEM_LABELS 再回退到 key */
export function systemDisplayName(key: string, entry: SystemEntry | undefined): string {
  if (entry && typeof entry.name === 'string' && entry.name) return entry.name
  return SYSTEM_LABELS[key] ?? key
}
