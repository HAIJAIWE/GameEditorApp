/**
 * components/digital —— 数字员工（AI 会话）面板。
 *
 * 按 UI 能力分子目录（对齐 dsh `packages/client/ui-*` 的「一能力一文件夹」）：
 * - `chat/`       对话主体（DigitalPanel / 消息 / markdown / 运行状态）
 * - `views/`      面板内各类列表，已按能力拆文件：`approval` / `steps`(digitalPanelViews) /
 *                 `subagent` / `jobs` / `workspace` / `menus` / `tasks`
 * - `attachments/`附件（待发送 chip / 读图 hook / 附件 hook）
 * - `commands/`   斜杠命令与快捷键
 * - `cards/`      交付卡 / 改动卡
 * - `jobs/`       后台任务轮询 hook
 * - `workspace/`  代码工作区 hook
 * - `runplan/`    运行计划进度条
 * - `dragdrop/`   拖拽遮罩 / 字段操作条
 * - `hooks/`      其余面板状态 hooks
 * - `api/`        面板 IPC 契约类型
 *
 * 外部一律从这里 import（`.../digital`），不要再深插子目录。
 */

export type { ChatMarkdownProps } from './chat/ChatMarkdown'
export { default as ChatMarkdown } from './chat/ChatMarkdown'
export { DropOverlay } from './dragdrop/DropOverlay'
// 快捷键清单已合并到 shared 的单一事实源（`SHORTCUT_CATALOG`）。
// 这里保留旧名 re-export，避免既有 `from '.../digital'` 的调用点被迫改动。
export { SHORTCUT_CATALOG as SHORTCUTS } from '@mobai/shared/util/ui'
export type { ShortcutEntry } from '@mobai/shared/util/ui'
export { useAttachmentImage } from './attachments/useAttachmentImage'
export { DigitalChangeCard, DigitalChangeList, formatTime } from './cards/DigitalChangeCard'
export { DigitalDeliveryCard } from './cards/DigitalDeliveryCard'
export { DigitalMessageItem, copyToClipboard } from './chat/DigitalMessageItem'
export type { DigitalMessageItemProps } from './chat/DigitalMessageItem'
export { default as DigitalPanel } from './chat/DigitalPanel'
export { DigitalRunPlan } from './runplan/DigitalRunPlan'
export { default as FieldActionStrip } from './dragdrop/FieldActionStrip'
export { PendingAttachments } from './attachments/PendingAttachments'
export { ShortcutsDialog } from './commands/ShortcutsDialog'
export type { ChatApi } from './api/digitalPanelApi'
export { ContextMeter, ConversationRunStatus } from './chat/digitalPanelParts'
export { DigitalApproval, DigitalCommandMenu, DigitalJobList, DigitalReferenceMenu, DigitalStepList, DigitalSubagentList, DigitalTaskList, DigitalWorkspaceBar } from './views/digitalPanelViews'
export type { ToolViewResolver } from './views/digitalPanelViews'
export { useDigitalPanelAttachments } from './attachments/useDigitalPanelAttachments'
export type { DigitalPanelAttachments } from './attachments/useDigitalPanelAttachments'
export { useDigitalPanelCommands } from './commands/useDigitalPanelCommands'
export type { DigitalPanelCommands } from './commands/useDigitalPanelCommands'
export { useDigitalPanelDrafts } from './hooks/useDigitalPanelDrafts'
export type { DigitalPanelDrafts } from './hooks/useDigitalPanelDrafts'
export { useDigitalPanelInteraction } from './hooks/useDigitalPanelInteraction'
export type { DigitalPanelInteraction } from './hooks/useDigitalPanelInteraction'
export { useDigitalPanelModelMenu } from './hooks/useDigitalPanelModelMenu'
export type { DigitalPanelModelMenu } from './hooks/useDigitalPanelModelMenu'
export { useDigitalPanelStopArm } from './hooks/useDigitalPanelStopArm'
export type { DigitalPanelStopArm } from './hooks/useDigitalPanelStopArm'
export { useDigitalPanelTurnArtifacts } from './hooks/useDigitalPanelTurnArtifacts'
export type { DigitalPanelTurnArtifacts } from './hooks/useDigitalPanelTurnArtifacts'
