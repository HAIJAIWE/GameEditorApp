/**
 * 游戏策划书规格（GDD）——**既有常量的适配视图，零复制**。
 *
 * 所有章表 / 标签 / 分区 / AI 角色 / 岗位都直接引用 `ceshu/reference` 与
 * `ceshu/prompts` 里已在用的常量，保证「规格描述」与「实际行为」永不漂移：
 * 将来谁改了 `CHAPTER_PARTS`，本规格自动跟着变。
 */
import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  CHAPTER_NAMES,
  CHAPTER_PARTS,
  CHAPTER_REQUIRED_FIELDS,
  LITE_CHAPTER_KEYS,
  META_CHAPTER_KEY,
  NUMBERED_CHAPTER_KEYS,
  type ChapterKey
} from '../ceshu/reference'
import {
  AGENT_DISPLAY,
  CHAPTER_AGENT_MAP,
  CHAPTER_AGENT_PROMPTS,
  CHAPTER_GENERATION_HINTS
} from '../ceshu/prompts'
import { CESHU_ROLE_LABELS, CESHU_ROLE_ORDER, ROLE_CHAPTERS } from '../ceshu/workflow'
import type { DocumentSpec, SpecChapter, SpecPart } from './types'

/** 章节提示语按「agentId → 提示语」转写（游戏侧一个 agent 可管多章，取首章提示语） */
function agentPromptsById(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const chapter of CHAPTER_KEYS) {
    const id = CHAPTER_AGENT_MAP[chapter]
    if (out[id] === undefined) out[id] = CHAPTER_AGENT_PROMPTS[chapter] ?? ''
  }
  return out
}

const parts: SpecPart[] = CHAPTER_PARTS.map((part) => ({
  key: part.key,
  label: part.label,
  chapters: [...part.chapters]
}))

const chapters: SpecChapter[] = CHAPTER_KEYS.map((key) => {
  const part = CHAPTER_PARTS.find((candidate) =>
    (candidate.chapters as readonly string[]).includes(key)
  )
  return {
    key,
    name: CHAPTER_NAMES[key],
    label: CHAPTER_LABELS[key],
    part: part?.key ?? 'meta',
    aiHint: CHAPTER_GENERATION_HINTS[key] ?? '',
    agentId: CHAPTER_AGENT_MAP[key],
    requiredFields: CHAPTER_REQUIRED_FIELDS[key] ?? [],
    // 方向版(lite) = 前 9 章；其余归细节版。游戏暂不设可选模块
    stage: (LITE_CHAPTER_KEYS as readonly string[]).includes(key) ? 'core' : 'detail'
  }
})

export const GAME_SPEC: DocumentSpec = {
  kind: 'game',
  version: '2026.11',
  label: '游戏策划书',
  shortLabel: '游戏',
  metaKey: META_CHAPTER_KEY,
  numberedKeys: NUMBERED_CHAPTER_KEYS,
  chapterKeys: CHAPTER_KEYS,
  parts,
  chapters,
  chapterLabels: CHAPTER_LABELS as Readonly<Record<ChapterKey, string>>,
  agentDisplay: AGENT_DISPLAY,
  agentPrompts: agentPromptsById(),
  roles: CESHU_ROLE_ORDER.map((key) => ({ key, label: CESHU_ROLE_LABELS[key] })),
  roleChapters: ROLE_CHAPTERS as Readonly<Record<string, readonly string[]>>,
  // 游戏暂不设可选模块（市场/商业化/运营设为可选是后续步骤）
  modules: [],
  // 游戏档不隐藏任何主区页签
  hiddenMainViewIds: [],
  systemDocNoun: '游戏策划书',
  reviewRoleNoun: '资深游戏策划',
  metaHint: '整理书名、品类、平台、一句话定位等基本信息。'
}
