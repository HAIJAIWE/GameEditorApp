import type { ChapterKey } from '../reference'
import type { GenreProfileKey } from '../prompts'

/**
 * **开发交接包**的公共类型与验收口径。
 *
 * 只有形状与纯函数，不含任何数据：文档目录见 `ceshuHandoffDocs`，卷定义见
 * `ceshuHandoffVolumes`，裁剪与门禁见 `ceshuHandoffPlan`。
 */

export type HandoffVolumeId =
  | 'architecture'
  | 'core_loop'
  | 'content'
  | 'systems'
  | 'interface'
  | 'polish'
  | 'engineering'

/** 文档里必须写死的一个字段 */
export interface HandoffDocField {
  chapter: ChapterKey
  field: string
  /** 为什么这份文档必须写清它（缺了会怎样） */
  why: string
}

/** 文档里必须写清的一个游戏系统（`systems` 章的配置块） */
export interface HandoffDocSystem {
  /** 系统 id：battle / equipment / item / growth …（见 `SYSTEM_CONFIG_SCHEMA`） */
  key: string
  why: string
}

/**
 * 条件文档的触发条件（**任一满足**即出现）。
 *
 * 与品类裁剪的分工：`genres` 管「这个玩法要不要」，`when` 管「这个项目有没有这件事」
 * （有没有音频引擎、联不联机）。两者独立，可叠加。
 */
export type HandoffDocCondition =
  | { kind: 'field'; chapter: ChapterKey; field: string }
  | { kind: 'system'; key: string }
  | { kind: 'fieldOneOf'; chapter: ChapterKey; field: string; values: string[] }

/**
 * 文档层级（对应「先通用、后玩法变化」的顺序）：
 * - `baseline` 通用基线：任何游戏都要做；
 * - `genre` 品类专属：由 `game_type` / `game_type_tags` 决定增减；
 * - `conditional` 条件文档：由项目事实（音频引擎、联机形态）决定出现与否。
 */
export type HandoffDocLayer = 'baseline' | 'genre' | 'conditional'

/**
 * 验收条目的判定方式：
 * - `assertion`：挂 `contract.json` 的断言（机器可判，复算通过才算过）；
 * - `test`：自动化测试（脚本/单测）；
 * - `manual`：人工判定（缺省）。
 *
 * 为什么要有：只有自然语言验收时，编码智能体只能「觉得自己做完了」。
 * 标了判定方式，它才知道该跑断言、跑测试，还是交给人看。
 */
export type HandoffAcceptanceCheck = 'assertion' | 'test' | 'manual'

/**
 * 验收条目：字符串 = 人工判定（保持既有写法不变）；对象 = 显式标注判定方式。
 * 兼容两种形态是为了不让 30 多份文档的 `acceptance` 一次性重写——新写的用对象，老的不用动。
 */
export type HandoffAcceptance = string | { text: string; check?: HandoffAcceptanceCheck }

/** 验收条目的文字（两种形态统一取文本） */
export function acceptanceText(item: HandoffAcceptance): string {
  return typeof item === 'string' ? item : item.text
}

/** 验收条目的判定方式（字符串缺省人工） */
export function acceptanceCheck(item: HandoffAcceptance): HandoffAcceptanceCheck {
  return typeof item === 'string' ? 'manual' : (item.check ?? 'manual')
}

/**
 * 冲突裁决优先级（README 与 `index.json` 共用同一份，顺序即优先级）。
 *
 * 为什么要写死：交接包里同一个事实可能在两处出现（如伤害公式在交接文档与 contract 都有）。
 * 编码智能体遇到矛盾时若靠猜，十次有九次猜错——必须给它一条确定的链。
 */
export const HANDOFF_PRECEDENCE: readonly string[] = [
  'contract.json —— 规则 / 参数 / 断言 / 验收旅程；与任何文档冲突时以它为准',
  'data/snapshot.json（结构见 schema.json）—— 内容行的唯一来源，代码里不许硬编码',
  '交接文档（00-架构 … 06-研发）—— 施工步骤与验收',
  'gdd.md —— 背景、理由、完整叙述；与上面冲突时以上面为准',
  'prototype/demo.html —— 手感参考；代码结构不照抄'
]

/** 一份设计文档（= 一个可独立验收的施工单元） */
export interface HandoffDoc {
  /** 稳定 id（测试与路径都按它来） */
  id: string
  volumeId: HandoffVolumeId
  /** 卷内顺序（1 起）：文件名前缀就是它 */
  order: number
  title: string
  /** 这份文档要解决什么（一句话，派工用） */
  purpose: string
  fields: HandoffDocField[]
  /**
   * 仅这些品类适用（缺省 = 所有品类通用）。
   * 组合品类按并集命中：`game_type=SLG` + 标签 `卡牌` ⇒ strategy 与 card 两套专属文档都出现。
   */
  genres?: GenreProfileKey[]
  /** 条件文档的触发条件（缺省 = 无条件出现） */
  when?: HandoffDocCondition[]
  /** 需要附上的系统配置块（可为空） */
  systems?: HandoffDocSystem[]
  /** 可判定的验收条目（字符串=人工判定；对象=显式判定方式） */
  acceptance: HandoffAcceptance[]
  /** 明确不做（缺省沿用卷级） */
  outOfScope?: string[]
}

export interface HandoffVolume {
  id: HandoffVolumeId
  index: number
  /** 文件夹名用的短名（`00-架构`） */
  folder: string
  title: string
  outcome: string
  requires: HandoffVolumeId[]
  /** 附在卷目录末尾的章节（正文摘录） */
  chapters: ChapterKey[]
  /** 本卷全部文档涉及的字段（**由文档派生**） */
  keyFields: HandoffDocField[]
  acceptance: HandoffAcceptance[]
  outOfScope: string[]
  scale: string
}
