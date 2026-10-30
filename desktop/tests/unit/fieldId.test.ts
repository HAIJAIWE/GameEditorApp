import { describe, expect, it } from 'vitest'

import {
  GAME_TERMS_SUPPLEMENT,
  suggestFieldIds,
  uniquifyFieldId,
  validateFieldId
} from '../../src/shared/util/fieldId'
import { GAME_TERMS } from '../../src/shared/ceshu/glossaryTerms'

describe('fieldId：术语表保真', () => {
  it('条数与 旧版 一致（143 条）', () => {
    expect(Object.keys(GAME_TERMS)).toHaveLength(143)
  })

  it('常用 ARPG 术语抽查', () => {
    expect(GAME_TERMS['攻击力']).toBe('atk')
    expect(GAME_TERMS['暴击率']).toBe('crit_rate')
    expect(GAME_TERMS['暴击伤害']).toBe('crit_dmg')
    expect(GAME_TERMS['冷却时间']).toBe('cooldown')
    expect(GAME_TERMS['生命值']).toBe('hp')
    expect(GAME_TERMS['魔法攻击']).toBe('magic_atk')
    expect(GAME_TERMS['上限']).toBe('max')
    expect(GAME_TERMS['近战']).toBe('melee')
    expect(GAME_TERMS['吸血']).toBe('lifesteal')
  })

  it('补充术语有据可依：加成 → bonus（代码库自身用 hp_bonus/atk_bonus…）', () => {
    expect(GAME_TERMS['加成']).toBeUndefined()
    expect(GAME_TERMS_SUPPLEMENT['加成']).toBe('bonus')
    expect(suggestFieldIds('攻击加成').suggestions[0]?.id).toBe('atk_bonus')
  })
})

describe('fieldId：与 旧版 实测输出逐条对照（回归锁）', () => {
  /**
   * 左列是 `FieldEditorWidget._translate_game_terms` 的**实跑输出**（offscreen 起真控件取证），
   * 右列是本模块结果。差异处即本模块修的缺陷，注释里写明根因。
   */
  it('术语表命中路径：与 旧版 完全一致', () => {
    expect(suggestFieldIds('攻击力').suggestions[0]?.id).toBe('atk') // same
    expect(suggestFieldIds('暴击率').suggestions[0]?.id).toBe('crit_rate') // same
    expect(suggestFieldIds('冷却时间').suggestions[0]?.id).toBe('cooldown') // same
    expect(suggestFieldIds('魔法攻击').suggestions[0]?.id).toBe('magic_atk') // same
    expect(suggestFieldIds('近战单体').suggestions[0]?.id).toBe('melee_single') // same
    expect(suggestFieldIds('生命值%').suggestions[0]?.id).toBe('hp') // same：% 被丢弃
    expect(suggestFieldIds('速度上限').suggestions[0]?.id).toBe('speed_max') // same
  })

  it('缺陷 1：ASCII 不再被逐字打碎', () => {
    // 旧版 实测：'HP上限' → 'h_p_max'、'HP' → 'h_p'、即便本是合法 ID 的 'hp_max' → 'h_p_m_a_x'
    expect(suggestFieldIds('HP上限').suggestions[0]?.id).toBe('hp_max')
    expect(suggestFieldIds('HP').suggestions[0]?.id).toBe('hp')
    expect(suggestFieldIds('hp_max').suggestions[0]?.id).toBe('hp_max')
    expect(suggestFieldIds('Lv').suggestions[0]?.id).toBe('lv')
    expect(suggestFieldIds('ATK').suggestions[0]?.id).toBe('atk')
  })

  it('缺陷 2：未收录中文不再交给词典产出垃圾，而是如实报告', () => {
    // 旧版 实测：'斗能' → 'abbr_surname'
    const douNeng = suggestFieldIds('斗能')
    expect(douNeng.suggestions).toEqual([])
    expect(douNeng.error).toContain('斗能')
    expect(douNeng.error).toContain('未收录')
    expect(douNeng.error).toContain('手动填写')
    // 全项目任何情况下都不应产出含 canada/surname 这类词典垃圾
    for (const label of ['斗能', 'ATK加成', '攻击力加成', '物防', '道行', '悟性']) {
      for (const suggestion of suggestFieldIds(label).suggestions) {
        expect(suggestion.id).not.toMatch(/canada|surname|abbr|protect/)
      }
    }
  })

  it('缺陷 2 续：部分未收录时给出「可用但不完整」的候选并标明缺失片段', () => {
    // 旧版 实测：'攻击力加成' → 'atk_canada_surname'；本模块给 'atk_bonus'（加成已在补充表）
    expect(suggestFieldIds('攻击力加成').suggestions[0]?.id).toBe('atk_bonus')
    // 旧版 实测：'ATK加成' → 'a_t_k_canada_surname'；本模块 'atk_bonus'
    expect(suggestFieldIds('ATK加成').suggestions[0]?.id).toBe('atk_bonus')

    // 真正未收录的词：候选仍给出，但必须**明确列出缺失片段**（不静默丢弃）
    const result = suggestFieldIds('攻击力道行')
    expect(result.suggestions[0]?.id).toBe('atk')
    expect(result.suggestions[0]?.skipped).toEqual(['道行'])
  })

  it('已知缺口（故意不补）：物防/物攻/魔防 无代码库先例 → 如实报未收录', () => {
    // 旧版 实测：'物防' → 'protect'（词典给的通用词义，游戏里应是防御类 ID）
    for (const label of ['物防', '物攻', '魔防']) {
      const result = suggestFieldIds(label)
      expect(result.suggestions, `${label} 不应给出候选`).toEqual([])
      expect(result.error).toContain('未收录')
    }
  })

  it('未收录片段夹在中间时：跳过它，继续识别后面的术语', () => {
    // 玄铁（未收录） + 攻击力（术语表命中）
    const result = suggestFieldIds('玄铁攻击力')
    expect(result.suggestions[0]?.id).toBe('atk')
    expect(result.suggestions[0]?.skipped).toEqual(['玄铁'])
  })
})

