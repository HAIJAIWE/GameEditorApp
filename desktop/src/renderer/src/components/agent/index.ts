/**
 * components/agent —— 策划书 AI 面板集合：字段「AI 帮我填」按钮、智能体编辑、MCP 配置，以及 AI 生成数据 / 整章生成 / 对抗式审阅。
 *
 * 外部一律从这里 import（`.../agent`），不要再深插目录内文件。
 */

export { AiFieldButton } from './AiFieldButton'
export { default as McpConfigPanel } from './McpConfigPanel'
export { default as AgentEditorPanel } from './AgentEditorPanel'
export { default as AiDataGenPanel } from './AiDataGenPanel'
export { default as AiFullGeneratePanel } from './AiFullGeneratePanel'
export { default as AiReviewPanel } from './AiReviewPanel'
