import { describe, expect, it } from 'vitest'

import {
  buildCountConstraintMessage,
  countLimitFieldNames,
  exceedsCountConstraint,
  findCountConstraint,
  resolveCountLimit
} from '../../src/shared/util/dataCountConstraint'

/**
 * 数量约束纯逻辑 —— 对照 旧版 `ui/data_tab::DataEditorTab._check_count_constraint`
 * 的逐条分支写用例（字段优先级 / 值类型容忍 / 非法值跳过 / 无上限即不约束 / 超限判定 / 提示文案）。
 */
describe('数量约束：上限字段优先级', () => {
  it('字段顺序与 旧版 字面量一致：count → <type>_count → max_count → total_count', () => {
    expect(countLimitFieldNames('skill')).toEqual(['count', 'skill_count', 'max_count', 'total_count'])
  })

  it('取第一个可解析字段（靠前者胜出）', () => {
    expect(resolveCountLimit({ count: 3, skill_count: 9 }, 'skill')).toBe(3)
    expect(resolveCountLimit({ skill_count: 9, max_count: 4 }, 'skill')).toBe(9)
    expect(resolveCountLimit({ max_count: 4, total_count: 7 }, 'skill')).toBe(4)
  })

  it('支持整数字符串（含空白与正负号）；遇到非法值跳过继续试下一个字段', () => {
    expect(resolveCountLimit({ count: ' 12 ' }, 'skill')).toBe(12)
    expect(resolveCountLimit({ count: '+5' }, 'skill')).toBe(5)
    expect(resolveCountLimit({ count: '3.5', skill_count: '6' }, 'skill')).toBe(6)
    expect(resolveCountLimit({ count: 'abc', max_count: 2 }, 'skill')).toBe(2)
  })

  it('浮点被跳过并继续试下一个字段；布尔不算数字（**刻意偏离** 旧版 的 `int(True) == 1`）', () => {
    expect(resolveCountLimit({ count: 2.5, skill_count: 8 }, 'skill')).toBe(8)
    // 旧版 里 `isinstance(True, (int, str))` 为真、`int(True) == 1` ⇒ 会得到上限 1；
    // TS 显式跳过（上限字段出现布尔本身就是数据错误）。实测对照见 migration-audit 的 E51 偏离小节。
    expect(resolveCountLimit({ count: true }, 'skill')).toBeNull()
  })

  it('字符串只认十进制字面量：下划线分隔 / 全角数字被拒绝（**刻意偏离** 旧版 宽松的 `int()`）', () => {
    // 旧版: int('1_0') == 10、int('１２') == 12；这里一律跳过
    expect(resolveCountLimit({ count: '1_0', max_count: 4 }, 'skill')).toBe(4)
    expect(resolveCountLimit({ count: '１２' }, 'skill')).toBeNull()
  })

  it('JS 无法区分 3 与 3.0：整值数字按生效处理（旧版 把 3.0 当 float 跳过，语言层不可复现）', () => {
    expect(resolveCountLimit({ count: 3 }, 'skill')).toBe(3)
    expect(resolveCountLimit({ count: JSON.parse('{"count":3.0}').count }, 'skill')).toBe(3)
  })

  it('config 缺失 / 非对象 / 无任何候选字段 → null', () => {
    expect(resolveCountLimit(undefined, 'skill')).toBeNull()
    expect(resolveCountLimit(null, 'skill')).toBeNull()
    expect(resolveCountLimit('12', 'skill')).toBeNull()
    expect(resolveCountLimit([], 'skill')).toBeNull()
    expect(resolveCountLimit({}, 'skill')).toBeNull()
  })
})

describe('数量约束：定位约束系统', () => {
  const systems = {
    skills: { enabled: true, name: '技能系统', data_type: 'skill', config: { skill_count: '8' } },
    roles: { enabled: true, name: '角色系统', data_type: 'role', config: { count: 3 } }
  }

  it('按 data_type 命中系统并返回 key / 名称 / 上限', () => {
    expect(findCountConstraint(systems, 'skill')).toEqual({ key: 'skills', name: '技能系统', limit: 8 })
    expect(findCountConstraint(systems, 'role')).toEqual({ key: 'roles', name: '角色系统', limit: 3 })
  })

  it('没有匹配系统 / systems 非对象 / 类型为空串 → null（无策划书上下文时不约束）', () => {
    expect(findCountConstraint(systems, 'monster')).toBeNull()
    expect(findCountConstraint(null, 'skill')).toBeNull()
    expect(findCountConstraint(undefined, 'skill')).toBeNull()
    expect(findCountConstraint('nope', 'skill')).toBeNull()
    expect(findCountConstraint(systems, '')).toBeNull()
  })

  it('命中系统但无有效上限（缺失 / 负数 / 0 / 非法字符串）→ null；不继续找下一个系统', () => {
    expect(findCountConstraint({ skills: { data_type: 'skill' } }, 'skill')).toBeNull()
    expect(findCountConstraint({ skills: { data_type: 'skill', config: { count: 0 } } }, 'skill')).toBeNull()
    expect(findCountConstraint({ skills: { data_type: 'skill', config: { count: -4 } } }, 'skill')).toBeNull()
    expect(
      findCountConstraint(
        {
          first: { data_type: 'skill', config: { count: 'x' } },
          second: { data_type: 'skill', config: { count: 5 } }
        },
        'skill'
      )
    ).toBeNull()
  })

  it('系统缺 data_type 时回退到 key（与 computeEnabledEditors 的解析口径一致，刻意偏离 旧版 的严格判断）', () => {
    expect(findCountConstraint({ skill: { name: '技能', config: { count: 2 } } }, 'skill')).toEqual({
      key: 'skill',
      name: '技能',
      limit: 2
    })
  })

  it('系统名缺失/空串时回退到 key；系统值非对象则跳过', () => {
    expect(findCountConstraint({ skill: { data_type: 'skill', config: { count: 2 } } }, 'skill')).toEqual({
      key: 'skill',
      name: 'skill',
      limit: 2
    })
    expect(findCountConstraint({ a: 'x', skill: { data_type: 'skill', config: { count: 2 } } }, 'skill')).not.toBeNull()
  })
})

describe('数量约束：超限判定与提示文案', () => {
  const constraint = { key: 'skills', name: '技能系统', limit: 3 }

  it('未达上限放行、恰好等于上限即拦下（旧版：`current < limit` 才放行）', () => {
    expect(exceedsCountConstraint(0, constraint)).toBe(false)
    expect(exceedsCountConstraint(2, constraint)).toBe(false)
    expect(exceedsCountConstraint(3, constraint)).toBe(true)
    expect(exceedsCountConstraint(4, constraint)).toBe(true)
  })

  it('无约束时恒不放行拦截', () => {
    expect(exceedsCountConstraint(99, null)).toBe(false)
  })

  it('提示文案包含系统名、上限与「正在创建第 N 个」，并给出确认问句', () => {
    const text = buildCountConstraintMessage(constraint, 3)
    expect(text).toContain('策划书「技能系统」规定数量上限为 3')
    expect(text).toContain('当前已有 3 个，正在创建第 4 个。')
    expect(text).toContain('是否继续？')
  })
})
