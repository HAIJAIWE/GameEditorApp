import { describe, expect, it } from 'vitest'

import type { CeshuDocument } from '../../src/shared/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import { validateCeshu } from '../../src/shared/ceshuValidation'
import { evaluateChapterDraft } from '../../src/shared/agent/qualityGate'

/**
 * 策划书 AI 产出的**确定性评分门**（v0.5 DD-19）。
 *
 * 设计要点：本项目的策划书质量**有机器可查的 rubric**（`validateCeshu` / `scoreCeshu`），
 * 所以评估**先过确定性门**，而不是让 LLM 自己给自己打分（Anthropic 实证：自评系统性偏松）。
 * 这些用例锁的就是「门真的接上了、且判定方向正确」。
 */
function makeDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full' })
}

/** 从校验错误里反推第一章（meta）缺的第一个必填字段名 —— 不硬编码字段名，避免与 schema 漂移 */
function firstMissingMetaField(doc: CeshuDocument): string | null {
  const error = validateCeshu(doc).find((item) => item.includes('第一章') && item.includes('必填项'))
  if (error === undefined) return null
  const matched = /字段 '([^']+)' 为必填项/.exec(error)
  return matched?.[1] ?? null
}

describe('策划书 AI 产出的确定性评分门（v0.5 DD-19）', () => {
  it('非法章节返回 null（调用方通常已在 IPC 层用 isChapterKey 校验）', () => {
    expect(evaluateChapterDraft(makeDoc(), 'not_a_chapter', {})).toBeNull()
  })

  it('空生成 ⇒ 错误数、评分均无变化，improved 为假', () => {
    const verdict = evaluateChapterDraft(makeDoc(), 'meta', {})
    expect(verdict).not.toBeNull()
    expect(verdict!.errorDelta).toBe(0)
    expect(verdict!.scoreDelta).toBe(0)
    expect(verdict!.improved).toBe(false)
  })

  it('summary 的优先级：blocking 优先于「无变化」', () => {
    // 空文档仍有 35 个必填缺失 ⇒ 即便 delta 全为 0，也应提示阻断而不是"无变化"
    const verdict = evaluateChapterDraft(makeDoc(), 'meta', {})
    expect(verdict!.errorDelta).toBe(0)
    expect(verdict!.summary).toContain('阻断问题')
  })

  it('补上必填字段 ⇒ 错误数下降、improved 为真（门真的接上了）', () => {
    const doc = makeDoc()
    const field = firstMissingMetaField(doc)
    expect(field).not.toBeNull()

    const verdict = evaluateChapterDraft(doc, 'meta', { [field!]: '测试游戏' })
    expect(verdict!.beforeErrors).toBe(validateCeshu(doc).length)
    expect(verdict!.errorDelta).toBe(-1)
    expect(verdict!.afterErrors).toBe(verdict!.beforeErrors - 1)
    expect(verdict!.improved).toBe(true)
  })

  it('生成后仍缺必填 ⇒ blocking 非空，且 summary 提示「先补齐再继续」', () => {
    const verdict = evaluateChapterDraft(makeDoc(), 'meta', {})
    expect(verdict!.blocking.length).toBeGreaterThan(0)
    expect(verdict!.summary).toContain('阻断问题')
    expect(verdict!.summary).toContain('先补齐')
  })

  it('blocking 只收「必填 / 硬冲突」，软警告（一致性警告 / 依赖缺失）不算阻断', () => {
    const verdict = evaluateChapterDraft(makeDoc(), 'meta', {})
    for (const item of verdict!.blocking) {
      const isSoft = item.includes('一致性警告') || item.includes('依赖缺失')
      expect(isSoft, `软问题不该进 blocking：${item}`).toBe(false)
    }
  })

  it('pure：不就地修改传入的文档', () => {
    const doc = makeDoc()
    const snapshot = JSON.stringify(doc)
    evaluateChapterDraft(doc, 'meta', { some_new_field: '值' })
    expect(JSON.stringify(doc)).toBe(snapshot)
  })

  it('fields 与章节现有内容合并（生成值覆盖同名键）', () => {
    const doc = makeDoc()
    // 先塞一个值，再用同名字段覆盖 ⇒ 错误数应比「覆盖前」少（原值不是合法必填值时）
    const withOld = evaluateChapterDraft(doc, 'meta', { game_name: '' })
    const withNew = evaluateChapterDraft(doc, 'meta', { game_name: '墨白测试' })
    expect(withOld!.errorDelta).toBe(0) // 空串仍是"空"，不改善
    expect(withNew!.errorDelta).toBe(-1) // 真正填入 ⇒ 少一个必填错误
  })

  it('评分与等级取自 scoreCeshu（同一份确定性来源）', () => {
    const doc = makeDoc()
    const verdict = evaluateChapterDraft(doc, 'meta', {})
    expect(verdict!.gradeBefore).toBe(verdict!.gradeAfter)
    expect(typeof verdict!.beforeScore).toBe('number')
    expect(verdict!.afterScore).toBe(verdict!.beforeScore + verdict!.scoreDelta)
  })
})
