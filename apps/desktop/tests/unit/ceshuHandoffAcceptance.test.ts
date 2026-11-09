import { describe, expect, it } from 'vitest'

import type { DataTableCheckResult } from '@mobai/shared/ceshu/data'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import type { ContractAssertion, DesignContract } from '@mobai/shared/ceshu/validation'
import {
  evaluateHandoffAcceptance,
  evaluateHandoffAcceptances,
  summarizeHandoffAcceptances
} from '@mobai/shared/ceshu/workflow'

/**
 * 交接包验收的机器判定。
 *
 * 钉住的是「结论口径」而不是「文案」：pass / fail / skip / unverified 各自什么时候出现，
 * 以及**绝不替 test / manual 盖章**这条底线（否则整条「让 AI 开发」的链路又回到
 * 「AI 自述完成」）。
 */

function makeDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '测试游戏' })
}

function assertion(overrides: Partial<ContractAssertion>): ContractAssertion {
  return {
    id: 'A1',
    statement: '普攻伤害',
    expression: 'ATK*1.0-DEF',
    expected: '10',
    tolerance: '±1',
    accept: '误差不超过 1',
    status: 'pass',
    computed: 10,
    ...overrides
  }
}

function contractOf(assertions: ContractAssertion[]): DesignContract {
  return {
    schemaVersion: '1.0',
    rulesetId: 'default',
    gameName: '测试游戏',
    scope: 'full',
    parameters: [],
    assertions,
    prototype: { checks: [], allPassed: false },
    journeys: [],
    testCases: [],
    evidence: []
  }
}

function dataTablesOf(result: Partial<DataTableCheckResult>): DataTableCheckResult {
  return { requirements: [], issues: [], ok: true, ...result }
}

function requirement(tableName: string): DataTableCheckResult['requirements'][number] {
  return { raw: tableName, tableName, purpose: '用途', keyFields: ['id'], expectedCount: 40, isMinimum: false }
}

function issue(
  kind: DataTableCheckResult['issues'][number]['kind'],
  level: 'error' | 'warn',
  table: string
): DataTableCheckResult['issues'][number] {
  return { kind, level, table, message: table + '：' + kind }
}

describe('验收判定 · assertion（拿 contract.json 复算）', () => {
  it('没给契约时只给 skip，不假装通过', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: '伤害公式可复算', check: 'assertion' }, {})
    expect(result.verdict).toBe('skip')
    expect(result.evidence).toContain('没拿到 contract.json')
  })

  it('一条断言都没有时是 fail（不是 pass）', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: '断言', check: 'assertion' }, {
      contract: contractOf([])
    })
    expect(result.verdict).toBe('fail')
    expect(result.evidence).toContain('一条断言都没有')
  })

  it('关键词没命中任何断言时是 fail 并说明关键词', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'assertion', match: '暴击伤害' }, {
      contract: contractOf([assertion({})])
    })
    expect(result.verdict).toBe('fail')
    expect(result.evidence).toContain('没有匹配「暴击伤害」的断言')
  })

  it('全部断言 pass 时给 pass，并列出命中的断言 id', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'assertion', match: '伤害' }, {
      contract: contractOf([
        assertion({ id: 'A1', statement: '普攻伤害' }),
        assertion({ id: 'A2', statement: '技能伤害' })
      ])
    })
    expect(result.verdict).toBe('pass')
    expect(result.evidence).toContain('2 条断言复算通过')
    expect(result.evidence).toContain('A1')
    expect(result.evidence).toContain('A2')
  })

  it('有一条 fail 就是 fail，并给出复算值与期望值', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'assertion' }, {
      contract: contractOf([
        assertion({ id: 'A1', status: 'pass' }),
        assertion({ id: 'A2', statement: '暴击', status: 'fail', computed: 7, expected: '10' })
      ])
    })
    expect(result.verdict).toBe('fail')
    expect(result.evidence).toContain('A2')
    expect(result.evidence).toContain('7')
    expect(result.evidence).toContain('10')
  })

  it('表达式无法复算（error）也算没过', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'assertion' }, {
      contract: contractOf([assertion({ status: 'error' })])
    })
    expect(result.verdict).toBe('fail')
    expect(result.evidence).toContain('表达式无法复算')
  })

  it('全部 skip（依赖参数没数值）时给 skip 而不是 fail', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'assertion' }, {
      contract: contractOf([assertion({ status: 'skip', computed: null })])
    })
    expect(result.verdict).toBe('skip')
    expect(result.evidence).toContain('待确认')
  })
})

describe('验收判定 · data（拿设计↔数据表核对）', () => {
  it('没给核对结果时 skip', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'data' }, {})
    expect(result.verdict).toBe('skip')
  })

  it('策划书还没声明数据表时 skip（那是没写，不是不符）', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'data' }, {
      dataTables: dataTablesOf({})
    })
    expect(result.verdict).toBe('skip')
    expect(result.evidence).toContain('还没声明')
  })

  it('声明的表都建齐时 pass', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'data' }, {
      dataTables: dataTablesOf({ requirements: [requirement('敌人表')] })
    })
    expect(result.verdict).toBe('pass')
    expect(result.evidence).toContain('1 张')
  })

  it('有 error 级不符时 fail，并带上具体消息', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'data' }, {
      dataTables: dataTablesOf({
        requirements: [requirement('敌人表')],
        issues: [issue('missing_table', 'error', '敌人表')]
      })
    })
    expect(result.verdict).toBe('fail')
    expect(result.evidence).toContain('敌人表')
  })

  it('只有 warning 时 skip（不足以判定没建）', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'data' }, {
      dataTables: dataTablesOf({
        requirements: [requirement('敌人表')],
        issues: [issue('count_short', 'warn', '敌人表')]
      })
    })
    expect(result.verdict).toBe('skip')
  })

  it('match 关键词只核对相关表：别的表缺了不算这条没过', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'data', match: '关卡' }, {
      dataTables: dataTablesOf({
        requirements: [requirement('关卡表'), requirement('敌人表')],
        issues: [issue('missing_table', 'error', '敌人表')]
      })
    })
    expect(result.verdict).toBe('pass')
  })
})

