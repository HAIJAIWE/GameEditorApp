import { describe, expect, it } from 'vitest'

import {
  classifyValidationMessage,
  countValidationBySeverity,
  groupValidationMessages,
  summarizeValidation
} from '../../src/shared/ceshu/ceshuValidationGroups'
import { validateCeshu } from '../../src/shared/ceshu/ceshuValidation'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'

describe('classifyValidationMessage：按文案前缀归类', () => {
  it('硬错误：必填缺失 / 格式异常 / 跨章冲突 / 依赖缺失', () => {
    expect(classifyValidationMessage("文档信息：字段 'game_name' 为必填项")).toMatchObject({
      severity: 'error',
      kind: 'required',
      kindLabel: '必填缺失'
    })
    expect(classifyValidationMessage('第三章：章节数据格式异常')).toMatchObject({
      severity: 'error',
      kind: 'format'
    })
    expect(classifyValidationMessage('一致性冲突：combat.combat_mode 不一致')).toMatchObject({
      severity: 'error',
      kind: 'conflict'
    })
    expect(classifyValidationMessage('依赖缺失：systems.battle 依赖 [character]')).toMatchObject({
      severity: 'error',
      kind: 'dependency'
    })
  })

  it('软警告：跨章不一致 / 内容重复 / 术语不一致', () => {
    expect(classifyValidationMessage('一致性警告：risk_matrix 内容不一致')).toMatchObject({
      severity: 'warning',
      kind: 'inconsistency'
    })
    expect(classifyValidationMessage('内容重复警告：第一章「设计愿景」…重复度 80%')).toMatchObject({
      severity: 'warning',
      kind: 'duplicate'
    })
    expect(classifyValidationMessage('术语不一致：「生命值」/「血量」指同一概念（hp）')).toMatchObject({
      severity: 'warning',
      kind: 'terminology'
    })
  })

  it('未登记的文案落到 other（按建议检查展示，不吞掉）', () => {
    expect(classifyValidationMessage('某个未来新增的问题')).toMatchObject({
      severity: 'warning',
      kind: 'other',
      kindLabel: '其他'
    })
  })
})

describe('groupValidationMessages：分组与顺序', () => {
  const messages = [
    '术语不一致：「生命值」/「血量」指同一概念（hp）',
    "文档信息：字段 'game_name' 为必填项",
    '一致性警告：risk_matrix 内容不一致',
    "第一章：字段 'design_vision' 为必填项",
    '内容重复警告：第一章「设计愿景」重复度 80%'
  ]

  it('必须修复在前、建议检查在后；同类合并', () => {
    const groups = groupValidationMessages(messages)
    expect(groups.map((group) => `${group.severity}:${group.kind}`)).toEqual([
      'error:required',
      'warning:inconsistency',
      'warning:duplicate',
      'warning:terminology'
    ])
    expect(groups[0]?.items).toHaveLength(2)
    expect(groups[0]?.label).toBe('必填缺失')
  })

  it('空输入 → 空分组', () => {
    expect(groupValidationMessages([])).toEqual([])
  })
})

describe('计数与摘要', () => {
  it('分别统计必须修复 / 建议检查', () => {
    const messages = ["a：字段 'x' 为必填项", '一致性冲突：y', '术语不一致：z']
    expect(countValidationBySeverity(messages)).toEqual({ errors: 2, warnings: 1 })
    expect(summarizeValidation(messages)).toBe('2 个必须修复 · 1 个建议检查')
  })

  it('无问题 → 空摘要', () => {
    expect(summarizeValidation([])).toBe('')
  })
})

describe('与 validateCeshu 的集成：真实输出能正确分组', () => {
  it('必填缺失与术语不一致分属两个严重度', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    doc.numeric.balance_principles = '血量随等级增长。血量不足时补防。'

    const groups = groupValidationMessages(validateCeshu(doc))
    const severities = new Set(groups.map((group) => group.severity))
    expect(severities.has('error')).toBe(true) // 必填缺失
    expect(severities.has('warning')).toBe(true) // 术语不一致
    expect(groups.some((group) => group.kind === 'required')).toBe(true)
    expect(groups.some((group) => group.kind === 'terminology')).toBe(true)
  })
})
