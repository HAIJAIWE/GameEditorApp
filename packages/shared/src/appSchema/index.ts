/**
 * shared/appSchema —— 应用 SDD 章节字段 schema 的唯一入口。
 *
 * 与 `ceshuSchema/`（游戏 GDD 24 章）**并列、互不引用**：应用章 key 是独立命名空间，
 * 由 `documentSpec.test.ts` 的零重叠守卫锁定。
 *
 * 外部一律从这里 import（`.../appSchema`），不要再深插目录内文件。
 */
export {
  APP_CHAPTER_FIELDS,
  APP_CHAPTER_SCHEMAS,
  APP_META_FIELDS,
  appRequiredFields,
  createAppDefaultChapters
} from './chapters'
export {
  APP_CHAPTER_KEYS,
  APP_CHAPTER_LABELS,
  APP_CHAPTER_NAMES,
  APP_META_KEY,
  APP_NUMBERED_KEYS,
  APP_PARTS,
  appChapterAnchorOf,
  appChapterNumber,
  appPartDisplayName,
  appPartOf
} from './table'
export type { AppPart } from './table'
export {
  APP_AGENT_DISPLAY,
  APP_AGENT_PROMPTS,
  APP_CHAPTER_AI,
  APP_META_AI_HINT,
  APP_REVIEW_ROLE_NOUN,
  APP_ROLE_CHAPTERS,
  APP_ROLES,
  APP_SYSTEM_DOC_NOUN,
  appChapterAi
} from './ai'
export type { AppChapterAi } from './ai'
