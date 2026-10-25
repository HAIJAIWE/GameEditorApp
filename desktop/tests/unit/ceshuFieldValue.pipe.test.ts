import { describe, expect, it } from 'vitest'

import { fieldValueToInput, inputToFieldValue } from '../../src/renderer/src/components/CeshuFieldControl'
import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshuFields'
import type { CeshuFieldDef, ChapterKey } from '../../src/shared/ceshuConstants'

/**
 * pipeList 的「数据值 ↔ 控件值」往返（2026-10-26 修数据丢失后立的守卫）。
 *
 * 两种字段形态必须各自稳定：
 * - **有 columns**（如 qa.test_case_list）：存 `[{列key: 值}]`；
 * - **无 columns**（如 economy.ledger、numeric.numeric_assertions，靠 placeholder 描述列）：
 *   存**字符串行**——管道工具 `ceshuPipeRows.toRows` 就按字符串读。
 *
 * 修复前的 bug：无列字段每行都拆成 `{}`，打开再保存等于清空（27 个字段受影响，
 * 含账本与数值断言这类校验管道依赖的字段）。
 */

function fieldOf(chapter: ChapterKey, key: string): CeshuFieldDef {
  const field = (CESHU_CHAPTER_FIELDS[chapter] ?? []).find((item) => item.key === key)
  if (field === undefined) throw new Error(`字段不存在：${chapter}.${key}`)
  return field
}

describe('pipeList 往返：无 columns 存字符串行', () => {
  it('ledger（账本）：字符串行往返后仍是字符串，不被拆成空对象', () => {
    const field = fieldOf('economy', 'ledger')
    expect(field.columns ?? []).toHaveLength(0)

    const stored = ['首局|4|4,-5|3|否', '首升级|3|6,-2|4|是']
    const input = fieldValueToInput(field, stored)
    expect(input).toBe('首局|4|4,-5|3|否\n首升级|3|6,-2|4|是')
    expect(inputToFieldValue(field, input)).toEqual(stored)
  })

  it('numeric_assertions（数值断言）：往返不丢列分隔符', () => {
    const field = fieldOf('numeric', 'numeric_assertions')
    const stored = ['断言|伤害 = 攻 - 防|100|0.1|≥']
    expect(inputToFieldValue(field, fieldValueToInput(field, stored))).toEqual(stored)
  })

  it('tech.data_tables（新增字段）：同样是字符串行', () => {
    const field = fieldOf('tech', 'data_tables')
    const stored = ['roles|角色表|name,hp,atk', 'skills|技能表|name,cost,damage']
    expect(inputToFieldValue(field, fieldValueToInput(field, stored))).toEqual(stored)
  })

  it('无列字段的历史对象形态：控件里仍能显示出内容（不渲染成空串）', () => {
    const field = fieldOf('resources', 'art_assets')
    const legacy = [{ type: '角色', count: 50, outsource: '30%' }]
    expect(fieldValueToInput(field, legacy)).toBe('角色 | 50 | 30%')
  })

  it('空内容往返为空数组', () => {
    const field = fieldOf('economy', 'ledger')
    expect(inputToFieldValue(field, '')).toEqual([])
    expect(inputToFieldValue(field, '  \n ')).toEqual([])
  })
})

describe('pipeList 往返：有 columns 存对象', () => {
  it('test_case_list：列 key 按定义顺序映射', () => {
    const field = fieldOf('qa', 'test_case_list')
    const stored = [
      { case: '首关通关', type: '功能', precondition: '新号', action: '打完第一关', expected: '结算页出现', status: '待执行' }
    ]
    const input = fieldValueToInput(field, stored)
    expect(input).toBe('首关通关 | 功能 | 新号 | 打完第一关 | 结算页出现 | 待执行')
    expect(inputToFieldValue(field, input)).toEqual(stored)
  })

  it('列数不足的行用空串补齐，不产生 undefined', () => {
    const field = fieldOf('qa', 'test_case_list')
    const rows = inputToFieldValue(field, '只有用例名') as Array<Record<string, string>>
    expect(rows).toHaveLength(1)
    expect(rows[0].case).toBe('只有用例名')
    expect(rows[0].status).toBe('')
    expect(Object.values(rows[0]).every((value) => typeof value === 'string')).toBe(true)
  })
})
