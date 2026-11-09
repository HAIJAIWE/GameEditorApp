/**
 * 编辑器动作桥（Slice 16）。
 *
 * 「更多」菜单里有两类动作：
 * - **视图类**（开发路线/体检/版本对比/…）：命令直接调 `host.openView(id)`，不需要桥；
 * - **非视图类**（补全空白字段 / 完备度 / 变更记录 / 导出项目 / 导出交接包）：它们是 CeshuView
 *   的局部 handler（读写编辑器 state、走 IPC），插件拿不到 → 由本桥暴露成函数，CeshuView 注入。
 *
 * 与 `hostBridge` / `appActionsIo` 同一路数：注入式单例，缺实现时静默降级。
 */
export interface CeshuEditorBridge {
  autoFill: () => void
  showReadiness: () => void
  showChangelog: () => void
  exportProject: () => void
  exportHandoff: () => void
  /** 导出交接包 + 生成派工单 + 预填进智能体输入框（一键把活交给编码智能体） */
  startAiDev: () => void
}

let bridge: CeshuEditorBridge | null = null

export function setCeshuEditorBridge(next: CeshuEditorBridge | null): void {
  bridge = next
}

export function editorAutoFill(): void {
  bridge?.autoFill()
}

export function editorShowReadiness(): void {
  bridge?.showReadiness()
}

export function editorShowChangelog(): void {
  bridge?.showChangelog()
}

export function editorExportProject(): void {
  bridge?.exportProject()
}

export function editorExportHandoff(): void {
  bridge?.exportHandoff()
}

export function editorStartAiDev(): void {
  bridge?.startAiDev()
}
