import { CHAPTER_LABELS, type ChapterKey } from '@mobai/shared/ceshu/reference'
import { formatLocalTimestamp, isPlainObject } from '@mobai/shared/ceshu/model'

/**
 * 导出侧对「schema 外扩展键」的处理口径。
 *
 * 实测（2026-11-09，真实文档 dd66f593）：「文档信息」章末尾印出 `enabled_modules:` 后跟
 * 17 行英文章 key、`template_version: 2026.11`、`ai_generated:` 后跟 7 行 ISO 时间戳、
 * `business_model:` 整段重复文本；「产品愿景」章印出 `user_personas:` 裸名。
 * 这些键都不在 schema 里（`chapterFieldsForDoc('meta')` 只有 14 个正式字段），旧口径
 * 「原样打印 + 标签回落成 key」让成品一半篇幅是内部字段名——发给同事看等于没写。
 *
 * 处理原则沿用既有「正文只放人读、机读进附录」：
 * - body   ：读者需要 —— 本地化后留在正文（已启用模块 / 模板版本）；
 * - machine：运维/审计信息 —— 只进「附录：验收与机读数据」（AI 生成时间）；
 * - skip   ：重复存储 —— 正文不渲染（meta.business_model 与 vision 章重复，且可能过期）。
 *
 * 为什么不把这些键补进 schema：它们不是「用户可编辑的设计内容」。
 * `template_version` / `enabled_modules` 被 `NON_AI_GENERATED_KEYS` 明确排除在 AI 字段清单外
 * （packages/shared/src/ceshu/prompts/ceshuAi.ts:147，理由见 :139-145：列进去会让模型改写
 * 模板版本锚点、凭空开关章节）；`ai_generated` 由 `ceshuAiMark` 维护；`field_status`
 * 这类内部账本导出侧本来就不打印（先例见 renderReviewProgress 只出汇总）。
 */

export type ExtraKeyPlacement = 'body' | 'machine' | 'skip'

interface ExtraKeyRule {
  /** 中文标签（渲染器不再回落到裸 key） */
  label: string
  placement: ExtraKeyPlacement
  /** 值改写（本地化 / 时间格式化）；缺省原样输出 */
  format?: (value: unknown) => unknown
}

const EXTRA_KEY_RULES: Record<string, Record<string, ExtraKeyRule>> = {
  meta: {
    /*
     * 17 个英文章 key 对读者没有任何信息量（章节导航里已经能看到哪些章存在），
     * 但「这份文档覆盖了哪些模块」是有用的口径 ⇒ 翻成中文章名、压成一行。
     */
    enabled_modules: { label: '已启用模块', placement: 'body', format: chapterListText },
    template_version: { label: '模板版本', placement: 'body' },
    ai_generated: { label: 'AI 生成时间', placement: 'machine', format: aiGeneratedText },
    /*
     * meta.business_model 是 config.json 的双写副本（ceshuProjectFolder.ts:137 写、:222 读回），
     * 权威处是 vision 章的「商业模式」（design/vision.md 的 prose 字段）。
     * 实测这份真实文档两处内容已经对不上（meta 写「50 抽保底 / ARPU 30-50」，
     * vision 写「90 抽保底 / ARPU 40-60」）—— 正文再印一遍等于给读者两个互相矛盾的数字。
     * 故 vision 有值时 meta 这份按「重复存储」跳过；vision 为空时仍按 body 保留（不丢信息）。
     */
    business_model: { label: '商业模式', placement: 'body' }
  }
}

/** 该扩展键的规则（不是扩展键返回 undefined） */
export function extraKeyRuleFor(chapter: string, key: string): ExtraKeyRule | undefined {
  return EXTRA_KEY_RULES[chapter]?.[key]
}

/** 扩展键的中文标签（不是扩展键返回 undefined，调用方再走 schema 回落） */
export function extraKeyLabelFor(chapter: string, key: string): string | undefined {
  return extraKeyRuleFor(chapter, key)?.label
}

/**
 * 扩展键的落位（`doc` 可为 undefined：narrative / homepage 的纯章渲染没有文档上下文）。
 *
 * 唯一需要看文档内容的一条：`meta.business_model` 在 vision 章已有值时视为重复。
 */
export function extraKeyPlacementFor(
  doc: { vision?: unknown } | undefined,
  chapter: string,
  key: string
): ExtraKeyPlacement | undefined {
  const rule = extraKeyRuleFor(chapter, key)
  if (rule === undefined) return undefined
  if (chapter === 'meta' && key === 'business_model' && visionHasBusinessModel(doc)) return 'skip'
  return rule.placement
}

