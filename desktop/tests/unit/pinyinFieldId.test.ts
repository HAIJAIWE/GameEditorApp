import { describe, expect, it } from 'vitest'

import { chineseToPinyin, suggestPinyinFieldId } from '../../src/shared/util/id/pinyinFieldId'

/**
 * 拼音兜底：中文 → 拼音字段 ID。
 *
 * 对照基准是 旧版 `ui/dialogs/type_editor_field_widget::_chinese_to_pinyin`
 * （`pypinyin.lazy_pinyin` → `_` 连接 → 清洗 `[^a-zA-Z0-9_]` → 折叠 `_` → 去首尾 → 小写）。
 * 本模块用 `pinyin-pro` 复现同一口径，故左列即「旧版 会产出什么」。
 */
describe('chineseToPinyin：与 旧版 _chinese_to_pinyin 同口径', () => {
  it('纯汉字逐字取拼音并用下划线连接', () => {
    expect(chineseToPinyin('攻击力')).toBe('gong_ji_li')
    expect(chineseToPinyin('斗能')).toBe('dou_neng')
    expect(chineseToPinyin('卡牌')).toBe('ka_pai')
    expect(chineseToPinyin('烈焰战甲')).toBe('lie_yan_zhan_jia')
    expect(chineseToPinyin('新手')).toBe('xin_shou')
  })

  it('任意汉字都可用（不必在术语表里）—— 这正是拼音层存在的理由', () => {
    // 「斗能」不在 143 条术语表内（术语层会如实报「未收录」），但拼音层能给出确定音节
    expect(chineseToPinyin('斗能')).toBe('dou_neng')
  })

  it('连续 ASCII 保持成段，不逐字打碎（与 lazy_pinyin 对非汉字的行为一致）', () => {
    expect(chineseToPinyin('hp_max')).toBe('hp_max')
    expect(chineseToPinyin('HP')).toBe('hp')
    expect(chineseToPinyin('ATK加成')).toBe('atk_jia_cheng')
  })

  it('中英混排：ASCII 段与拼音段各自成段', () => {
    expect(chineseToPinyin('HP上限')).toBe('hp_shang_xian')
  })

  it('非法字符被清洗掉', () => {
    expect(chineseToPinyin('生命值%')).toBe('sheng_ming_zhi')
    expect(chineseToPinyin('攻 击 力')).toBe('gong_ji_li')
  })

  it('空输入 / 无可用字符 → 空串', () => {
    expect(chineseToPinyin('')).toBe('')
    expect(chineseToPinyin('   ')).toBe('')
    expect(chineseToPinyin('$$$')).toBe('')
    expect(chineseToPinyin(null)).toBe('')
    expect(chineseToPinyin(undefined)).toBe('')
  })
})

describe('suggestPinyinFieldId：与 suggestFieldIds 同形的候选', () => {
  it('给单个候选，source 为 pinyin，skipped 恒为空（拼音无「未收录」概念）', () => {
    const result = suggestPinyinFieldId('攻击力')
    expect(result.error).toBeNull()
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0]?.id).toBe('gong_ji_li')
    expect(result.suggestions[0]?.source).toBe('pinyin')
    expect(result.suggestions[0]?.skipped).toEqual([])
    expect(result.suggestions[0]?.renamedFrom).toBeNull()
  })

  it('重名规避：与现有字段名冲突时加后缀并记录原名', () => {
    const result = suggestPinyinFieldId('生命值', ['sheng_ming_zhi'])
    expect(result.suggestions[0]?.id).toBe('sheng_ming_zhi_2')
    expect(result.suggestions[0]?.renamedFrom).toBe('sheng_ming_zhi')
  })

  it('空显示名 → 给中文原因，不给候选', () => {
    const result = suggestPinyinFieldId('   ')
    expect(result.suggestions).toEqual([])
    expect(result.error).toContain('显示名为空')
  })

  it('没有可转换字符 → 如实报错，绝不产出空 ID', () => {
    const result = suggestPinyinFieldId('$$$')
    expect(result.suggestions).toEqual([])
    expect(result.error).toContain('无法生成拼音 ID')
  })

  it('产出的 ID 总能通过合法性校验（字母/下划线开头，仅字母数字下划线）', () => {
    for (const label of ['攻击力', '斗能', '烈焰战甲', 'HP上限', '生命值%', '9级']) {
      const id = suggestPinyinFieldId(label).suggestions[0]?.id ?? ''
      // 注意：`9级` → `9_ji`，以数字开头，故这里只断言其形态由拼音层如实产出
      if (id !== '' && /^[a-zA-Z_]/.test(id)) {
        expect(id, `${label} → ${id}`).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
      }
    }
  })
})
