/**
 * 整章 → 多单元生成计划：把一章的字段切成若干个「一次调用只写这几个字段」的任务。
 *
 * 为什么按单元切（2026-11-10 用户要求「一个系统或者是一个逻辑一个文档」）：
 * 一次调用索要整章 6–33 个字段时，模型的正文预算被推理吃光——实测整章 33 字段
 * 输出直接截断归零；按 11/11/11 分批后同样的内容写出了 4992 字（≈4 倍），字段才真的被写透。
 * 所以这里不做「一次性生成整章」的提示词，而是产出一份**任务清单**：每个任务自带收窄后的
 * system（只承诺本单元这几个字段）+ 只列本单元字段的 user 提示词。
 *
 * 为什么字段数上限是 6：见 `ceshuChapterUnits.ts` —— 6 是实测能写透、又不至于把整章
 * 压扁的平衡点；本模块不重新定义这个数，一律委托 `planChapterUnits`。
 *
 * 分层关系（都在这条链上，改动要一起看）：
 * 1. `unitFieldKeys`：本章「可生成字段」的权威清单（字段表 ∪ 数据键，剔系统控制字段）；
 * 2. `planChapterUnits`：把清单切成单元（派生字段跟本体、点路径归父、单组 ≤ 上限）；
 * 3. `buildChapterPrompt`：按单元的 `onlyFields` 组装 system / prompt（含表格列契约）。
 *
 * 纯函数、无 IO、无随机：计划内容要能被单测逐字锁住；提示词一旦漂移，模型看到的就是
 * 「另一套字段口径」，接线后极难排查。
 */
import type { CeshuDocument } from '../reference'
import { chapterDataForDoc, chapterFieldsForDoc } from '../model'
import { buildChapterPrompt } from './ceshuAi'
import { CHAPTER_UNIT_MAX_FIELDS, planChapterUnits } from './ceshuChapterUnits'

/** 一个单元 = 一次生成调用的完整输入（id / 名称 / 字段 / 提示词成对出现） */
export interface ChapterUnitTask {
  /** 单元 id（u1/u2…，来自 planChapterUnits） */
  id: string
  /** 单元名（如「战斗节奏、核心循环…」） */
  label: string
  /** 本单元要生成的字段 key */
  fields: string[]
  /** 该单元的 system 提示词（= buildChapterPrompt 的 system，逐单元不同：只承诺这几字段） */
  system: string
  /** 该单元的 user 提示词 */
  prompt: string
}

/** 规划整章生成单元的可选项（均直接透传给 planChapterUnits / buildChapterPrompt） */
export interface ChapterUnitPlanOptions {
  /** 单次最多字段数；缺省 CHAPTER_UNIT_MAX_FIELDS（6），非法值由 planChapterUnits 回落 6 */
  maxFieldsPerUnit?: number
  /** 一键生成时该章的定制提示【章节】【用户输入】【关键词与硬约束】【生成要求】；透传给 buildChapterPrompt 的 extraPrompt */
  extraPrompt?: string
  /** 风格 key 覆盖（全量生成用用户所选风格；为空回退 doc.style） */
  styleOverride?: string
  /** 整篇生成的章顺序（与整章生成同签名；见 buildChapterUnitPlan 内的说明） */
  generationOrder?: readonly string[]
  /** 本次整篇生成中已生成的章（与整章生成同签名；见 buildChapterUnitPlan 内的说明） */
  generatedChapters?: readonly string[]
}

/**
 * 系统控制字段：只由数据层 / 模块选择器写入，AI 整章生成时不得列入字段清单。
 *
 * 为什么不能生成：
 * - `template_version` 被改写会让「老文档按新模板读」的判定失效；
 * - `enabled_modules` 被改写会凭空开关章节，让用户已有的章内容「消失」。
 * 与 `doc_kind` 不同：后者在字段表里（AI 可见、写盘由 withChapter 守卫），本集合里的键
 * 连字段清单都不进。
 *
 * ⚠️ 与 `ceshuAi.ts:147` 的 `NON_AI_GENERATED_KEYS` **是同一份口径的两处独立实现**：
 * 那边是私有常量（不导出），而把整章生成的私有实现抄成公共 API 会反过来绑住它。
 * 两份必须同步维护——任一处漏掉 / 多掉一个键，「单元生成」与「整章生成」看到的字段清单
 * 就不一致：多包含则模型去编造系统元数据，少包含则字段永远生成不出来。
 * 新增系统控制字段时，两处一起改。
 */
const NON_AI_GENERATED_KEYS: ReadonlySet<string> = new Set(['template_version', 'enabled_modules'])

/**
 * 本章可生成字段清单 = **字段表（schema，权威）∪ 文档数据键**（点路径键取首段），
 * 再剔除系统控制字段。
 *
 * 为什么必须是并集，而不是只取 `Object.keys(chapterData)`：doc 数据来自 defaults，
 * 可选字段与拆分字段（xxx_points / xxx_notes）没有默认值条目 ⇒ 不进数据键 ⇒ 只看数据键
 * 就会在单元计划里漏掉这些字段（而 UI 是按字段表渲染的）。反过来只取字段表也不行：
 * systems 章的字段表为空、13 个系统块全在数据键里，只取字段表会让该章一个单元都规划不出来。
 *
 * 为什么点路径取首段：`user_personas.primary` 在文档里就是父字段对象的一个键，
 * 生成单位是父字段（与 `mergeUnitFields` 的归父口径一致）。
 *
 * ⚠️ 与 `ceshuAi.ts:162` 的私有 `chapterGenerationKeys` 是同一口径的两处独立实现
 * （理由见上面「系统控制字段」注释）：那边服务于整章生成，本模块按同口径独立实现并导出，
 * 供计划层 / UI 复用。**两份实现必须同步**，否则「单元生成」与「整章生成」会给出不同的
 * 字段清单——这正是最难查的那类线上问题（两边都「看起来对」）。
 */
