/**
 * 字段契约数据（`aiHint` / `reviewHint` / `aiDraftable`）的**按章分文件**存放处。
 *
 * ## 为什么从 `ceshuFields.ts` 拆出来
 * 2026-10-23 体检发现 122 个字段里只有 19% 有 AI 生成契约——补契约是**纯数据工作**，
 * 混在字段定义里会让「改一个提示词」和「改字段结构」两类改动互相干扰，
 * 也无法多人并行编辑（都改同一个文件必然冲突）。
 *
 * 拆开后：每章一个文件、一个文件夹内并行；`ceshuFields.ts` 只在导出时按章合并。
 */

/** 单字段契约：AI 生成目标 / 人审要点 / 是否人定 */
export interface FieldHint {
  /** 这个字段 AI 该产出什么（一句话，直接进提示词） */
  aiHint?: string
  /** 人审时看什么（一句话，显示在字段旁） */
  reviewHint?: string
  /** false = 该字段由人确定，不交给 AI 起草（预算/团队/商业决策类） */
  aiDraftable?: boolean
}

/** 单章的字段契约表（键为字段 key，含点路径） */
export type ChapterFieldHints = Record<string, FieldHint>