describe('fieldId：候选来源标注', () => {
  it('用到术语表 → term；只靠英文数字提取 → literal', () => {
    expect(suggestFieldIds('攻击力').suggestions[0]?.source).toBe('term')
    expect(suggestFieldIds('HP上限').suggestions[0]?.source).toBe('term')
    expect(suggestFieldIds('hp_max').suggestions[0]?.source).toBe('literal')
    expect(suggestFieldIds('Lv').suggestions[0]?.source).toBe('literal')
  })
})

describe('fieldId：重名规避', () => {
  it('不冲突时原样返回', () => {
    expect(uniquifyFieldId('crit_rate', ['hp', 'atk'])).toEqual({ id: 'crit_rate', renamedFrom: null })
  })

  it('冲突时追加 _2，并记录原始 ID', () => {
    expect(uniquifyFieldId('crit_rate', ['crit_rate'])).toEqual({ id: 'crit_rate_2', renamedFrom: 'crit_rate' })
  })

  it('连续冲突时递增到下一个可用后缀', () => {
    expect(uniquifyFieldId('hp', ['hp', 'hp_2', 'hp_3'])).toEqual({ id: 'hp_4', renamedFrom: 'hp' })
  })

  it('比较为精确匹配（大小写敏感），不把 HP 与 hp 视为重名', () => {
    expect(uniquifyFieldId('hp', ['HP'])).toEqual({ id: 'hp', renamedFrom: null })
  })

  it('suggestFieldIds 会带上避开重名后的结果', () => {
    const result = suggestFieldIds('暴击率', ['hp', 'crit_rate'])
    expect(result.suggestions[0]?.id).toBe('crit_rate_2')
    expect(result.suggestions[0]?.renamedFrom).toBe('crit_rate')
  })
})

describe('fieldId：合法性校验', () => {
  it('合法 ID', () => {
    for (const id of ['hp', 'hp_max', '_hidden', 'a1', 'ATK', 'crit_rate_2']) {
      expect(validateFieldId(id), `${id} 应合法`).toEqual({ ok: true, reason: null })
    }
  })

  it('非法 ID 给出中文原因', () => {
    expect(validateFieldId('').ok).toBe(false)
    expect(validateFieldId('   ').reason).toContain('不能为空')
    expect(validateFieldId('攻击力').ok).toBe(false)
    expect(validateFieldId('1hp').reason).toContain('不能以数字开头')
    expect(validateFieldId('hp-max').ok).toBe(false)
    expect(validateFieldId('hp max').ok).toBe(false)
    expect(validateFieldId('hp.max').ok).toBe(false)
  })

  it('不把保留字判为非法（Lua 保留字由导出器 toLuaKey 自动降级为 ["key"]）', () => {
    for (const id of ['end', 'local', 'class', 'level', 'order', 'value', 'type', 'name']) {
      expect(validateFieldId(id).ok, `${id} 不应被判非法`).toBe(true)
    }
  })
})

describe('fieldId：边界', () => {
  it('空显示名给中文原因', () => {
    expect(suggestFieldIds('').error).toContain('显示名为空')
    expect(suggestFieldIds(null).error).toContain('显示名为空')
  })

  it('纯符号/空格：无 token 也无中文 → 明确报错', () => {
    const result = suggestFieldIds('%()')
    expect(result.suggestions).toEqual([])
    expect(result.error).toContain('未包含可转换为标识符的内容')
  })

  it('产出永远是合法 ID 且全小写', () => {
    for (const label of ['HP上限', 'ATK加成', '速度上限', 'Lv', '暴击率', '近战单体', 'A_b C']) {
      for (const suggestion of suggestFieldIds(label).suggestions) {
        expect(validateFieldId(suggestion.id).ok, `${label} → ${suggestion.id} 应合法`).toBe(true)
        expect(suggestion.id).toBe(suggestion.id.toLowerCase())
      }
    }
  })
})
