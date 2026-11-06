/**
 * shared/aiSchema —— AI 产品设计文档（SDD + 模型层）章节字段 schema 的唯一入口。
 *
 * 与 `appSchema/`（应用 SDD）并列、互不引用；AI 章 key 是独立命名空间，
 * 由 `documentSpec.test.ts` 的零重叠守卫锁定。
 *
 * 外部一律从这里 import（`.../aiSchema`），不要再深插目录内文件。
 */
export {
  AI_CHAPTER_FIELDS,
  AI_CHAPTER_SCHEMAS,
  AI_META_FIELDS,
  aiRequiredFields,
  createAiDefaultChapters
} from './chapters'
export {
  AI_CHAPTER_KEYS,
  AI_CHAPTER_LABELS,
  AI_CHAPTER_NAMES,
  AI_LITE_KEYS,
  AI_LITE_NUMBERED_KEYS,
  AI_META_KEY,
  AI_NUMBERED_KEYS,
  AI_PARTS,
  aiChapterAnchorOf,
  aiChapterNumber,
  aiPartDisplayName,
  aiPartOf
} from './table'
export type { AiPart } from './table'
export {
  AI_AGENT_DISPLAY,
  AI_AGENT_PROMPTS,
  AI_CHAPTER_AI,
  AI_META_AI_HINT,
  AI_REVIEW_ROLE_NOUN,
  AI_ROLE_CHAPTERS,
  AI_ROLES,
  AI_SYSTEM_DOC_NOUN,
  aiChapterAi
} from './ai'
export type { AiChapterAi } from './ai'
