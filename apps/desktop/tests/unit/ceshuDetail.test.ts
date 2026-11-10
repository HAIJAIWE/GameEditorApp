import { describe, expect, it } from 'vitest'

import type { CeshuFieldKind } from '@mobai/shared/ceshu/reference'
// 深插 `prompts` 目录内的文件是被禁止的（能力文件夹只许走 index.ts）。本批模块的
// 入口导出由集成阶段统一加进 `ceshu/prompts/index.ts`（该目录同时有多个改动方在写，
// 逐人各改一次 index.ts 只会互相踩）；接线完成后改用 `@mobai/shared/ceshu/prompts` 桶。
/* eslint-disable local/no-deep-capability-import -- 桶导出由集成阶段统一接线，接线后改走 `@mobai/shared/ceshu/prompts` */
import {
  CESHU_DETAIL_REQUIREMENTS,
  buildFieldBriefBlock,
  fieldBriefLine,
  referenceVolume
} from '@mobai/shared/ceshu/prompts/ceshuDetail'
/* eslint-enable local/no-deep-capability-import */

/**
 * 字段写作契约的逐字锁定。
 *
 * 这层文本会**原样进入模型上下文**，所以测试盯的不是「函数能跑」，而是三条口径：
 * 1. 一行里必须同时给出「类型 · 必填性 · 该写什么 · 参考量级」——少一项模型就会退回写概述；
 * 2. 长度只能以「参考量级」出现（2026-10-26 去字数指标化），不能变成字数下限；
 * 3. 表格/单选/数字各自带着列、可选值、区间这三份契约，不能让模型自己去猜。
 */

const KIND_LABELS_EXPECTED: ReadonlyArray<[CeshuFieldKind, string]> = [
  ['textarea', '多行文本'],
  ['text', '短文本'],
  ['stringList', '条目列表'],
  ['pipeList', '表格'],
  ['number', '数字'],
  ['combo', '单选'],
  ['multiCombo', '多选'],
  ['json', '结构化数据']
]

describe('fieldBriefLine：一行字段契约', () => {
  it('完整一行：标签（key · 类型 · 必填）：该写什么；参考量级', () => {
    const line = fieldBriefLine({
      key: 'core_combat_rhythm',
      label: '战斗节奏',
      kind: 'textarea',
      required: true,
      aiHint: '写清战斗的节奏档位与切换条件'
    })
    expect(line).toBe(
      '- 战斗节奏（core_combat_rhythm · 多行文本 · 必填）：写清战斗的节奏档位与切换条件；参考量级：150–400 字，至少 3 条可执行细节'
    )
  })

  it('八个 kind 的中文类型名逐一对上', () => {
    for (const [kind, label] of KIND_LABELS_EXPECTED) {
      const line = fieldBriefLine({ key: 'k', label: '字段', kind, required: false, aiHint: '写结论' })
      expect(line).toContain(`· ${label} · 选填`)
      expect(referenceVolume(kind)).not.toBe('')
    }
  })

  it('aiHint 缺省给中性默认，不留悬空冒号', () => {
    const line = fieldBriefLine({ key: 'sync', label: '同步方式', kind: 'text', required: false })
    expect(line.startsWith('- 同步方式（sync · 短文本 · 选填）：')).toBe(true)
    // 冒号后必须直接是可执行的要求，而不是「；参考量级」这种空档
    expect(line).not.toContain('）：；')
    expect(line).toContain('待确认')
  })

  it('aiHint 全是空白也按缺省处理', () => {
    const blank = fieldBriefLine({ key: 'k', label: '字段', kind: 'text', required: false, aiHint: '   ' })
    const missing = fieldBriefLine({ key: 'k', label: '字段', kind: 'text', required: false })
    expect(blank).toBe(missing)
  })

  it('pipeList 带列契约「列：A | B | C」', () => {
    const line = fieldBriefLine({
      key: 'battle_params',
      label: '战斗参数表',
      kind: 'pipeList',
      required: true,
      aiHint: '给出可复算的参数',
      columns: [
        { key: 'name', label: '参数' },
        { key: 'value', label: '当前值' },
        { key: 'note', label: '说明' }
      ]
    })
    expect(line).toContain('列：参数 | 当前值 | 说明')
    expect(line).toContain('参考量级：3–8 行，每行每列都要填')
  })

  it('combo 带可选值', () => {
    const line = fieldBriefLine({
      key: 'combat_pace',
      label: '战斗节奏档',
      kind: 'combo',
      required: false,
      aiHint: '挑一个节奏档',
      values: ['轻量档', '标准档', '硬核档']
    })
    expect(line).toContain('可选值：轻量档 / 标准档 / 硬核档')
  })

  it('number 带区间（双端 / 单端）', () => {
    const both = fieldBriefLine({ key: 'level_cap', label: '等级上限', kind: 'number', required: true, from: 1, to: 99 })
    expect(both).toContain('区间：1–99')
    const fromOnly = fieldBriefLine({ key: 'cooldown', label: '冷却', kind: 'number', required: false, from: 3 })
    expect(fromOnly).toContain('区间：≥ 3')
    const toOnly = fieldBriefLine({ key: 'weight', label: '权重', kind: 'number', required: false, to: 10 })
    expect(toOnly).toContain('区间：≤ 10')
    expect(fieldBriefLine({ key: 'n', label: '数量', kind: 'number', required: false })).not.toContain('区间：')
  })

  it('其它类型上的 from/to 不渲染成区间（避免误导）', () => {
    const line = fieldBriefLine({ key: 'note', label: '备注', kind: 'textarea', required: false, from: 1, to: 5 })
    expect(line).not.toContain('区间：')
  })

  it('label 为空时回落 key，至于不出现空标签', () => {
    const line = fieldBriefLine({ key: 'x', label: '  ', kind: 'text', required: false })
    expect(line.startsWith('- x（x · 短文本 · 选填）：')).toBe(true)
  })
})

