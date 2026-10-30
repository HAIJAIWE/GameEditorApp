import { CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, type CeshuDocument, type ChapterKey } from '../reference/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../fields/ceshuFields'
import { displayFieldValue } from '../fields/ceshuFieldDisplay'
import { visibleChaptersForDoc } from '../model/ceshuModel'

/**
 * 岗位任务（单源）：`main/ceshu/export/tasks.ts`（导出 Markdown）与
 * `renderer/CeshuTasksPanel.tsx`（UI 渲染）共用，避免两套岗位映射漂移。
 */
export type CeshuRole = 'programmer' | 'artist' | 'tester' | 'numeric' | 'audio'

export const CESHU_ROLE_ORDER: readonly CeshuRole[] = ['programmer', 'artist', 'tester', 'numeric', 'audio']

export const CESHU_ROLE_LABELS: Record<CeshuRole, string> = {
  programmer: '程序',
  artist: '美术',
  tester: '测试',
  numeric: '数值',
  audio: '音频'
}

/** 岗位 → 相关章（章级映射，按项目实际可见章再裁剪） */
export const ROLE_CHAPTERS: Record<CeshuRole, readonly ChapterKey[]> = {
  programmer: ['gameplay', 'systems', 'combat', 'numeric', 'tech', 'performance', 'analytics'],
  artist: ['art', 'uiux', 'level_design', 'accessibility'],
  tester: ['qa', 'gameplay', 'combat', 'numeric', 'analytics'],
  numeric: ['numeric', 'economy', 'combat', 'monetization'],
  audio: ['audio']
}

export interface RoleTaskItem {
  key: string
  label: string
  value: string
  filled: boolean
  required: boolean
}

/**
 * 按章清单里字段值的展示上限。
 *
 * 这是**索引**不是全文：一份认真写完的策划书，把每个字段的值都抄进任务清单，
 * `tasks/*.md` 能占整个项目文件夹的 44%（实测 234KB / 533KB），而且列表里一屏看不到两行。
 * 真要读全文，去 `design/<章>.md`。
 */
export const ROLE_TASK_VALUE_LIMIT = 120

export interface RoleTaskSection {
  chapter: ChapterKey
  label: string
  items: RoleTaskItem[]
}

/* ------------------------------------------------------------------ */
/* AI 生成的岗位任务                                                    */
/* ------------------------------------------------------------------ */

/** 优先级：P0 不做就不能出可玩版本 / P1 首个完整版本 / P2 打磨 */
export type CeshuTaskPriority = 'P0' | 'P1' | 'P2'

export const CESHU_TASK_PRIORITIES: readonly CeshuTaskPriority[] = ['P0', 'P1', 'P2']

/**
 * 一条**可执行**任务（不是「某字段的文本」）。
 *
 * 与 `RoleTaskItem` 的区别是本质的：`RoleTaskItem` 是「文档里这章写了什么」的阅读清单，
 * 这里才是「这个岗位要动手做什么」。后者只能由 AI 从整份文档推出来。
 */
export interface CeshuRoleTask {
  /** 动作短语，≤20 字，动词开头 */
  title: string
  /** 做什么 + 验收点 */
  detail: string
  priority: CeshuTaskPriority
  /** 依据章（必须是该文档可见章之一） */
  source: ChapterKey
}

/** 岗位任务计划：只存生成过的岗位，没生成的岗位回落到派生清单 */
export type CeshuTaskPlan = Partial<Record<CeshuRole, CeshuRoleTask[]>>

/** 单岗位任务计划 → Markdown 正文（标题由调用方加，与派生清单保持同一形状） */
export function renderTaskPlanMarkdown(tasks: readonly CeshuRoleTask[]): string {
  const lines: string[] = []
  for (const priority of CESHU_TASK_PRIORITIES) {
    const group = tasks.filter((task) => task.priority === priority)
    if (group.length === 0) continue
    lines.push(`### ${priority}（${group.length} 项）`, '')
    for (const task of group) {
      lines.push(`- [ ] **${task.title}**（依据：${CHAPTER_LABELS[task.source]}）`)
      if (task.detail !== '') lines.push(`      ${task.detail}`)
    }
    lines.push('')
  }
  if (lines.length === 0) return '（本岗位暂无任务）'
  return `共 ${tasks.length} 项\n\n${lines.join('\n')}`.trim()
}

/** 收集某岗位的任务清单（必填或已填的字段；空的必填标待补） */
/** 单岗位任务 → Markdown（导出 / 项目文件夹共用） */
export function renderRoleTasksMarkdown(doc: CeshuDocument, role: CeshuRole): string {
  // 有 AI 生成的任务就用它——那才是岗位真正要干的活；没有才回落到按章清单
  const planned = doc.task_plan?.[role]
  if (planned !== undefined && planned.length > 0) return renderTaskPlanMarkdown(planned)

  const sections = collectRoleTasks(doc, role)
  const lines: string[] = []
  let count = 0
  for (const section of sections) {
    lines.push(`### ${section.label}（${section.items.length} 项）`, '')
    for (const item of section.items) {
      count += 1
      lines.push(`- [ ] **${item.label}**：${item.filled ? item.value : '（待补）'}`)
    }
    lines.push('')
  }
  if (lines.length === 0) return '（本岗位暂无相关任务）'
  return `共 ${count} 项\n\n${lines.join('\n')}`.trim()
}

export function collectRoleTasks(doc: CeshuDocument, role: CeshuRole): RoleTaskSection[] {
  const visible = new Set(visibleChaptersForDoc(doc))
  const sections: RoleTaskSection[] = []
  for (const chapter of ROLE_CHAPTERS[role]) {
    if (!visible.has(chapter)) continue
    const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
    const required = new Set(CHAPTER_REQUIRED_FIELDS[chapter] ?? [])
    const data = (doc[chapter] ?? {}) as Record<string, unknown>
    const items: RoleTaskItem[] = []
    for (const field of fields) {
      const isRequired = required.has(field.key)
      const full = displayFieldValue(field, data[field.key])
      const filled = full !== ''
      if (!isRequired && !filled) continue
      // 截断成「一眼能认出是哪段」的摘要；全文在 design/<章>.md 里
      const value =
        full.length > ROLE_TASK_VALUE_LIMIT ? `${full.slice(0, ROLE_TASK_VALUE_LIMIT)}…` : full
      items.push({ key: field.key, label: field.label, value, filled, required: isRequired })
    }
    if (items.length > 0) sections.push({ chapter, label: CHAPTER_LABELS[chapter], items })
  }
  return sections
}
