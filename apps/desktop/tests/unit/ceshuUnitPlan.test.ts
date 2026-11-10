import { describe, expect, it } from 'vitest'

import { chapterFieldsForDoc, createDefaultCeshu } from '@mobai/shared/ceshu/model'
import {
  CHAPTER_UNIT_MAX_FIELDS,
  buildChapterUnitPlan,
  chapterUnitSummary,
  mergeUnitFields,
  unitFieldKeys
} from '@mobai/shared/ceshu/prompts'

/**
 * 整章 → 多单元生成计划的锁定用例。
 *
 * 这层错了不会报错，只会静默退化回「一次索要整章 33 字段」的老问题
 * （输出被截断归零、每字段几十字），线上极难归因。所以用例盯三类不变量：
 * 1. 切分口径：单元数、单单元 ≤ 上限、并集 = 全字段集、派生字段跟本体；
 * 2. 提示词收窄：每单元 prompt 只列本单元字段、system 只承诺本单元字段；
 * 3. 边界：空章 / 未知章不抛错，extraPrompt 落点一致。
 */
const FULL = createDefaultCeshu({ scope: 'full' })
const APP = createDefaultCeshu({ scope: 'full', docKind: 'application' })

/** 取某单元里「派生字段」(_points/_notes) 的本体 key */
function baseKey(key: string): string {
  return key.replace(/_(points|notes)$/, '')
}

describe('buildChapterUnitPlan：单元切分', () => {
  it('字段多的章（combat，33 字段）切成多个单元，每个 ≤ 上限且并集 = 全字段集', () => {
    const keys = unitFieldKeys(FULL, 'combat')
    expect(keys).toHaveLength(33)

    const plan = buildChapterUnitPlan(FULL, 'combat')
    expect(plan.length).toBeGreaterThan(1)
    expect(plan.map((unit) => unit.id)).toEqual(plan.map((_, index) => `u${index + 1}`))

    // 单单元不超过上限：超了就等于又把整章塞回一次调用
    for (const unit of plan) {
      expect(unit.fields.length).toBeGreaterThan(0)
      expect(unit.fields.length).toBeLessThanOrEqual(CHAPTER_UNIT_MAX_FIELDS)
    }

    // 并集 = 全字段集，且不重复：漏字段 ⇒ 永远生成不出来；重复 ⇒ 白花一次调用
    const merged = mergeUnitFields(plan)
    expect([...merged].sort()).toEqual([...keys].sort())
    expect(new Set(merged).size).toBe(keys.length)

    // 章节 label 参与单元命名（不是直接拿英文 key 当标题）
    expect(plan[0].label).toContain('战斗模式')
  })

  it('字段数 ≤ 上限的章只返回 1 个单元，字段与 unitFieldKeys 完全一致', () => {
    // 应用档「术语表」章只有 1 个字段（游戏 24 章最少也有 7 个，故用应用档做单单元夹具）
    expect(unitFieldKeys(APP, 'glossary')).toEqual(['terms'])
    const plan = buildChapterUnitPlan(APP, 'glossary')
    expect(plan).toHaveLength(1)
    expect(plan[0].id).toBe('u1')
    expect(plan[0].fields).toEqual(unitFieldKeys(APP, 'glossary'))
    expect(plan[0].label).toBe('术语表')
  })

  it('meta 章（14 字段）按默认上限切分，放宽上限后回到 1 个单元', () => {
    const keys = unitFieldKeys(FULL, 'meta')
    expect(keys).toHaveLength(14)
    expect(buildChapterUnitPlan(FULL, 'meta').length).toBeGreaterThan(1)

    // 上限 = 字段总数时「切分」退化为单单元，字段清单必须与 unitFieldKeys 逐项一致（含顺序）
    const single = buildChapterUnitPlan(FULL, 'meta', { maxFieldsPerUnit: keys.length })
    expect(single).toHaveLength(1)
    expect(single[0].fields).toEqual(keys)
  })

  it('派生字段（x_points / x_notes）与本体同单元，不单独成组', () => {
    for (const chapter of ['combat', 'uiux', 'systems']) {
      for (const unit of buildChapterUnitPlan(FULL, chapter)) {
        for (const key of unit.fields) {
          if (key.endsWith('_points') || key.endsWith('_notes')) {
            expect(unit.fields).toContain(baseKey(key))
          }
        }
      }
    }
  })
})

