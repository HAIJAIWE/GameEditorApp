import { useState, type ReactNode } from 'react'

/**
 * 条目编辑器的分区卡片（对应 Python `ui/widgets/collapsible_section.py::CollapsibleSection`）。
 *
 * 折叠状态用受控 state（而非原生 `<details open>`）：原生 `open` 属性在 React 重渲染时会与
 * 用户手动切换的结果冲突，受控 state 行为确定且可被 E2E 稳定断言。
 */

interface FormSectionCardProps {
  title: string
  icon: string
  /** 默认是否折叠（来自分区定义） */
  collapsed: boolean
  /** 生成 data-testid（如 `form-section-0`） */
  testId: string
  children: ReactNode
}

export default function FormSectionCard({
  title,
  icon,
  collapsed,
  testId,
  children
}: FormSectionCardProps) {
  const [open, setOpen] = useState(!collapsed)

  return (
    <section className={`form-section${open ? '' : ' collapsed'}`} data-testid={testId}>
      <button
        type="button"
        className="form-section-head"
        data-testid={`${testId}-toggle`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {icon !== '' && <span className="form-section-icon">{icon}</span>}
        <span className="form-section-title">{title}</span>
        <span className="form-section-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="form-section-body">{children}</div>}
    </section>
  )
}
