import { describe, expect, it } from 'vitest'

import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshuFields'
import { SYSTEM_CONFIG_SCHEMA } from '../../src/shared/systemConfigSchema'

/**
 * 下拉选项中文别名守卫。
 *
 * 起因：`SYSTEM_CONFIG_SCHEMA` 的 combobox 只给英文枚举码，`CeshuFieldControl`
 * 回退 `optionLabels?.[option] ?? option` ⇒ 第五章「游戏系统配置」下拉裸显示 turn_based/arena/
 * behavior_tree 等英文码；meta 的 status/confidentiality 同样中招。
 *
 * 断言口径：**渲染出来的文本**（`optionLabels[value] ?? value`）不得是「全小写 ascii 枚举码」。
 * 专有名词（Unity / FMOD / Elo / RPG / PC）与中文标签均合法。
 */
const ASCII_ENUM_CODE = /^[a-z0-9]+(_[a-z0-9]+)*$/

interface ComboCase {
  where: string
  values: string[]
  optionLabels?: Record<string, string>
}

function collectCombos(): ComboCase[] {
  const cases: ComboCase[] = []
  for (const [chapter, fields] of Object.entries(CESHU_CHAPTER_FIELDS)) {
    for (const field of fields) {
      if (field.kind === 'combo' || field.kind === 'multiCombo') {
        cases.push({ where: `${chapter}.${field.key}`, values: field.values ?? [], optionLabels: field.optionLabels })
      }
    }
  }
  for (const [system, fields] of Object.entries(SYSTEM_CONFIG_SCHEMA)) {
    for (const [key, def] of Object.entries(fields)) {
      if (def.kind === 'combo' || def.kind === 'multiCombo') {
        cases.push({ where: `systems.${system}.config.${key}`, values: def.values ?? [], optionLabels: def.optionLabels })
      }
    }
  }
  return cases
}

const COMBOS = collectCombos()

describe('下拉选项中文别名：不裸漏英文枚举码', () => {
  it('收集到全部 combo/multiCombo 字段（>= 40）', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(40)
    for (const item of COMBOS) expect(item.values.length).toBeGreaterThan(0)
  })

  it('每个 combo 的每个选项渲染文本都不是小写 ascii 枚举码', () => {
    const offenders: string[] = []
    for (const item of COMBOS) {
      for (const value of item.values) {
        const rendered = item.optionLabels?.[value] ?? value
        if (ASCII_ENUM_CODE.test(rendered)) offenders.push(`${item.where}: ${value} → "${rendered}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('配了 optionLabels 的 combo 必须覆盖全部选项（无漏配）', () => {
    const missing: string[] = []
    for (const item of COMBOS) {
      if (!item.optionLabels) continue
      for (const value of item.values) {
        if (item.optionLabels[value] === undefined) missing.push(`${item.where}: ${value}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('系统配置的 combo 一律带 optionLabels（新加 combo 漏配会被这里拦下）', () => {
    const missing: string[] = []
    for (const [system, fields] of Object.entries(SYSTEM_CONFIG_SCHEMA)) {
      for (const [key, def] of Object.entries(fields)) {
        if (def.kind === 'combo' && !def.optionLabels) missing.push(`systems.${system}.config.${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('章节表单的 combo 一律带 optionLabels（game_type / platform 等专有名即中英同一写法）', () => {
    const missing: string[] = []
    for (const [chapter, fields] of Object.entries(CESHU_CHAPTER_FIELDS)) {
      for (const field of fields) {
        if (field.kind === 'combo' && !field.optionLabels) missing.push(`${chapter}.${field.key}`)
      }
    }
    // 仅 game_type 允许无 labels（选项本身就是中文/英文正式写法），其余必须配
    expect(missing.filter((item) => item !== 'meta.game_type')).toEqual([])
  })
})
