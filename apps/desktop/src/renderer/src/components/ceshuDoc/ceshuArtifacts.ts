/**
 * 左栏「产出物」切换的静态数据（2026-10-26 三栏布局：左=产出物+大纲，中=工作区，右=智能体）。
 *
 * `key` 同时是 `ceshu.artifact` 挂载点上的视图 id 前缀（`${key}.view`）；
 * `'doc'` 例外——它没有对应视图，渲染章节表单本体。
 */
export const ARTIFACTS = [
  { key: 'doc', label: 'Design doc', labelKey: 'ceshu.artifact.doc' },
  { key: 'prototype', label: 'Prototype', labelKey: 'ceshu.artifact.prototype' },
  { key: 'data', label: 'Data / machine-readable', labelKey: 'ceshu.artifact.data' },
  { key: 'tasks', label: 'Role tasks', labelKey: 'ceshu.artifact.tasks' }
] as const

export type ArtifactKey = (typeof ARTIFACTS)[number]['key']
