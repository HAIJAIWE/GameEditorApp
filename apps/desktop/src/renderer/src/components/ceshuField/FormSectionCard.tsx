import { useState, type ReactNode } from 'react'

import { LucideIcon } from '../common'

/**
 * 可折叠分区卡片（条目编辑器字段分组用）。
 *
 * 复用全局 `.form-section*` 样式（`SettingsPanel` / `AgentEditorPanel` 等四个面板已在用），
 * 区别只在本组件的头部是**可点的 button**、带展开箭头 —— 静态样式的 `.form-section-head`
 * 本来就是按 button 写的（`cursor:pointer` + `border:none` + `width:100%`），直接复用。
 *
 * 折叠状态是**组件内 state**（不提升、不持久化）：每次打开条目都从默认态开始，
 * 用户点开的分区在同一会话内保持，切换条目不重置（key 用分区标题，稳定）。
 */
interface FormSectionCardProps {
  title: string
  icon: string
  /** 默认是否折叠 */
  defaultCollapsed?: boolean
  children: ReactNode
}

export default function FormSectionCard({
  title,
  icon,
  defaultCollapsed = false,
  children
}: FormSectionCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="form-section">
      <button
        type="button"
        className="form-section-head"
        data-testid="form-section-head"
        data-section={title}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((open) => !open)}
      >
        <span className="form-section-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="form-section-title">{title}</span>
        <LucideIcon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
      </button>
      {!collapsed && (
        <div className="form-section-body" data-testid="form-section-body" data-section={title}>
          {children}
        </div>
      )}
    </div>
  )
}
