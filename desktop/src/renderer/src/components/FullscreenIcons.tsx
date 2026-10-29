/**
 * 全屏 / 退出全屏图标（内联 SVG，零依赖）。
 *
 * 从原 `RightBarTabs` 里挪出来：右栏停靠区改成 `MainViewMount` 后，
 * 全屏开关移到了页签条右端，图标仍需要共用这两个。
 */

export function ExpandIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 2H12v3.5M12 2L7.5 6.5M5.5 12H2V8.5M2 12l4.5-4.5" />
    </svg>
  )
}

export function CollapseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6.5H8.5V3M8.5 6.5L12 3M2 7.5h3.5V11M2 7.5L5.5 11" />
    </svg>
  )
}
