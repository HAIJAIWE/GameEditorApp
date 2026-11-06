import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import {
  renderRoleTasksMarkdown,
  taskRoleLabelForDoc,
  taskRolesForDoc
} from '@mobai/shared/ceshu/workflow'
import { isSoftwareDoc } from '@mobai/shared/ceshu/model'

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
} from '@mobai/shared/ceshu/workflow'

export function renderCeshuRoleTasksMarkdown(doc: CeshuDocument, role: string): string {
  return renderRoleTasksMarkdown(doc, role)
}

export function renderCeshuTasksMarkdown(doc: CeshuDocument): string {
  const isApp = isSoftwareDoc(doc)
  const meta = doc.meta as Record<string, unknown>
  const rawName = isApp
    ? (typeof meta.project_name === 'string' && meta.project_name.trim() !== '' ? meta.project_name : meta.game_name)
    : meta.game_name
  const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim()
    : isApp ? '未命名软件设计文档' : '未命名策划书'
  const roles = taskRolesForDoc(doc)
  const blocks = [
    `# 《${name}》· 岗位任务清单`,
    `> 按岗位拆分：${roles.map((role) => taskRoleLabelForDoc(doc, role)).join(' / ')}`
  ]
  for (const role of roles) {
    blocks.push(`## ${taskRoleLabelForDoc(doc, role)}任务\n\n${renderCeshuRoleTasksMarkdown(doc, role)}`)
  }
  return blocks.join('\n\n---\n\n') + '\n'
}
