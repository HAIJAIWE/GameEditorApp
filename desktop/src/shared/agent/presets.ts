import { AGENT_DISPLAY } from '../ceshu/ceshuAiData'

/**
 * 智能体预设（借 dsh `ui-agent-preset` 的设计：对话前先选「视角/角色」）。
 *
 * 预设不是新模型，而是对话的**角色路由提示**——与 `ceshuAiData.ts` 的 `CHAPTER_AGENT_MAP`
 * 同源（章节起草按此路由到对应子智能体）。这里把它提升为 dock 头部的可选手选择器，
 * 让用户在开聊前就锁定视角，而不是每章隐式切换。
 *
 * 数据唯一来源 = `AGENT_DISPLAY`（标称展示名）。新增角色先改 `AGENT_DISPLAY`，这里自动跟随。
 */
export interface AgentPreset {
  id: string
  label: string
  description: string
}

export const AGENT_PRESETS: AgentPreset[] = Object.entries(AGENT_DISPLAY).map(([id, label]) => ({
  id,
  label,
  description: `以「${label}」视角参与对话（角色路由见 CHAPTER_AGENT_MAP）`
}))

/** 默认预设：通用策划助手（与 AGENT_DISPLAY 的 key 对齐） */
export const DEFAULT_PRESET_ID = '通用策划助手'

export function presetLabel(id: string): string {
  return AGENT_PRESETS.find((preset) => preset.id === id)?.label ?? id
}

/**
 * 各预设的角色定位（注入 system prompt 的视角说明；与 `AGENT_DISPLAY` 同源）。
 * 这是预设**唯一**的语义来源——新增角色先改 `AGENT_DISPLAY`，再在此补一行定位。
 * 仅一句聚焦提示：不重写整个 persona，避免与 `prompts.ts` 的身份骨架重复。
 */
export const PRESET_PERSONA: Record<string, string> = {
  game_designer: '你是资深游戏系统设计师，聚焦玩法 / 数值 / 战斗 / 经济系统的严谨性、平衡与可达性。',
  content_writer: '你是游戏文案写手，聚焦叙事、世界观与角色台词的质感与一致性。',
  data_analyst: '你是数据分析师，聚焦数值平衡、投放与留存的可量化判断。',
  code_assistant: '你是技术 / 代码助手，聚焦实现方案、架构与引擎落地的可行性。',
  通用策划助手: '你是通才策划助手，覆盖策划全领域，必要时引导到专项视角。'
}

/** 取预设的角色定位；未知 id 返回 null（调用方据此静默忽略） */
export function presetPersona(id: string): string | null {
  return PRESET_PERSONA[id] ?? null
}
