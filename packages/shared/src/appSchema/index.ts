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
