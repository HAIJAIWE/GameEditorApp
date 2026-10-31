import type { CeshuDocument } from '../../../../shared/ceshu/reference'
import {
  CESHU_ROLE_LABELS,
  CESHU_ROLE_ORDER,
  renderRoleTasksMarkdown,
  type CeshuRole
} from '../../../../shared/ceshu/workflow'

/**
 * 岗位任务清单（Markdown 导出）。
 *
 * 岗位映射与任务收集已抽到 `shared/ceshuTasks.ts`（与 UI `CeshuTasksPanel` 共用单源），
 * 本文件只负责把结构渲染成 Markdown。
 */
export {
  CESHU_ROLE_LABELS,
  CESHU_ROLE_ORDER,
  ROLE_CHAPTERS,
  type CeshuRole
} from '../../../../shared/ceshu/workflow'

export function renderCeshuRoleTasksMarkdown(doc: CeshuDocument, role: CeshuRole): string {
  return renderRoleTasksMarkdown(doc, role)
}

export function renderCeshuTasksMarkdown(doc: CeshuDocument): string {
  const rawName = (doc.meta as Record<string, unknown>).game_name
  const gameName = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : '未命名策划书'
  const blocks = [
    `# 《${gameName}》· 岗位任务清单`,
    `> 按岗位拆分：${CESHU_ROLE_ORDER.map((role) => CESHU_ROLE_LABELS[role]).join(' / ')}`
  ]
  for (const role of CESHU_ROLE_ORDER) {
    blocks.push(`## ${CESHU_ROLE_LABELS[role]}任务\n\n${renderCeshuRoleTasksMarkdown(doc, role)}`)
  }
  return blocks.join('\n\n---\n\n') + '\n'
}
