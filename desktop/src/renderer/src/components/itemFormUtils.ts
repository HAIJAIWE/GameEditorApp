import { attrListToRows, rowsToAttrList, type AttrRow } from '../../../shared/domain/attr/attrList'
import { attrPanelToRows, defaultAttrPanelRows, rowsToAttrPanel, type AttrPanelRow } from '../../../shared/domain/attr/attrPanel'
import { canParseAsDropTable, normalizeDropEntries, serializeDropEntries, type DropEntry } from '../../../shared/util/dropTable'
import { canParseAsRefTable, normalizeRefEntries, serializeRefEntries, type ReferenceEntry } from '../../../shared/util/refTable'
import type { ItemRecord, TypeFieldDef } from '../../../shared/types'

export function usesJsonEditor(field: TypeFieldDef, value: unknown): boolean {
  if (field.type === 'droptable') return !canParseAsDropTable(value)
  if (field.type === 'multiselect') return !canParseAsRefTable(value)
  return false
}

export function asAttrRows(value: unknown): AttrRow[] {
  return Array.isArray(value) ? (value as AttrRow[]) : []
}

export function asAttrPanelRows(value: unknown): AttrPanelRow[] {
  return Array.isArray(value) ? (value as AttrPanelRow[]) : []
}

export function asRefEntries(value: unknown): ReferenceEntry[] {
  return Array.isArray(value) ? (value as ReferenceEntry[]) : []
}

export function asDropEntries(value: unknown): DropEntry[] {
  return Array.isArray(value) ? (value as DropEntry[]) : []
}

export function buildInitialDraft(
  data: Record<string, unknown>,
  fields: TypeFieldDef[],
  typeId: string
): Record<string, unknown> {
  const draft: Record<string, unknown> = { ...data }
  for (const field of fields) {
    const value = data[field.name]
    if (field.type === 'attrtable') {
      draft[field.name] = attrListToRows(value)
    } else if (field.type === 'attrpanel') {
      // 对应 Python load_data：无有效数据时套用该类型的默认模板（role=新手 / monster=小怪）
      const rows = attrPanelToRows(value)
      draft[field.name] = rows.length > 0 ? rows : defaultAttrPanelRows(typeId)
    } else if (usesJsonEditor(field, value)) {
      draft[field.name] = value === undefined || value === null ? '' : JSON.stringify(value, null, 2)
    } else if (field.type === 'multiselect') {
      draft[field.name] = normalizeRefEntries(value)
    } else if (field.type === 'droptable') {
      draft[field.name] = normalizeDropEntries(value)
    } else if (field.type === 'spinbox' || field.type === 'double_spin') {
      draft[field.name] = value === undefined || value === null ? '' : String(value)
    } else if (field.type === 'tags') {
      draft[field.name] = Array.isArray(value) ? value.join(', ') : (value ?? '')
    }
  }
  return draft
}

export function buildPayload(
  draft: Record<string, unknown>,
  fields: TypeFieldDef[],
  jsonFields: Set<string>
): Record<string, unknown> {
  // 以完整 draft 为底，保留 schema 未收录的扩展字段（导入数据可能携带）
  const payload: Record<string, unknown> = { ...draft }

  for (const field of fields) {
    const name = field.name
    const raw = draft[name]

    if (field.type === 'attrtable') {
      payload[name] = rowsToAttrList(asAttrRows(raw), field.label)
      continue
    }
    if (field.type === 'attrpanel') {
      payload[name] = rowsToAttrPanel(asAttrPanelRows(raw))
      continue
    }
    if (jsonFields.has(name)) {
      if (typeof raw !== 'string' || raw.trim() === '') {
        delete payload[name]
        continue
      }
      try {
        payload[name] = JSON.parse(raw)
      } catch {
        throw new Error(`字段「${field.label}」不是合法 JSON`)
      }
      continue
    }
    if (field.type === 'spinbox' || field.type === 'double_spin') {
      if (raw === '' || raw === null || raw === undefined) {
        delete payload[name]
        continue
      }
      const numeric = Number(raw)
      if (!Number.isFinite(numeric)) {
        throw new Error(`字段「${field.label}」需要数字`)
      }
      payload[name] = numeric
      continue
    }
    if (field.type === 'multiselect') {
      payload[name] = serializeRefEntries(asRefEntries(raw))
      continue
    }
    if (field.type === 'droptable') {
      payload[name] = serializeDropEntries(asDropEntries(raw))
      continue
    }
    if (field.type === 'tags' && typeof raw === 'string') {
      payload[name] = raw
        .split(/[,，]/)
        .map((part) => part.trim())
        .filter(Boolean)
    }
  }
  return payload
}

export function itemNameOf(record: ItemRecord): string {
  const name = record.data.name
  return typeof name === 'string' && name !== '' ? name : record.id
}
