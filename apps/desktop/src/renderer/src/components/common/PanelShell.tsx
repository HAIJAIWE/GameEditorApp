import type { ReactNode } from 'react'

/**
 * 统一的面板内容外壳（Phase A）。
 *
 * ## 为什么需要它
 * 现在约 27 个浮层面板的容器各写各的：`SettingsPanel` 用 `.editor`、`SessionHistoryPanel` 用 `.panel`，
 * 还有一批自带布局。结果是**头部高度、正文内距、滚动归属、底部操作条位置**全不一致；
 * 长内容会把主操作顶出视口，短内容又把容器撑不满。
 *
 * ## 边界（重要）
 * **本组件不渲染窗口标题、也不渲染关闭按钮**——那是 `AppPanelOverlay`（浮层框）的职责。
 * 面板再画一遍标题/关闭就是双重标题、双重关闭（当前真实存在的问题）。
 * 这里只负责三件事：
 * 1. 可选**工具条**（副标题 / 筛选 / 刷新等，放 `toolbar`）；
 * 2. **可滚动正文**（`scroll` 默认 true，表格类自己管滚动时可关）；
 * 3. 可选**固定底栏**（主操作常驻，不被长内容顶走）。
 *
 * 结构：`.panel-shell > (.panel-shell-toolbar) + .panel-shell-body + (.panel-shell-footer)`。
 * 样式只用令牌，满足 `styleRatchet` 守卫。
 */
export interface PanelShellProps {
  /** 正文是否由外壳滚动（默认 true）。表格/画布类自己管滚动时传 false。 */
  scroll?: boolean
  /** 顶部工具条（副标题、筛选、刷新等）。不传则不渲染。 */
  toolbar?: ReactNode
  /** 底部固定操作条。不传则不渲染。 */
  footer?: ReactNode
  /** 额外 class（用于面板特有的布局微调）。 */
  className?: string
  /** 面板根节点的 `data-testid`（回归契约，迁移时逐字保留原值）。 */
  testId?: string
  children: ReactNode
}

export default function PanelShell({
  scroll = true,
  toolbar,
  footer,
  className,
  testId,
  children
}: PanelShellProps) {
  const classes = className === undefined ? 'panel-shell' : `panel-shell ${className}`
  return (
    <div className={classes} data-testid={testId}>
      {toolbar !== undefined && <div className="panel-shell-toolbar">{toolbar}</div>}
      <div className="panel-shell-body" data-scroll={scroll ? 'true' : 'false'}>
        {children}
      </div>
      {footer !== undefined && <div className="panel-shell-footer">{footer}</div>}
    </div>
  )
}
