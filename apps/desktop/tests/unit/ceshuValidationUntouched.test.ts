import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, type CeshuDocument } from '@mobai/shared/ceshu/reference'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import {
  UNTOUCHED_CHAPTER_MARK,
  classifyValidationMessage,
  countValidationBySeverity,
  groupValidationMessages,
  validateCeshu
} from '@mobai/shared/ceshu/validation'
import { computeReadiness, readinessFillGap } from '@mobai/shared/ceshu/readiness'
import { buildHandoffPlan } from '@mobai/shared/ceshu/workflow'

/**
 * 统一校验口径（用户实测：一键生成「制作档」15 章后，本次没生成的 6 个章仍报 11 条硬错误，
 * 与 computeReadiness 的「不急——按阶段推进」自相矛盾）。
 *
 * 整章「完全没生成」（正文字段全空 + 字数 0）只留 1 条建议性提示，分类为 warning；
 * 已写过部分内容却漏必填的章仍是真实缺口，必须保持逐字段「为必填项」error 不变。
 */
const UNTOUCHED_MESSAGE_RE = new RegExp(`^(.+)：${UNTOUCHED_CHAPTER_MARK}，(\\d+) 项必填待后续阶段补齐$`)

/** 全空文档：所有章置 {}（含 meta / systems），模拟本次生成完全没覆盖到的章 */
function blankDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  const target = doc as unknown as Record<string, unknown>
  for (const key of CHAPTER_KEYS) target[key] = {}
  return doc
}

describe('整章未生成：校验 / 完备度 / 交接包口径统一', () => {
  it('(a) 全空文档：每个未生成章恰好 1 条建议，severity=warning 且硬错误为 0', () => {
    const doc = blankDoc()
    const messages = validateCeshu(doc)
    const untouched = messages.filter((message) => message.includes(UNTOUCHED_CHAPTER_MARK))

    // 24 章里 systems 无必填字段，其余 23 章各 1 条
    const expectedChapters = CHAPTER_KEYS.filter((key) => key !== 'systems')
    expect(untouched).toHaveLength(expectedChapters.length)
    expect(messages).toHaveLength(untouched.length) // 全空文档不产生其它校验消息
    expect(new Set(untouched).size).toBe(untouched.length)

    // 文案逐字：`<章节标签>：本章尚未生成，N 项必填待后续阶段补齐`，N = 该章必填字段数
    for (const message of untouched) {
      const matched = UNTOUCHED_MESSAGE_RE.exec(message)
      expect(matched).not.toBeNull()
      const label = matched![1]!
      const chapter = CHAPTER_KEYS.find((key) => CHAPTER_LABELS[key] === label)!
      expect(Number(matched![2])).toBe(CHAPTER_REQUIRED_FIELDS[chapter].length)
      expect(classifyValidationMessage(message)).toEqual({
        message,
        severity: 'warning',
        kind: 'required',
        kindLabel: '未生成章节'
      })
    }

    // 面板计数：0 条硬错误（不再被当作阻断）
    expect(countValidationBySeverity(messages)).toEqual({ errors: 0, warnings: untouched.length })
    // 分组：只有「建议检查·未生成章节」一组，不与 error:required 混在一起
    const groups = groupValidationMessages(messages)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ severity: 'warning', kind: 'required', label: '未生成章节' })
    expect(groups[0]!.items).toHaveLength(untouched.length)
  })

  it('(b) 章节已有部分内容但漏必填：仍逐字段报 error，不被折叠', () => {
    const doc = blankDoc()
    doc.publishing = { publish_plan: '先做 Steam 抢先体验' }
    const messages = validateCeshu(doc)
    const label = CHAPTER_LABELS.publishing
    const forChapter = messages.filter((message) => message.startsWith(`${label}：`))

    expect(forChapter).toEqual([`${label}：字段 'channel_strategy' 为必填项`])
    expect(classifyValidationMessage(forChapter[0]!).severity).toBe('error')
    expect(forChapter.some((message) => message.includes(UNTOUCHED_CHAPTER_MARK))).toBe(false)
    // 其余 22 个未生成章仍各 1 条建议；真实缺口不被吞掉
    expect(messages.filter((message) => message.includes(UNTOUCHED_CHAPTER_MARK))).toHaveLength(22)
    expect(countValidationBySeverity(messages).errors).toBe(1)
  })

  it('(c) readinessFillGap 不因新文案虚高：按 N 折算必填缺口', () => {
    const doc = blankDoc()
    const messages = validateCeshu(doc)
    const folded = messages.reduce(
      (sum, message) => sum + Number(UNTOUCHED_MESSAGE_RE.exec(message)?.[2] ?? 0),
      0
    )

    // 23 条建议覆盖的必填数合计 = 全量必填分母（meta 4 + story 4 + 21×2 = 50）
    expect(folded).toBe(computeReadiness(doc, messages).total_missing)
    // 若仍只按「为必填项」计数，gap 会虚高成 50；现在必须是 0
    expect(readinessFillGap(doc, messages)).toBe(0)
    expect(readinessFillGap(doc)).toBe(0)
    // 两套口径不再打架：全空文档没有 error 级校验 ⇒ next_steps 不点名硬错误
    expect(computeReadiness(doc, messages).next_steps.some((step) => step.includes('条校验错误'))).toBe(false)
  })

  it('(d) 交接包 blockers 不含「本章尚未生成」建议性消息', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(validateCeshu(doc).some((message) => message.includes(UNTOUCHED_CHAPTER_MARK))).toBe(true)
    const blockers = buildHandoffPlan(doc)
      .flatMap((volume) => volume.docs)
      .flatMap((item) => item.blockers)
    expect(blockers.some((message) => message.includes(UNTOUCHED_CHAPTER_MARK))).toBe(false)
  })
})
