/**
 * 代码工作区栏（对齐 dsh fs-sandbox 的 `cwd`）：显示 agent 的 file_ops / shell 被围栏的根目录，
 * 「选择…」弹目录选择。纯展示，数据由 `useDigitalWorkspace` 提供。
 */
export function DigitalWorkspaceBar({
  root,
  onChoose
}: {
  root: string
  onChoose?: () => void
}) {
  if (root === '') return null
  return (
    <div className="digital-workspace" data-testid="digital-workspace">
      <span className="home-section-label">工作区</span>
      <span className="digital-workspace-path" data-testid="digital-workspace-path" title={root}>
        {root}
      </span>
      {onChoose !== undefined && (
        <button
          type="button"
          className="btn-link"
          data-testid="digital-workspace-choose"
          onClick={onChoose}
        >
          选择…
        </button>
      )}
    </div>
  )
}