describe('buildFieldBriefBlock', () => {
  it('空输入返回空串，不留空行', () => {
    expect(buildFieldBriefBlock([])).toBe('')
  })

  it('一行一个字段，末尾无多余空行', () => {
    const block = buildFieldBriefBlock([
      { key: 'a', label: '甲', kind: 'text', required: true },
      { key: 'b', label: '乙', kind: 'number', required: false, from: 1, to: 9 }
    ])
    const lines = block.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0].startsWith('- 甲（a · 短文本 · 必填）')).toBe(true)
    expect(lines[1].startsWith('- 乙（b · 数字 · 选填）')).toBe(true)
    expect(block.endsWith('\n')).toBe(false)
  })
})

describe('referenceVolume', () => {
  it('多行文本 / 条目列表 / 表格 的量级与形状', () => {
    expect(referenceVolume('textarea')).toBe('150–400 字，至少 3 条可执行细节')
    expect(referenceVolume('stringList')).toBe('3–6 条，每条一句可核对的话')
    expect(referenceVolume('pipeList')).toBe('3–8 行，每行每列都要填')
  })

  it('短文本 / 数字 / 结构化数据', () => {
    expect(referenceVolume('text')).toBe('20–60 字')
    expect(referenceVolume('number')).toBe('给整数并写清单位/口径')
    expect(referenceVolume('json')).toBe('给出键名与示例值')
  })
})

describe('CESHU_DETAIL_REQUIREMENTS：交付标准', () => {
  it('覆盖四点：参考量级 / 编号步骤 / 数字锚点 / 取舍', () => {
    for (const keyword of ['参考量级', '编号步骤', '数字锚点', '为什么不选另一种']) {
      expect(CESHU_DETAIL_REQUIREMENTS).toContain(keyword)
    }
  })

  it('步骤要写清输入→动作→判定条件→异常处理', () => {
    for (const keyword of ['输入', '动作', '判定条件', '失败/异常']) {
      expect(CESHU_DETAIL_REQUIREMENTS).toContain(keyword)
    }
  })

  it('长度只是参考量级，不是字数下限', () => {
    expect(CESHU_DETAIL_REQUIREMENTS).toContain('不是字数下限')
    expect(CESHU_DETAIL_REQUIREMENTS).not.toMatch(/至少\s*[0-9]+\s*字/)
  })

  it('引用禁编造的「待确认」口径，但不复述整段', () => {
    expect(CESHU_DETAIL_REQUIREMENTS).toContain('待确认')
    expect(CESHU_DETAIL_REQUIREMENTS).not.toContain('禁编造（硬约束）')
    expect(CESHU_DETAIL_REQUIREMENTS.split('\n').length).toBeLessThanOrEqual(7)
  })
})
