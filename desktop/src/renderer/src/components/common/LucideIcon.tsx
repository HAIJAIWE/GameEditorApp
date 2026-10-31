import { LUCIDE_ICON_ALIASES, LUCIDE_ICON_PATHS, type LucideIconName } from '../../../../shared/util/ui'

export interface LucideIconProps {
  /** 图标名（可为别名，如 `chevron-down` / `save`） */
  name: LucideIconName
  /** 边长（px）—— 对应 旧版 `get_icon(name, color, size)` 的 `size`，默认 18 */
  size?: number
  /**
   * 描边颜色。默认 `currentColor` —— 跟随文字色，方便用 CSS 统一控制；
   * 旧版 侧每次 `get_icon(name, 具体色, size)` 都传死色值，TS 侧改由 CSS 决定更省事。
   */
  color?: string
  className?: string
  /** 无障碍标题；不传则按装饰性图标处理（`aria-hidden`） */
  title?: string
}

/**
 * Lucide 图标（内嵌 SVG path 渲染，零依赖，MIT）。
 *
 * 对齐 旧版 `src/common/lucide_icon::get_icon()`：同样 24x24 viewBox、
 * `stroke-width 2.5`、圆头圆角、无填充；未收录的图标名**不渲染**（旧版 同场景
 * 返回空 `QIcon`，视觉效果一致），而不是抛错 —— 图标是装饰，不该让界面崩掉。
 */
export default function LucideIcon({ name, size = 18, color = 'currentColor', className, title }: LucideIconProps) {
  const realName = (LUCIDE_ICON_ALIASES as Record<string, string>)[name] ?? name
  const paths = LUCIDE_ICON_PATHS[realName]
  if (paths === undefined) return null

  const labelled = title !== undefined
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? 'img' : undefined}
      aria-hidden={labelled ? undefined : true}
      focusable="false"
    >
      {labelled && <title>{title}</title>}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
