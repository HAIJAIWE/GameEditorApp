import { describe, expect, it } from 'vitest'

import { genreLabelOf, styleLabelOf } from '../../src/main/ceshu/export/labelMaps'
import { GAME_STYLES } from '@mobai/shared/config/game'
import { HYBRID_GAMEPLAY_PRESETS } from '@mobai/shared/ceshu/reference'

/**
 * 导出层标签映射守卫。
 *
 * 2026-11-09 实测真实导出：Excel 概览 Sheet 印的是 `xianxia` / `rpg` 裸 key，
 * 而同一个文档在界面上显示「仙侠」/「RPG」。这里锁住两件事：
 * ① 导出层的表与 renderer 的真源（GAME_STYLES / CESHU_PRESETS）同口径；
 * ② 认不出来的输入回退原值，不许变成空字符串（空单元格比一个可疑的 key 更难查）。
 */
describe('导出层标签映射', () => {
  it('GAME_STYLES 的每个风格 id 都能译成中文，且与真源 name 一致', () => {
    for (const style of GAME_STYLES) {
      expect(styleLabelOf(style.id)).toBe(style.name)
    }
  })

  it('AI 全量生成写进 doc.style 的别名也要有中文名', () => {
    // 这些 key 不在 GAME_STYLES 里，但真实文档会写进去（见 ceshuAiData 的 STYLE_LABEL_TO_KEY）
    expect(styleLabelOf('sci-fi')).toBe('科幻')
    expect(styleLabelOf('post_apoc')).toBe('末日')
    expect(styleLabelOf('realistic')).toBe('现代 / 写实')
    expect(styleLabelOf('anime')).toBe('二次元')
  })

  it('未收录的风格回退原值，空值给空值符', () => {
    expect(styleLabelOf('some_unknown_style')).toBe('some_unknown_style')
    expect(styleLabelOf('')).toBe('—')
    expect(styleLabelOf(undefined)).toBe('—')
    expect(styleLabelOf(42)).toBe('—')
  })

  it('CESHU_PRESETS 里出现过的每个 moduleType 都能译成中文品类名', () => {
    const moduleTypes = [...new Set(Object.values(HYBRID_GAMEPLAY_PRESETS).map((preset) => preset.moduleType))]
    expect(moduleTypes.length).toBeGreaterThan(8)
    for (const moduleType of moduleTypes) {
      // 不许原样返回 key（那就是没本地化），也不许是空值符
      expect(genreLabelOf(moduleType, '')).not.toBe(moduleType)
      expect(genreLabelOf(moduleType, '')).not.toBe('—')
    }
  })

  it('module_type 为空时用 meta.game_type 的中文原文，两者都空才给空值符', () => {
    expect(genreLabelOf('', '角色扮演')).toBe('角色扮演')
    expect(genreLabelOf('rpg', '角色扮演')).toBe('RPG（角色扮演）')
    expect(genreLabelOf('', '')).toBe('—')
  })

  it('未收录的 module_type 回退大写 key（与 formatModuleBadge 同观感）', () => {
    expect(genreLabelOf('open_world_v2', '')).toBe('OPEN_WORLD_V2')
  })
})
