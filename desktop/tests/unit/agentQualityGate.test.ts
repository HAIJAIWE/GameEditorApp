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

/* ---- 数据半边：候选的确定性质量门（v0.5 DD-19） ---- */

import type { DataTypeDef } from '../../src/shared/types'
import { evaluateDataCandidates } from '../../src/shared/agent/qualityGate'

function makeType(
  id: string,
  pluralKey: string,
  fields: Array<{ name: string; label: string; type: 'spinbox' | 'entry' }>
): DataTypeDef {
  return {
    id,
    name: id === 'role' ? '角色' : id,
    pluralKey,
    color: '#607D8B',
    formFields: fields.map((field) => ({ ...field, editable: true })) as DataTypeDef['formFields']
  }
}

const spinboxType = makeType('role', 'roles', [
  { name: 'hp', label: '生命值:', type: 'spinbox' },
  { name: 'atk', label: '攻击力:', type: 'spinbox' }
])

describe('数据 AI 候选的确定性质量门（v0.5 DD-19 数据半边）', () => {
  it('无类型定义时不误报（只统计条数）', () => {
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100 }, { hp: 120 }] })
    expect(verdict.total).toBe(2)
    expect(verdict.counts.roles).toBe(2)
    expect(verdict.issues).toHaveLength(0)
    expect(verdict.hasIssues).toBe(false)
  })

  it('数量约束超限 ⇒ 报 count_limit（硬问题，排在最前）', () => {
    // 系统 config 声明角色上限 2
    const systems = { social: { name: '社交系统', data_type: 'role', config: { max_count: 2 } } }
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100 }, { hp: 110 }, { hp: 120 }] }, {
      types: [spinboxType],
      systems
    })
    expect(verdict.issues.length).toBeGreaterThan(0)
    expect(verdict.issues[0]!.kind).toBe('count_limit')
    expect(verdict.issues[0]!.message).toContain('上限 2')
    expect(verdict.summary).toContain('数量上限')
  })

  it('数量约束：现有 + 本次合并计算（不是只看本次）', () => {
    const systems = { social: { name: '社交系统', data_type: 'role', config: { count: 5 } } }
    // 本次 2 条 ≤ 上限，但现有已有 4 个 ⇒ 合并 6 > 5 应报
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100 }, { hp: 110 }] }, {
      types: [spinboxType],
      systems,
      existingCounts: { role: 4 }
    })
    expect(verdict.issues.some((issue) => issue.kind === 'count_limit')).toBe(true)
    expect(verdict.issues[0]!.message).toContain('现有 4')
  })

  it('未超上限 ⇒ 不报数量约束', () => {
    const systems = { social: { name: '社交系统', data_type: 'role', config: { count: 10 } } }
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100 }, { hp: 110 }] }, {
      types: [spinboxType],
      systems
    })
    expect(verdict.issues.some((issue) => issue.kind === 'count_limit')).toBe(false)
  })

  it('数值离散度偏高 ⇒ 报 balance（建议，排在数量约束之后）', () => {
    // hp 取 100 与 1000 ⇒ 离散度远超阈值 0.3
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100, atk: 10 }, { hp: 1000, atk: 12 }] }, {
      types: [spinboxType]
    })
    const balanceIssues = verdict.issues.filter((issue) => issue.kind === 'balance')
    expect(balanceIssues.length).toBeGreaterThan(0)
    expect(balanceIssues[0]!.message).toContain('离散度偏高')
  })

  it('数值接近 ⇒ 平衡性判定为 good，不产生问题', () => {
    const verdict = evaluateDataCandidates(
      { roles: [{ hp: 100, atk: 10 }, { hp: 104, atk: 11 }, { hp: 102, atk: 10 }] },
      { types: [spinboxType] }
    )
    expect(verdict.balance.length).toBeGreaterThan(0)
    expect(verdict.balance.every((row) => row.verdict === 'good')).toBe(true)
    expect(verdict.issues).toHaveLength(0)
    expect(verdict.summary).toContain('通过数量约束与平衡性检查')
  })

  it('balance 行的 label 去掉表单标签的冒号后缀', () => {
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100 }, { hp: 110 }] }, { types: [spinboxType] })
    expect(verdict.balance[0]!.label).toBe('生命值')
  })

  it('无法解析为数字的值被跳过（对齐 dataStats 的 toFiniteNumber 口径）', () => {
    const verdict = evaluateDataCandidates(
      { roles: [{ hp: '100' }, { hp: '不是数字' }, { hp: '' }, { hp: 120 }] },
      { types: [spinboxType] }
    )
    const hpRow = verdict.balance.find((row) => row.field === 'hp')
    expect(hpRow).toBeDefined()
    expect(hpRow!.count).toBe(2) // 只有 '100' 与 120 有效
  })

  it('数量约束问题优先于平衡性问题（issues 排序）', () => {
    const systems = { social: { name: '社交系统', data_type: 'role', config: { count: 1 } } }
    const verdict = evaluateDataCandidates({ roles: [{ hp: 100 }, { hp: 1000 }] }, {
      types: [spinboxType],
      systems
    })
    expect(verdict.issues[0]!.kind).toBe('count_limit')
    expect(verdict.issues.some((issue) => issue.kind === 'balance')).toBe(true)
  })

  it('空候选 ⇒ total 为 0、无问题', () => {
    const verdict = evaluateDataCandidates({}, { types: [spinboxType] })
    expect(verdict.total).toBe(0)
    expect(verdict.issues).toHaveLength(0)
    expect(verdict.hasIssues).toBe(false)
  })
})