describe('验收判定 · field（拿策划书字段核对写没写）', () => {
  it('没给文档时 skip', () => {
    const result = evaluateHandoffAcceptance('d-a1', {
      text: 'x',
      check: 'field',
      fields: [{ chapter: 'meta', field: 'positioning' }]
    }, {})
    expect(result.verdict).toBe('skip')
  })

  it('没指定字段时 skip（配置错了不该当成通过）', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'field' }, { doc: makeDoc() })
    expect(result.verdict).toBe('skip')
    expect(result.evidence).toContain('没指定')
  })

  it('字段写了 pass，但 evidence 明确标「文档级，不等于实现完成」', () => {
    const doc = makeDoc()
    doc.meta.positioning = '一款仙侠开放世界 RPG'
    const result = evaluateHandoffAcceptance('d-a1', {
      text: 'x',
      check: 'field',
      fields: [{ chapter: 'meta', field: 'positioning' }]
    }, { doc })
    expect(result.verdict).toBe('pass')
    expect(result.evidence).toContain('不等于实现完成')
  })

  it('空字段是 fail，并点名是哪个字段', () => {
    const result = evaluateHandoffAcceptance('d-a1', {
      text: 'x',
      check: 'field',
      fields: [
        { chapter: 'meta', field: 'positioning' },
        { chapter: 'meta', field: 'non_goals' }
      ]
    }, { doc: makeDoc() })
    expect(result.verdict).toBe('fail')
    expect(result.evidence).toContain('meta.positioning')
    expect(result.evidence).toContain('meta.non_goals')
  })

  it('支持点路径（系统配置与画像都落在嵌套结构里）', () => {
    const doc = makeDoc()
    const systems = doc.systems as Record<string, { config?: Record<string, unknown> }>
    systems.equipment = { config: { slot_count: 6 } }
    const result = evaluateHandoffAcceptance('d-a1', {
      text: 'x',
      check: 'field',
      fields: [{ chapter: 'systems', field: 'equipment.config.slot_count' }]
    }, { doc })
    expect(result.verdict).toBe('pass')
  })

  it('点路径只填了外壳（对象里没值）不算写', () => {
    const doc = makeDoc()
    const result = evaluateHandoffAcceptance('d-a1', {
      text: 'x',
      check: 'field',
      fields: [{ chapter: 'systems', field: 'equipment.config.slot_count' }]
    }, { doc })
    expect(result.verdict).toBe('fail')
  })
})

describe('验收判定 · test / manual 永不由机器盖章', () => {
  it('test 恒 unverified，并写明「AI 自述不算过」', () => {
    const result = evaluateHandoffAcceptance('d-a1', { text: 'x', check: 'test' }, {})
    expect(result.verdict).toBe('unverified')
    expect(result.evidence).toContain('AI 自述不算过')
  })

  it('manual 恒 unverified，how 会带进依据里', () => {
    const result = evaluateHandoffAcceptance('d-a1', {
      text: 'x',
      check: 'manual',
      how: '对照 tech.core_architecture 逐条看'
    }, {})
    expect(result.verdict).toBe('unverified')
    expect(result.evidence).toContain('对照 tech.core_architecture 逐条看')
  })

  it('老文档的纯字符串验收按 manual 处理（不猜判定方式）', () => {
    const result = evaluateHandoffAcceptance('d-a1', '按文档跑通一遍', {})
    expect(result.check).toBe('manual')
    expect(result.verdict).toBe('unverified')
  })
})

describe('批量判定与汇总', () => {
  it('id 与 index.json 同一套编号（docId-a序号）', () => {
    const results = evaluateHandoffAcceptances('arch-scope', [
      { text: 'a', check: 'field', fields: [{ chapter: 'meta', field: 'positioning' }] },
      'b'
    ], { doc: makeDoc() })
    expect(results.map((result) => result.id)).toEqual(['arch-scope-a1', 'arch-scope-a2'])
    expect(results[1].text).toBe('b')
  })

  it('汇总把 machine 与 unverified 分开数', () => {
    const doc = makeDoc()
    doc.meta.positioning = '有内容'
    const results = evaluateHandoffAcceptances('d', [
      { text: 'a', check: 'field', fields: [{ chapter: 'meta', field: 'positioning' }] },
      { text: 'b', check: 'field', fields: [{ chapter: 'meta', field: 'non_goals' }] },
      { text: 'c', check: 'assertion' },
      'd',
      { text: 'e', check: 'test' }
    ], { doc, contract: contractOf([assertion({})]) })
    const summary = summarizeHandoffAcceptances(results)
    expect(summary.total).toBe(5)
    expect(summary.pass).toBe(2)
    expect(summary.fail).toBe(1)
    expect(summary.unverified).toBe(2)
    expect(summary.machine).toBe(3)
  })
})
