import { describe, expect, it } from 'vitest'

import {
  FIELD_ACTIONS,
  FIELD_ACTION_LABELS,
  FIELD_ACTION_TITLES,
  buildFieldActionInstruction
} from '../../src/shared/ceshu/ceshuFieldAction'

describe('ceshuFieldAction：局部重生成动作词表', () => {
  it('四个动作均有标签、说明与任务指令（UI / 提示词不缺口）', () => {
    expect(FIELD_ACTIONS).toEqual(['rewrite', 'expand', 'condense', 'explain'])
    for (const action of FIELD_ACTIONS) {
      expect(FIELD_ACTION_LABELS[action]).not.toBe('')
      expect(FIELD_ACTION_TITLES[action]).not.toBe('')
      expect(buildFieldActionInstruction(action)).not.toBe('')
      // 指令必须带动作名标记：提示词审计与测试排查都靠它定位
      expect(buildFieldActionInstruction(action)).toContain('【本次任务')
    }
  })

  it('各动作指令有的放矢：改写不增删、展开不改编、精简压篇幅、通俗化要白话', () => {
    expect(buildFieldActionInstruction('rewrite')).toContain('不要新增或删除要点')
    expect(buildFieldActionInstruction('expand')).toContain('不要改变原有结论')
    expect(buildFieldActionInstruction('condense')).toContain('一半')
    expect(buildFieldActionInstruction('explain')).toContain('白话')
  })

  it('无动作返回空串（调用方按需拼接，保证提示词零膨胀）', () => {
    expect(buildFieldActionInstruction(undefined)).toBe('')
  })
})
