/**
 * 软件设计文档规格（SDD）——应用档的独立章表。
 *
 * 与游戏 GDD **完全分开**：章 key、章名、章号、分区、AI 子智能体、岗位都是自己的，
 * 不复用 CHAPTER_PARTS / CHAPTER_LABELS / CHAPTER_AGENT_MAP 里的任何游戏语义。
 * 章号由 `APP_PARTS` 顺序派生（1..N 连续），不会出现「第十三章前面没有第一～十二章」。
 *
 * 章表依据通用软件设计文档范式（用户 2026-11-06 拍板「通用软件设计」）：
 * 需求 → 功能 → 架构 → 接口/数据 → 非功能 → 测试 → 发布 → 风险。
 * 每章的字段 schema 尚未落地（见 docs/app-development-plan.md 分阶段计划），
 * 本文件先钉死「有哪些章、叫什么、谁写」这份结构契约。
 */
import {
  APP_AGENT_DISPLAY,
  APP_AGENT_PROMPTS,
  APP_AI_LAYER_KEYS,
  APP_CHAPTER_FIELDS,
  APP_CHAPTER_KEYS,
  APP_CHAPTER_LABELS,
  APP_CHAPTER_NAMES,
  APP_LITE_NUMBERED_KEYS,
  APP_META_AI_HINT,
  APP_META_KEY,
  APP_NUMBERED_KEYS,
  APP_PARTS,
  APP_REVIEW_ROLE_NOUN,
  APP_ROLE_CHAPTERS,
  APP_ROLES,
  APP_SYSTEM_DOC_NOUN,
  appChapterAi,
  appPartOf,
  appRequiredFields
} from '../appSchema'
import type { DocumentSpec, SpecChapter } from './types'

// 章表 / 标签 / 章号 / 分区 / AI 元数据的唯一事实源都在 `appSchema/`；
// 这里 re-export 保持既有对外 API（documentSpec/index.ts 与测试都从这里取）。
// AI 元数据下沉到 appSchema 是为了切断 ceshuAi ↔ documentSpec 的循环依赖。
export {
  APP_AGENT_DISPLAY,
  APP_AGENT_PROMPTS,
  APP_META_KEY,
  APP_PARTS,
  APP_ROLES
} from '../appSchema'


/** 规格章表必须与 appSchema 字段表一一对应（缺一章就抛错，避免规格与内容脱节） */
for (const key of APP_CHAPTER_KEYS) {
  if ((APP_CHAPTER_FIELDS[key] ?? []).length === 0) {
    throw new Error(`应用规格的章在 appSchema 里没有字段定义: ${key}`)
  }
}

function chaptersForSpec(): SpecChapter[] {
  return APP_CHAPTER_KEYS.map((key) => {
    // 标签 / 章号 / 分区 / 必填 / AI 元数据全部来自 appSchema（唯一事实源）
    const requiredFields = appRequiredFields(key)
    const ai = appChapterAi(key)
    return {
      key,
      name: APP_CHAPTER_NAMES[key],
      label: APP_CHAPTER_LABELS[key],
      part: key === APP_META_KEY ? 'meta' : appPartOf(key),
      aiHint: ai.aiHint,
      agentId: ai.agentId,
      requiredFields,
      // 方向版(lite) = 6 个核心章；其余归细节版
      stage: (APP_LITE_NUMBERED_KEYS as readonly string[]).includes(key) ? 'core' : 'detail',
      // AI 模型层四章挂在可选模块下
      ...((APP_AI_LAYER_KEYS as readonly string[]).includes(key) ? { module: 'ai_layer' } : {})
    }
  })
}

export const APP_SPEC: DocumentSpec = {
  kind: 'application',
  version: '2026.11',
  label: '软件设计文档',
  shortLabel: '应用',
  metaKey: APP_META_KEY,
  numberedKeys: APP_NUMBERED_KEYS,
  chapterKeys: APP_CHAPTER_KEYS,
  parts: APP_PARTS,
  chapters: chaptersForSpec(),
  chapterLabels: APP_CHAPTER_LABELS,
  agentDisplay: APP_AGENT_DISPLAY,
  agentPrompts: APP_AGENT_PROMPTS,
  roles: APP_ROLES,
  roleChapters: APP_ROLE_CHAPTERS,
  modules: [{ key: 'ai_layer', label: 'AI 模型层', defaultOn: false, chapters: APP_AI_LAYER_KEYS }],
  // 应用档不启用游戏数据编辑（角色/怪物/技能对软件设计无意义）
  hiddenMainViewIds: ['data.mainView'],
  systemDocNoun: APP_SYSTEM_DOC_NOUN,
  reviewRoleNoun: APP_REVIEW_ROLE_NOUN,
  metaHint: APP_META_AI_HINT
}
