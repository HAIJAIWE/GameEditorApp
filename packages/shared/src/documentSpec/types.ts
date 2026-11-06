/**
 * DocumentSpec —— 文档规格：把「一套文档该有哪些章、叫什么、由谁写、怎么生成」
 * 收成一份可注册的描述，供游戏 / 应用两套体系共用同一个内核。
 *
 * 设计边界（2026-11-06，用户拍板路线 A「统一内核 + 双规格」）：
 * - **游戏规格是既有常量的适配视图**，不是复制品：CHAPTER_KEYS / CHAPTER_LABELS /
 *   CHAPTER_SCHEMAS / 各类 AI 提示词表原样保留，游戏侧行为零回归。
 * - **应用规格另立章表**：章号由自己的 parts 派生，连续不跳号；不借用游戏
 *   `CHAPTER_PARTS` 的静态章号（那是仓库注释里记过的「目录像缺页」历史缺陷）。
 * - 本章阶段只定义元数据与分派，**不接入文档读写 / 导出 / UI**；接分派是后续
 *   逐层推进的事，见 `docs/app-development-plan.md`。
 *
 * 为什么章 key 是 string 而不是 ChapterKey：`ChapterKey` 是游戏 24 章的编译期联合，
 * 把应用章塞进去会污染所有 `Record<ChapterKey, ...>` 消费方（196 个）。规格层用
 * 自己的字符串键空间，边界处再窄化，是零回归的最小切法。
 */

/** 档位标识：与 `meta.doc_kind` 同值 */
export type DocumentSpecKind = 'game' | 'application' | 'ai'

/** 规格内一章的元数据 */
export interface SpecChapter {
  key: string
  /** 章节名（不含章号），如「需求与范围」 */
  name: string
  /** 完整标签（含派生章号），如「第一章·需求与范围」；文档信息段无章号 */
  label: string
  /** 所属分区 key */
  part: string
  /** 该章 AI 生成要求（进提示词） */
  aiHint: string
  /** 该章的 AI 子智能体 id */
  agentId: string
  /** 必填字段（供进度 / 校验；本阶段为规格声明，尚未接入消费方） */
  requiredFields: readonly string[]
}

/** 规格内的分区（章号由 parts 顺序派生，保证连续） */
export interface SpecPart {
  key: string
  label: string
  chapters: readonly string[]
}

/** 规格内的岗位角色（岗位任务 / 交接包用） */
export interface SpecRole {
  key: string
  label: string
}

/** 一套文档规格 */
export interface DocumentSpec {
  kind: DocumentSpecKind
  /** 文档类型显示名，如「游戏策划书」「软件设计文档」 */
  label: string
  /** 短名，用于按钮 / 徽标 */
  shortLabel: string
  /** 文档信息段的章 key（不占章号） */
  metaKey: string
  /** 章号从 1 起的编号章（顺序即章号） */
  numberedKeys: readonly string[]
  /** 全部章 key（meta 段 + 编号章），顺序即文档顺序 */
  chapterKeys: readonly string[]
  /** 分区定义（章号的唯一事实源） */
  parts: readonly SpecPart[]
  /** 章元数据，按 chapterKeys 顺序 */
  chapters: readonly SpecChapter[]
  /** key → 完整标签 */
  chapterLabels: Readonly<Record<string, string>>
  /** AI 子智能体 id → 展示名 */
  agentDisplay: Readonly<Record<string, string>>
  /** AI 子智能体 id → 角色提示语 */
  agentPrompts: Readonly<Record<string, string>>
  /** 岗位角色 */
  roles: readonly SpecRole[]
  /** 该档位要隐藏的主区页签 id（游戏档为空） */
  hiddenMainViewIds: readonly string[]
  /** 整章 / 补全生成时 system 里的文档类型措辞 */
  systemDocNoun: string
  /** 成稿反审的角色措辞 */
  reviewRoleNoun: string
}
