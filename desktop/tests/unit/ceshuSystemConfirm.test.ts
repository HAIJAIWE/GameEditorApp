import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'
import { formatFieldsPreview, buildSystemConfirmResult, systemDisplayName } from '../../src/shared/ceshu/prompts/ceshuSystemConfirm'
import { SYSTEM_CONFIG_SCHEMA } from '../../src/shared/ceshu/model/systemConfigSchema'
import type { SystemEntry } from '../../src/shared/ceshu/reference/ceshuConstants'

describe('ceshuSystemConfirm 字段预览', () => {
  it('battle 系统：预览含前 8 个字段；超过 8 个追加「... 共 N 个字段」', () => {
    const battleFields = SYSTEM_CONFIG_SCHEMA.battle
    const total = Object.keys(battleFields).length
    expect(total).toBeGreaterThan(8)

    const preview = formatFieldsPreview('battle', {})
    // 仅展示前 8 个
    const lines = preview.split('\n')
    expect(lines).toHaveLength(9) // 8 字段 + 1 行「... 共 N 个字段」
    expect(lines[8]).toBe(`... 共 ${total} 个字段`)
    expect(preview).toContain('• turn_mode（战斗模式, combo）')
  })

  it('battle 系统：config 中的当前值拼接到字段行（= 值）', () => {
    const preview = formatFieldsPreview('battle', { team_size: 4 })
    expect(preview).toContain('• team_size（队伍人数, number） = 4')
  })

  it('字段 label 末尾冒号被剥离', () => {
    const preview = formatFieldsPreview('battle', {})
    expect(preview).toContain('（战斗模式,') // 无尾随冒号
    expect(preview).not.toContain('（战斗模式:,')
  })

  it('未定义系统返回空串（自定义系统无标准架构）', () => {
    expect(formatFieldsPreview('my_custom_sys', {})).toBe('')
  })

  it('字段少于等于 8 个时不追加「共 N 个字段」', () => {
    // gacha 系统字段数 <= 8？
    const gachaTotal = Object.keys(SYSTEM_CONFIG_SCHEMA.gacha).length
    const preview = formatFieldsPreview('gacha', {})
    if (gachaTotal <= 8) {
      expect(preview).not.toContain('... 共')
    } else {
      expect(preview).toContain('... 共')
    }
  })
})

describe('ceshuSystemConfirm 确认结果', () => {
  it('默认文档：勾选 character+battle → 仅这两个启用，其余保持关闭且 name/config 保留', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const result = buildSystemConfirmResult(doc.systems as Record<string, SystemEntry>, ['character', 'battle'])

    const systems = result.systems
    expect(systems.character.enabled).toBe(true)
    expect(systems.battle.enabled).toBe(true)
    expect(systems.skill.enabled).toBe(false)
    // 原 name 保留
    expect(systems.character.name).toBe('角色')
    // 原 config 保留（默认空字符串字段）
    expect(systems.character.config).toBeTypeOf('object')
    // 不改动原文档
    expect((doc.systems as Record<string, SystemEntry>).character.enabled).toBe(false)
  })

  it('新增自定义系统：不在原 systems 中 → 新增 enabled=true + name + config.note', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const customKey = 'tower_defense'
    expect(doc.systems).not.toHaveProperty(customKey)

    const result = buildSystemConfirmResult(doc.systems as Record<string, SystemEntry>, [customKey], [
      { key: customKey, name: '塔防' }
    ])
    expect(result.systems[customKey].enabled).toBe(true)
    expect(result.systems[customKey].name).toBe('塔防')
    expect(result.systems[customKey].config).toEqual({ note: '自定义系统' })
    expect(result.enabledKeys).toContain(customKey)
  })

  it('已存在的系统再次作为自定义传入：仅置 enabled=true 并覆盖 name，不重复新增', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const result = buildSystemConfirmResult(doc.systems as Record<string, SystemEntry>, ['character'], [
      { key: 'character', name: '主角系统' }
    ])
    // character 已是原有系统，不应新增独立 key
    expect(Object.keys(result.systems)).toHaveLength(Object.keys(doc.systems).length)
    expect(result.systems.character.enabled).toBe(true)
    expect(result.systems.character.name).toBe('主角系统')
  })

  it('enabledKeys 返回实际启用的全部系统键（含自定义）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const result = buildSystemConfirmResult(doc.systems as Record<string, SystemEntry>, ['battle'], [
      { key: 'my_sys', name: '我的系统' }
    ])
    expect(result.enabledKeys.sort()).toEqual(['battle', 'my_sys'])
  })

  it('systemDisplayName：name 优先 → SYSTEM_LABELS → key', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const systems = doc.systems as Record<string, SystemEntry>
    expect(systemDisplayName('character', systems.character)).toBe('角色')
    expect(systemDisplayName('character', { enabled: true, name: '', config: {} })).toBe('角色')
    expect(systemDisplayName('unknown_sys', { enabled: true, name: '自定义名', config: {} })).toBe('自定义名')
  })
})