function visionHasBusinessModel(doc: { vision?: unknown } | undefined): boolean {
  const vision = isPlainObject(doc?.vision) ? (doc.vision as Record<string, unknown>) : undefined
  const value = vision?.business_model
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return false
}

/** 扩展键的值改写（没有规则或规则没有 format 时原样返回） */
export function formatExtraKeyValue(chapter: string, key: string, value: unknown): unknown {
  return extraKeyRuleFor(chapter, key)?.format?.(value) ?? value
}

/** 章 key 列表 → 中文章名一行（读不出章名的 key 原样保留，不静默丢） */
function chapterListText(value: unknown): unknown {
  if (!Array.isArray(value)) return value
  const labels = value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => CHAPTER_LABELS[item as ChapterKey] ?? item.trim())
  return labels.length > 0 ? labels.join('、') : value
}

/** `{章key: ISO 时间}` → `{中文章名: 本地时间}`（解析失败保留原串，不显示 Invalid Date） */
function aiGeneratedText(value: unknown): unknown {
  if (!isPlainObject(value)) return value
  const out: Record<string, string> = {}
  for (const [chapter, raw] of Object.entries(value)) {
    out[CHAPTER_LABELS[chapter as ChapterKey] ?? chapter] = localTimeText(raw)
  }
  return out
}

function localTimeText(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') return typeof raw === 'string' ? raw : String(raw)
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : formatLocalTimestamp(date)
}

/* ------------------------------------------------------------------ */
/* 点路径字段的「数组形态」展开                                          */
/* ------------------------------------------------------------------ */

/**
 * schema 里 `user_personas` 是三个点路径字段（`user_personas.primary/secondary/potential`，
 * 见 packages/shared/src/ceshuSchema/quality/vision.ts:21/28/35），但 AI 整章生成 / 模板常把它
 * 落成**字符串数组**（实测三条：主画像 / 次画像 / 潜在画像）。导出侧只取首段 key，
 * 于是整数组以裸 key `user_personas` 打出来，三个中文标签全部失效。
 *
 * 这里按「前缀识别 + 顺序兜底」还原成三槽位：识别出「主/次/潜在」则进对应槽（内容优先于顺序），
 * 认不出就按出现顺序填空槽；槽位前缀（如「主画像：」）一并剥掉，避免和标签重复。
 * 多于三条时余项并入最后一槽（换行分隔），仍然一字不丢。
 */
const PERSONA_SLOT_ORDER = [
  'user_personas.primary',
  'user_personas.secondary',
  'user_personas.potential'
] as const

export function expandPersonaEntries(
  chapter: string,
  key: string,
  value: unknown
): Array<[string, string]> | null {
  if (chapter !== 'vision' || key !== 'user_personas') return null
  // 形态二：schema 期望的嵌套对象（模板 / 手填走这条，AI 走下面的数组形态）
  if (isPlainObject(value)) {
    const nested: Array<[string, string]> = []
    for (const slot of PERSONA_SLOT_ORDER) {
      const inner = value[slot.split('.')[1] ?? '']
      if (typeof inner !== 'string' || inner.trim() === '') continue
      nested.push([slot, inner.trim()])
    }
    return nested.length > 0 ? nested : null
  }
  if (!Array.isArray(value)) return null
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  if (items.length === 0) return null

  const slots: Record<string, string[]> = {}
  let nextFree = 0
  for (const raw of items) {
    const detected = detectPersonaSlot(raw)
    let slot: string | undefined = detected.slot
    if (slot === undefined || slots[slot] !== undefined) {
      while (nextFree < PERSONA_SLOT_ORDER.length && slots[PERSONA_SLOT_ORDER[nextFree]] !== undefined) {
        nextFree += 1
      }
      slot = PERSONA_SLOT_ORDER[nextFree] ?? PERSONA_SLOT_ORDER[PERSONA_SLOT_ORDER.length - 1]
    }
    ;(slots[slot] ??= []).push(detected.text)
  }
  return PERSONA_SLOT_ORDER.filter((slot) => slots[slot] !== undefined).map((slot) => [
    slot,
    slots[slot].join('\n')
  ])
}

function detectPersonaSlot(raw: string): { slot?: string; text: string } {
  const match = raw.match(/^(主要?|次要?|潜在)(画像|用户)?\s*[：:]\s*/)
  if (match === null) return { text: raw }
  const head = match[1]
  const slot = head.startsWith('主')
    ? PERSONA_SLOT_ORDER[0]
    : head.startsWith('次')
      ? PERSONA_SLOT_ORDER[1]
      : PERSONA_SLOT_ORDER[2]
  return { slot, text: raw.slice(match[0].length).trim() }
}
