/**
 * AI 产品设计文档规格（SDD + 模型层）——AI 档的独立章表。
 *
 * 与游戏 GDD / 应用 SDD **完全并列**：章 key、章名、章号、分区、AI 子智能体、岗位都是
 * 自己的，复用应用 SDD 的字段语义（见 `aiSchema/chapters.ts` 对 `APP_CHAPTER_FIELDS`
 * 的复用）但拥有独立命名空间。章号由 `AI_PARTS` 顺序派生（1..20 连续）。
 *
 * 章表依据调研结论（2026-11-07）：AI 产品**本质是软件产品**，故软件设计部分（需求→功能→
 * 架构→接口/数据→非功能→测试→发布→风险）沿用 SDD 范式；但 AI 独有「模型层」四章
 * （模型卡 / 数据表 / 系统卡 / 评测与红队）是应用 SDD 装不下的标准化产物。
 */
import {
  AI_AGENT_DISPLAY,
  AI_AGENT_PROMPTS,
  AI_CHAPTER_FIELDS,
  AI_CHAPTER_KEYS,
  AI_CHAPTER_LABELS,
  AI_CHAPTER_NAMES,
  AI_META_KEY,
  AI_NUMBERED_KEYS,
  AI_PARTS,
  AI_REVIEW_ROLE_NOUN,
  AI_ROLES,
  AI_SYSTEM_DOC_NOUN,
  aiChapterAi,
  aiPartOf,
  aiRequiredFields
} from '../aiSchema'
import type { DocumentSpec, SpecChapter } from './types'

// 章表 / 标签 / 章号 / 分区 / AI 元数据的唯一事实源都在 `aiSchema/`；
// 这里 re-export 保持既有对外 API（documentSpec/index.ts 与测试都从这里取）。
export {
  AI_AGENT_DISPLAY,
  AI_AGENT_PROMPTS,
  AI_META_KEY,
  AI_PARTS,
  AI_ROLES
} from '../aiSchema'


/** 规格章表必须与 aiSchema 字段表一一对应（缺一章就抛错，避免规格与内容脱节） */
for (const key of AI_CHAPTER_KEYS) {
  if ((AI_CHAPTER_FIELDS[key] ?? []).length === 0) {
    throw new Error(`AI 规格的章在 aiSchema 里没有字段定义: ${key}`)
  }
}

function chaptersForSpec(): SpecChapter[] {
  return AI_CHAPTER_KEYS.map((key) => {
    const requiredFields = aiRequiredFields(key)
    const ai = aiChapterAi(key)
    return {
      key,
      name: AI_CHAPTER_NAMES[key],
      label: AI_CHAPTER_LABELS[key],
      part: key === AI_META_KEY ? 'meta' : aiPartOf(key),
      aiHint: ai.aiHint,
      agentId: ai.agentId,
      requiredFields
    }
  })
}

export const AI_SPEC: DocumentSpec = {
  kind: 'ai',
  label: 'AI 产品设计文档',
  shortLabel: 'AI',
  metaKey: AI_META_KEY,
  numberedKeys: AI_NUMBERED_KEYS,
  chapterKeys: AI_CHAPTER_KEYS,
  parts: AI_PARTS,
  chapters: chaptersForSpec(),
  chapterLabels: AI_CHAPTER_LABELS,
  agentDisplay: AI_AGENT_DISPLAY,
  agentPrompts: AI_AGENT_PROMPTS,
  roles: AI_ROLES,
  // AI 档不启用游戏数据编辑（角色/怪物/技能对 AI 产品设计无意义）
  hiddenMainViewIds: ['data.mainView'],
  systemDocNoun: AI_SYSTEM_DOC_NOUN,
  reviewRoleNoun: AI_REVIEW_ROLE_NOUN
}
