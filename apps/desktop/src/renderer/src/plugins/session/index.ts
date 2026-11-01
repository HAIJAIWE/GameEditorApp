/**
 * plugins/session —— 会话插件：数字员工面板、会话历史、工具视图绑定、智能体团队与轨迹区块。
 *
 * 外部一律从这里 import（`.../session`），不要再深插目录内文件。
 */

export { AgentTeamSection } from './agentTeamSection'
export { defineDigitalPanelPlugin } from './digitalPanelPlugin'
export { defineSessionHistoryPlugin } from './sessionHistoryPlugin'
export { defineSessionPlugin } from './sessionPlugin'
export { getToolViewBinding, registerToolViewBinding } from './toolViewBindings'
export type { ToolViewRender } from './toolViewBindings'
export { TrajectorySection } from './trajectorySection'
