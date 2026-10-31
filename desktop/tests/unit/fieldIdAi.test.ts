import { describe, expect, it } from 'vitest'

import {
  FIELD_ID_AI_MAX_CANDIDATES,
  buildFieldIdPrompt,
  parseFieldIdCandidates
} from '../../src/shared/util/id'
import { validateFieldId } from '../../src/shared/util/id'

describe('fieldIdAi：提示词构建', () => {
  const built = buildFieldIdPrompt('斗能', ['id', 'name', 'job'], { typeName: '角色', fieldType: 'spinbox' })

  it('system 约束只输出 JSON（对齐 ceshuDataGen 的写法）', () => {
    expect(built.system).toContain('只输出一个合法 JSON 对象')
    expect(built.system).toContain('不输出任何解释')
  })

  it('提示词含字段信息、已有字段名与命名规范', () => {
    expect(built.prompt).toContain('显示名：斗能')
    expect(built.prompt).toContain('所属数据类型：角色')
    expect(built.prompt).toContain('控件类型：spinbox')
    expect(built.prompt).toContain('[已有字段名（不得重复）]\nid, name, job')
    // 关键规范：语义优先、不用拼音（这正是自造词的正确答案来源）
    expect(built.prompt).toContain('语义优先')
    expect(built.prompt).toContain('不要用拼音')
    expect(built.prompt).toContain('snake_case')
    expect(built.prompt).toContain('不能以数字开头')
  })

  it('给出候选数量与输出格式示例', () => {
    expect(built.prompt).toContain(`给出 ${FIELD_ID_AI_MAX_CANDIDATES} 个候选`)
    expect(built.prompt).toContain('{"candidates"')
    expect(built.prompt).toContain('combat_energy')
  })

  it('无已有字段名时显示「（无）」；无 context 时不出现相应行', () => {
    const bare = buildFieldIdPrompt('斗能', [])
    expect(bare.prompt).toContain('[已有字段名（不得重复）]\n（无）')
    expect(bare.prompt).not.toContain('所属数据类型')
    expect(bare.prompt).not.toContain('控件类型')
  })

  it('已有字段名去空白与空串', () => {
    const withBlank = buildFieldIdPrompt('斗能', [' hp ', '', '   ', 'atk'])
    expect(withBlank.prompt).toContain('hp, atk')
  })
})

describe('fieldIdAi：响应解析', () => {
  it('标准 JSON 对象', () => {
    const result = parseFieldIdCandidates('{"candidates": ["combat_energy", "fight_energy"]}')
    expect(result.map((s) => s.id)).toEqual(['combat_energy', 'fight_energy'])
    expect(result.every((s) => s.source === 'ai')).toBe(true)
    expect(result.every((s) => s.skipped.length === 0 && s.renamedFrom === null)).toBe(true)
  })

  it('容错：markdown 围栏 / 前后多余文字 / 尾逗号', () => {
    expect(parseFieldIdCandidates('```json\n{"candidates": ["a_b"]}\n```').map((s) => s.id)).toEqual(['a_b'])
    expect(
      parseFieldIdCandidates('好的，以下是候选：{"candidates": ["a_b", "c_d"]} 希望有帮助').map((s) => s.id)
    ).toEqual(['a_b', 'c_d'])
    expect(parseFieldIdCandidates('{"candidates": ["a_b",]}').map((s) => s.id)).toEqual(['a_b'])
  })

  it('容错：模型换键名（任意字符串数组值）', () => {
    expect(parseFieldIdCandidates('{"ids": ["a_b", "c_d"]}').map((s) => s.id)).toEqual(['a_b', 'c_d'])
  })

  it('容错：模型只回了裸数组', () => {
    expect(parseFieldIdCandidates('["combat_energy", "fight_energy"]').map((s) => s.id)).toEqual([
      'combat_energy',
      'fight_energy'
    ])
  })

  it('清洗：大写 / 空格 / 连字符统一为小写下划线', () => {
    // 第三项归一后与第二项相同 → 属重复项，被丢弃（不是加后缀）
    expect(
      parseFieldIdCandidates('{"candidates": ["CombatEnergy", "Combat Energy", "combat-energy"]}').map((s) => s.id)
    ).toEqual(['combatenergy', 'combat_energy'])
  })

  it('清洗后仍不合法的一律丢弃（绝不"修一修凑合用"）', () => {
    const result = parseFieldIdCandidates(
      '{"candidates": ["1hp", "中文", "", "   ", "a.b", "ok_id", 42, {"x": 1}, null]}'
    )
    // '1hp' 以数字开头 → 丢；'中文' 清洗后为空 → 丢；'a.b' → 'a_b' 合法保留
    expect(result.map((s) => s.id)).toEqual(['a_b', 'ok_id'])
    for (const suggestion of result) {
      expect(validateFieldId(suggestion.id).ok).toBe(true)
    }
  })

  it('与已有字段名重复时加后缀，而不是丢弃', () => {
    const result = parseFieldIdCandidates('{"candidates": ["atk", "crit_rate"]}', ['atk'])
    expect(result.map((s) => s.id)).toEqual(['atk_2', 'crit_rate'])
    expect(result[0]?.renamedFrom).toBe('atk')
  })

  it('AI 自身重复项去重', () => {
    expect(parseFieldIdCandidates('{"candidates": ["a_b", "a_b", "A_B", "c_d"]}').map((s) => s.id)).toEqual([
      'a_b',
      'c_d'
    ])
  })

  it('候选数上限为 3', () => {
    const result = parseFieldIdCandidates('{"candidates": ["a_1", "b_2", "c_3", "d_4", "e_5"]}')
    expect(result).toHaveLength(FIELD_ID_AI_MAX_CANDIDATES)
  })

  it('彻底不可解析时返回空数组（由调用方给中文提示）', () => {
    expect(parseFieldIdCandidates('')).toEqual([])
    expect(parseFieldIdCandidates('抱歉，我无法完成这个请求。')).toEqual([])
    expect(parseFieldIdCandidates('{"candidates": "combat_energy"}')).toEqual([])
  })
})
