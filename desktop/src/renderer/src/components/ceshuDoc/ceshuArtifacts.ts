/**
 * 左栏「产出物」切换的静态数据（2026-10-26 三栏布局：左=产出物+大纲，中=工作区，右=智能体）。
 *
 * `key` 同时是 `ceshu.artifact` 挂载点上的视图 id 前缀（`${key}.view`）；
 * `'doc'` 例外——它没有对应视图，渲染章节表单本体。
 */
export const ARTIFACTS = [
  { key: 'doc', label: '设计文档' },
  { key: 'prototype', label: '原型预览' },
  { key: 'data', label: '数据 / 机读' },
  { key: 'tasks', label: '岗位任务' }
] as const

export type ArtifactKey = (typeof ARTIFACTS)[number]['key']
