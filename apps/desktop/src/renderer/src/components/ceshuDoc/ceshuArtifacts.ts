/**
 * 左栏「产出物」切换的静态数据（2026-10-26 三栏布局：左=产出物+大纲，中=工作区，右=智能体）。
 *
 * `key` 同时是 `ceshu.artifact` 挂载点上的视图 id 前缀（`${key}.view`）；
 * `'doc'` 例外——它没有对应视图，渲染章节表单本体。
 *
 * 2026-11-09 「施工看板」从**内容槽**（`ceshu.content`，整块替换内容区、连左栏大纲一起消失）
 * 改挂到**产出物页签**（`ceshu.artifact`，只换中间工作区，左栏还在）。
 * 原因：看板是"边看边改"的窗口，原先开着它就点不到章节，只能反复开关 —— 用户实测反馈的
 * "来回切"。挂到产出物页签后，切回「设计文档」即可继续编辑。
 */
export const ARTIFACTS = [
  { key: 'doc', label: 'Design doc', labelKey: 'ceshu.artifact.doc' },
  { key: 'prototype', label: 'Prototype', labelKey: 'ceshu.artifact.prototype' },
  { key: 'data', label: 'Data / machine-readable', labelKey: 'ceshu.artifact.data' },
  { key: 'tasks', label: 'Role tasks', labelKey: 'ceshu.artifact.tasks' },
  { key: 'workboard', label: 'Work board', labelKey: 'ceshu.artifact.workboard' }
] as const

export type ArtifactKey = (typeof ARTIFACTS)[number]['key']
