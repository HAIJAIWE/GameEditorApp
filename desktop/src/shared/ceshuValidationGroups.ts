/**
 * 校验结果的分组归类（纯函数）。
 *
 * ## 为什么需要
 * `validateCeshu` 把 13 项检查的结果平铺成一个 `string[]`，面板与报告原样平铺展示 ——
 * 但「必填字段没写」和「术语叫法不统一」的紧急程度差一个量级，混在一起看会**失焦**。
 * 本模块按**严重度**（必须修复 / 建议检查）与**类别**（必填/格式/冲突/依赖/不一致/重复/术语）
 * 归类，让面板先给结论、再给细节。
 *
 * ## 分类依据
 * 依赖既有文案前缀（`一致性冲突：` / `内容重复警告：` / `术语不一致：` …）。
 * 这是**唯一事实来源在文案里**的既有设计，故此处按前缀匹配并单测锁定；
 * 新增检查项时若忘记在此登记，会落到 `other`（按「建议检查」展示），不会静默丢失。
 *
 * ## 与 `domain/ceshu/ceshuReports.ts::categorizeValidationError` 的分工
 * 后者是**导出的 Markdown 报告**用的五分类（required/conflict/warning/dep/other），
 * 刻意与 旧版 `validation_dialog._categorize` 逐字对齐（有测试锁定）；
 * 本模块服务**应用内面板**，分类更细（多出 格式异常/内容重复/术语不一致），
 * 两者不合并：一个求历史一致，一个求人看起来省力。
 */

export type ValidationSeverity = 'error' | 'warning'

export type ValidationKind =
  | 'required'
  | 'format'
  | 'conflict'
  | 'dependency'
  | 'inconsistency'
  | 'duplicate'
  | 'terminology'
  | 'other'

export interface ClassifiedValidationItem {
  message: string
  severity: ValidationSeverity
  kind: ValidationKind
  /** 类别中文标签（分组标题用） */
  kindLabel: string
}

export interface ValidationGroup {
  severity: ValidationSeverity
  kind: ValidationKind
  /** 分组标题，如「必填缺失」 */
  label: string
  items: ClassifiedValidationItem[]
}

/** 严重度展示文案 */
export const VALIDATION_SEVERITY_LABELS: Record<ValidationSeverity, string> = {
  error: '必须修复',
  warning: '建议检查'
}

/** 文案前缀 → 分类（顺序即优先级：先匹配更具体的前缀） */
const CLASSIFY_RULES: ReadonlyArray<{
  match: string
  severity: ValidationSeverity
  kind: ValidationKind
  label: string
}> = [
  { match: '为必填项', severity: 'error', kind: 'required', label: '必填缺失' },
  { match: '格式异常', severity: 'error', kind: 'format', label: '数据格式异常' },
  { match: '一致性冲突', severity: 'error', kind: 'conflict', label: '跨章冲突' },
  { match: '依赖缺失', severity: 'error', kind: 'dependency', label: '系统依赖缺失' },
  { match: '一致性警告', severity: 'warning', kind: 'inconsistency', label: '跨章不一致' },
  { match: '内容重复警告', severity: 'warning', kind: 'duplicate', label: '内容重复' },
  { match: '术语不一致', severity: 'warning', kind: 'terminology', label: '术语不一致' }
]

/** 分组展示顺序（严重度内按此序；other 垫底） */
const KIND_ORDER: readonly ValidationKind[] = [
  'required',
  'format',
  'conflict',
  'dependency',
  'inconsistency',
  'duplicate',
  'terminology',
  'other'
]

/** 单条文案归类（未登记的前缀按「建议检查·其他」处理，不吞掉） */
export function classifyValidationMessage(message: string): ClassifiedValidationItem {
  for (const rule of CLASSIFY_RULES) {
    if (message.includes(rule.match)) {
      return { message, severity: rule.severity, kind: rule.kind, kindLabel: rule.label }
    }
  }
  return { message, severity: 'warning', kind: 'other', kindLabel: '其他' }
}

/** 分组：必须修复在前，组内按类别顺序；空组不出现 */
export function groupValidationMessages(messages: readonly string[]): ValidationGroup[] {
  const groups = new Map<string, ValidationGroup>()
  for (const message of messages) {
    const item = classifyValidationMessage(message)
    const key = `${item.severity}:${item.kind}`
    const existing = groups.get(key)
    if (existing !== undefined) {
      existing.items.push(item)
      continue
    }
    groups.set(key, { severity: item.severity, kind: item.kind, label: item.kindLabel, items: [item] })
  }

  return [...groups.values()].sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === 'error' ? -1 : 1
    return KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind)
  })
}

/** 严重度计数（面板标题用：X 必须修复 · Y 建议检查） */
export function countValidationBySeverity(messages: readonly string[]): { errors: number; warnings: number } {
  let errors = 0
  let warnings = 0
  for (const message of messages) {
    if (classifyValidationMessage(message).severity === 'error') errors += 1
    else warnings += 1
  }
  return { errors, warnings }
}

/** 标题摘要文案（如「4 个必须修复 · 2 个建议检查」；无问题时返回空串） */
export function summarizeValidation(messages: readonly string[]): string {
  if (messages.length === 0) return ''
  const { errors, warnings } = countValidationBySeverity(messages)
  const parts: string[] = []
  if (errors > 0) parts.push(`${errors} 个必须修复`)
  if (warnings > 0) parts.push(`${warnings} 个建议检查`)
  return parts.join(' · ')
}