describe('buildChapterUnitPlan：提示词收窄', () => {
  it('每单元 prompt 只列本单元字段', () => {
    const plan = buildChapterUnitPlan(FULL, 'combat')
    for (const unit of plan) {
      // 字段清单段只列本单元字段（清单行的渲染格式由 ceshuAi 决定，这里只锁「在不在」）
      expect(unit.prompt).toContain('该章节需要填充的字段列表:')
      for (const key of unit.fields) expect(unit.prompt).toContain(key)

      // 别的单元独有的字段 key 不得出现在本单元提示词里（否则模型会顺带写、又被 JSON 截断）
      const others = plan.filter((other) => other.id !== unit.id).flatMap((other) => other.fields)
      for (const key of others) {
        if (unit.fields.includes(key)) continue
        expect(unit.prompt).not.toContain(key)
      }
    }
  })

  it('每单元 prompt 只写本单元的字段说明（label 不跨单元泄漏）', () => {
    // 选 uiux：章节提示里不含「设计原则」「交互反馈规范」，标签断言不会被提示语污染
    const plan = buildChapterUnitPlan(FULL, 'uiux')
    expect(plan).toHaveLength(2)
    const [u1, u2] = plan

    expect(u1.fields).toEqual(
      expect.arrayContaining(['design_principles', 'design_principles_points', 'design_principles_notes'])
    )
    expect(u2.fields).toEqual(expect.arrayContaining(['feedback_rules', 'usability_standards']))

    expect(u1.prompt).toContain('设计原则')
    expect(u1.prompt).not.toContain('交互反馈规范')

    expect(u2.prompt).toContain('交互反馈规范')
    expect(u2.prompt).not.toContain('设计原则')

    // 单元名同理：u2 的标题不该出现 u1 的字段名
    expect(u1.label).toContain('设计原则')
  })

  it('每单元 system 都收窄成「仅生成下面列出的字段」', () => {
    for (const chapter of ['combat', 'uiux', 'meta']) {
      for (const unit of buildChapterUnitPlan(FULL, chapter)) {
        expect(unit.system).toContain('仅生成下面列出的字段')
        // 整章 system 的「完整内容」措辞不得残留：那是把篇幅分给整章的开关
        expect(unit.system).not.toContain('完整内容')
        expect(unit.system).toContain(chapter)
        expect(unit.system).not.toContain('{"')
      }
    }
  })

  it('extraPrompt 追加在每个单元的 prompt 末尾', () => {
    const extraPrompt = '【章节】combat\n【用户输入】必须写清连招取消窗口 0.15s'
    const plan = buildChapterUnitPlan(FULL, 'combat', { extraPrompt })
    expect(plan.length).toBeGreaterThan(1)
    for (const unit of plan) {
      expect(unit.prompt.endsWith(extraPrompt)).toBe(true)
      expect(unit.prompt.match(/【用户输入】/g)).toHaveLength(1)
    }
  })
})

describe('buildChapterUnitPlan：边界与摘要', () => {
  it('空字段 / 未知章返回 [] 且不抛错（调用方按空数组跳过）', () => {
    expect(buildChapterUnitPlan(FULL, '')).toEqual([])
    expect(buildChapterUnitPlan(FULL, 'not_a_chapter')).toEqual([])
    expect(() => buildChapterUnitPlan(FULL, 'not_a_chapter')).not.toThrow()
    expect(unitFieldKeys(FULL, 'not_a_chapter')).toEqual([])
  })

  it('只规划字段表里存在的字段：系统控制字段（template_version / enabled_modules）不进单元', () => {
    const keys = unitFieldKeys(FULL, 'meta')
    expect(keys).not.toContain('template_version')
    expect(keys).not.toContain('enabled_modules')
    for (const unit of buildChapterUnitPlan(FULL, 'meta')) {
      expect(unit.fields).not.toContain('template_version')
      expect(unit.fields).not.toContain('enabled_modules')
    }
    // 但字段表仍是权威来源：meta 的字段表 14 项里含 template_version 之外的常规字段
    expect(chapterFieldsForDoc(FULL, 'meta').length).toBeGreaterThan(0)
  })

  it('chapterUnitSummary 给出字段数、单元数与每单元上限', () => {
    const plan = buildChapterUnitPlan(FULL, 'combat')
    const summary = chapterUnitSummary(plan)
    expect(summary).toContain('33 个字段')
    expect(summary).toContain(`${plan.length} 个单元`)
    expect(summary).toContain('每单元 ≤6 字段')
    for (const unit of plan) expect(summary).toContain(`${unit.id} ${unit.label}`)

    // 与 maxFieldsPerUnit 联动，且空计划返回空串
    expect(chapterUnitSummary(plan, { maxFieldsPerUnit: 3 })).toContain('每单元 ≤3 字段')
    expect(chapterUnitSummary([])).toBe('')
  })
})