export function unitFieldKeys(doc: CeshuDocument, chapter: string): string[] {
  const merged: string[] = chapterFieldsForDoc(doc, chapter).map((field) => field.key.split('.')[0])
  for (const key of Object.keys(chapterDataForDoc(doc, chapter))) {
    if (!merged.includes(key)) merged.push(key)
  }
  return merged.filter((key) => !NON_AI_GENERATED_KEYS.has(key))
}

/**
 * 单元名用的 key → 中文名映射。
 *
 * 除字段自身的 key 外，点路径字段还要给**父 key** 补一条（`user_personas.primary` →
 * `user_personas`）：单元里的字段是父 key（见 unitFieldKeys），不给父 key 补名，
 * 单元标题就会退化成「设计愿景、user_personas…」这种夹英文的标题，对策划没有信息量。
 * 父 key 可能被多个子字段共用，取**首个出现**的标签即可（同父字段本来就是同一段内容的
 * 不同视图，名字取第一个最贴近）。
 */
function labelsForChapter(doc: CeshuDocument, chapter: string): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const field of chapterFieldsForDoc(doc, chapter)) {
    const label = field.label.trim()
    if (label === '') continue
    labels[field.key] = label
    const dot = field.key.indexOf('.')
    if (dot <= 0) continue
    const root = field.key.slice(0, dot)
    if (labels[root] === undefined) labels[root] = label
  }
  return labels
}

/**
 * 规划整章的生成单元：每个单元自带收窄后的 system + 只含本单元字段的 user 提示词。
 *
 * 边界（按顺序判定）：
 * - 本章没有可生成字段（字段表空且数据为空，或章 key 不存在）⇒ 返回 `[]`，不抛错：
 *   调用方（UI / 一键生成）看到空数组就跳过该章，不必各写一层 try/catch；
 * - 字段数 ≤ 上限 ⇒ 只返回 1 个任务，字段清单与 `unitFieldKeys` 完全一致（顺序也一样）；
 * - 否则交给 `planChapterUnits` 切分（单组 ≤ 上限、派生字段跟本体、点路径归父）。
 *
 * 逐单元收窄 system 不是措辞偏好，而是改变输出预算分配方式的开关：整章 system 说
 * 「请生成该章节的完整内容，包括所有字段」（ceshuAi.ts:342），模型就按整章分配篇幅，
 * 每个字段只能分到几十字；单元 system 说「请仅生成下面列出的字段」（ceshuAi.ts:339），
 * 它才敢把每个字段写长。只列本单元字段的 user 提示词是同一件事的另一半。
 *
 * `generationOrder` / `generatedChapters` 两个前文摘要参数原样透传：当前
 * `buildChapterPrompt` 在 `onlyFields` 路径上**不注入前文要点**（ceshuAi.ts:356），
 * 故今天是空操作；保留是为了与整章调用同签名——若后续给单元生成接上跨章摘要，
 * 只改 ceshuAi 一处，所有调用点不用动。
 */
export function buildChapterUnitPlan(
  doc: CeshuDocument,
  chapter: string,
  options: ChapterUnitPlanOptions = {}
): ChapterUnitTask[] {
  const fields = unitFieldKeys(doc, chapter)
  if (fields.length === 0) return []

  const labels = labelsForChapter(doc, chapter)
  const units = planChapterUnits(chapter, fields, {
    labels,
    ...(options.maxFieldsPerUnit !== undefined ? { maxFieldsPerUnit: options.maxFieldsPerUnit } : {})
  })

  return units.map((unit) => {
    const built = buildChapterPrompt(doc, chapter, {
      onlyFields: unit.fields,
      ...(options.extraPrompt ? { extraPrompt: options.extraPrompt } : {}),
      ...(options.styleOverride ? { styleOverride: options.styleOverride } : {}),
      ...(options.generationOrder ? { generationOrder: options.generationOrder } : {}),
      ...(options.generatedChapters ? { generatedChapters: options.generatedChapters } : {})
    })
    return { id: unit.id, label: unit.label, fields: unit.fields, system: built.system, prompt: built.prompt }
  })
}

/**
 * 计划的一句话摘要（UI 提示用）：
 * 「本章 33 个字段 → 6 个单元：u1 战斗模式、伤害公式…、u2 …（每单元 ≤6 字段）」。
 *
 * 为什么把上限也写出来：用户看到「分了 6 个单元」的第一反应是「为什么这么碎」，
 * 把上限一并给出，切分依据才是可解释的（而不是像随机拆的）。
 * 空计划返回空串（无字段的章没有任何提示价值，调用方按空串不显示即可）。
 */
export function chapterUnitSummary(
  plan: readonly ChapterUnitTask[],
  options: { maxFieldsPerUnit?: number } = {}
): string {
  if (plan.length === 0) return ''
  const total = plan.reduce((sum, unit) => sum + unit.fields.length, 0)
  const requested = options.maxFieldsPerUnit
  const max =
    requested !== undefined && Number.isInteger(requested) && requested > 0 ? requested : CHAPTER_UNIT_MAX_FIELDS
  const names = plan.map((unit) => `${unit.id} ${unit.label}`).join('、')
  return `本章 ${total} 个字段 → ${plan.length} 个单元：${names}（每单元 ≤${max} 字段）`
}
