import { describe, expect, it } from 'vitest'

import {
  ACTIVE_GAME_STYLE_STORAGE_KEY,
  CONCEPT_ALIASES,
  GAME_STYLES,
  buildCrossStyleMap,
  buildReplacementPairs,
  getStyle,
  getTerminology,
  inferStyleFromText,
  listStyleNames,
  loadGameStyle,
  normalizeGameStyleId,
  resolveFieldLabel,
  resolveLabel,
  saveGameStyle
} from '../../src/shared/config/gameStyle'
import type { StorageLike } from '../../src/shared/config/visibleTypes'

/** 内存假 storage，绝不碰真实 localStorage */
class FakeStorage implements StorageLike {
  private readonly map = new Map<string, string>()
  readonly removed: string[] = []

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
    this.removed.push(key)
  }
}

// 以下期望值均由运行 旧版 `src/core/style_manager` 实测得到。

describe('数据完整性', () => {
  it('恰好 6 个风格，顺序为 xianxia→scifi→fantasy→wuxia→modern→pixel', () => {
    expect(GAME_STYLES.map((s) => s.id)).toEqual([
      'xianxia',
      'scifi',
      'fantasy',
      'wuxia',
      'modern',
      'pixel'
    ])
  })

  it('每个风格 terminology 均有 46 个概念（与 JSON 一致）', () => {
    for (const style of GAME_STYLES) {
      expect(Object.keys(style.terminology).length, style.id).toBe(46)
    }
  })

  it('每个风格的 name/description/narrativeStyle/worldviewKeywords 均非空', () => {
    for (const style of GAME_STYLES) {
      expect(style.name.length, style.id).toBeGreaterThan(0)
      expect(style.description.length, style.id).toBeGreaterThan(0)
      expect(style.narrativeStyle.length, style.id).toBeGreaterThan(0)
      expect(style.worldviewKeywords.length, style.id).toBeGreaterThan(0)
    }
  })

  it('xianxia terminology.hp === 气血', () => {
    expect(getTerminology('xianxia').hp).toBe('气血')
  })

  it('GameStyleDef 只含 dataclass 的 6 个字段，不含 color_palette / data_defs_example', () => {
    for (const style of GAME_STYLES) {
      expect(Object.keys(style).sort()).toEqual(
        ['description', 'id', 'name', 'narrativeStyle', 'terminology', 'worldviewKeywords'].sort()
      )
      expect(style).not.toHaveProperty('color_palette')
      expect(style).not.toHaveProperty('colorPalette')
      expect(style).not.toHaveProperty('data_defs_example')
      expect(style).not.toHaveProperty('dataDefsExample')
    }
  })

  it('CONCEPT_ALIASES 恰好 23 个概念，顺序与 旧版 一字不差', () => {
    expect(Object.keys(CONCEPT_ALIASES)).toEqual([
      'hp',
      'mp',
      'attack',
      'defense',
      'speed',
      'level',
      'exp',
      'skill',
      'equip',
      'item',
      'monster',
      'boss',
      'quest',
      'guild',
      'currency_primary',
      'currency_premium',
      'critical',
      'dodge',
      'hit',
      'cooldown',
      'damage',
      'heal',
      'shield'
    ])
    expect(CONCEPT_ALIASES.hp).toEqual(['生命', '生命值', '血量', '体力'])
    expect(CONCEPT_ALIASES.shield).toEqual(['护盾'])
  })

  it('ACTIVE_GAME_STYLE_STORAGE_KEY 为 mb.gameStyle', () => {
    expect(ACTIVE_GAME_STYLE_STORAGE_KEY).toBe('mb.gameStyle')
  })
})

describe('getStyle', () => {
  it('已知 id → 返回对应定义', () => {
    expect(getStyle('scifi')?.name).toBe('科幻')
  })

  it('未知 id / 空 id → undefined', () => {
    expect(getStyle('zzz')).toBeUndefined()
    expect(getStyle('')).toBeUndefined()
  })
})

describe('listStyleNames', () => {
  it('返回 {id: name} 映射', () => {
    expect(listStyleNames()).toEqual({
      xianxia: '仙侠',
      scifi: '科幻',
      fantasy: '奇幻',
      wuxia: '武侠',
      modern: '现代',
      pixel: '像素/复古'
    })
  })

  it('键顺序与 GAME_STYLES 一致', () => {
    expect(Object.keys(listStyleNames())).toEqual(GAME_STYLES.map((s) => s.id))
  })
})

describe('getTerminology', () => {
  it('已知风格 → 术语表（副本）', () => {
    const terms = getTerminology('xianxia')
    expect(terms.hp).toBe('气血')
    expect(terms.mp).toBe('灵力')
  })

  it('未知风格 / 空 id → {}', () => {
    expect(getTerminology('zzz')).toEqual({})
    expect(getTerminology('')).toEqual({})
  })
})

describe('buildCrossStyleMap', () => {
  it('外层 concept 顺序等于首个风格 terminology 的键顺序', () => {
    const cross = buildCrossStyleMap()
    expect(Object.keys(cross)).toEqual(Object.keys(GAME_STYLES[0].terminology))
  })

  it('内层 styleId 顺序等于 GAME_STYLES 顺序', () => {
    const cross = buildCrossStyleMap()
    expect(Object.keys(cross.hp)).toEqual([
      'xianxia',
      'scifi',
      'fantasy',
      'wuxia',
      'modern',
      'pixel'
    ])
  })

  it('cross.hp 内容正确', () => {
    expect(buildCrossStyleMap().hp).toEqual({
      xianxia: '气血',
      scifi: 'HP',
      fantasy: '生命值',
      wuxia: '内力',
      modern: '体力',
      pixel: 'HP'
    })
  })

  it('不含 color_palette 的键（primary/accent/...）', () => {
    const cross = buildCrossStyleMap()
    expect(cross).not.toHaveProperty('primary')
    expect(cross).not.toHaveProperty('accent')
    expect(cross).not.toHaveProperty('bg_dark')
  })
})

describe('buildReplacementPairs', () => {
  it('各风格替换对数量与 旧版 一致', () => {
    expect(buildReplacementPairs('xianxia').length).toBe(184)
    expect(buildReplacementPairs('scifi').length).toBe(161)
    expect(buildReplacementPairs('fantasy').length).toBe(147)
    expect(buildReplacementPairs('wuxia').length).toBe(208)
    expect(buildReplacementPairs('modern').length).toBe(152)
    expect(buildReplacementPairs('pixel').length).toBe(167)
  })

  it('未知 id / 空 id → []', () => {
    expect(buildReplacementPairs('zzz')).toEqual([])
    expect(buildReplacementPairs('')).toEqual([])
  })

  it('不存在 source === target 的自反对', () => {
    for (const style of GAME_STYLES) {
      expect(buildReplacementPairs(style.id).every(([s, t]) => s !== t), style.id).toBe(true)
    }
  })

  it('按 source 长度严格非递增排序', () => {
    for (const style of GAME_STYLES) {
      const pairs = buildReplacementPairs(style.id)
      for (let i = 0; i < pairs.length - 1; i += 1) {
        expect(pairs[i][0].length, `${style.id}#${i}`).toBeGreaterThanOrEqual(
          pairs[i + 1][0].length
        )
      }
    }
  })

  it('不含 color_palette 产生的垃圾替换对', () => {
    const junk = new Set(['primary', 'accent', 'bg_dark', 'bg_light'])
    for (const style of GAME_STYLES) {
      for (const [source] of buildReplacementPairs(style.id)) {
        expect(junk.has(source), `${style.id}:${source}`).toBe(false)
        expect(source.startsWith('#'), `${style.id}:${source}`).toBe(false)
      }
    }
  })

  it('每个 target 都是目标风格 terminology 的某个取值', () => {
    for (const style of GAME_STYLES) {
      const values = new Set(Object.values(style.terminology))
      for (const [, target] of buildReplacementPairs(style.id)) {
        expect(values.has(target), `${style.id}:${target}`).toBe(true)
      }
    }
  })

  it('等长 source 保持插入顺序（稳定排序）', () => {
    // concepts 部分（cross）先于别名部分插入；同为长度 2 的 (内力,生命值) 应早于 (生命,生命值)
    const pairs = buildReplacementPairs('fantasy')
    const idxNeili = pairs.findIndex(([s, t]) => s === '内力' && t === '生命值')
    const idxShengming = pairs.findIndex(([s, t]) => s === '生命' && t === '生命值')
    expect(idxNeili).toBeGreaterThanOrEqual(0)
    expect(idxShengming).toBeGreaterThanOrEqual(0)
    expect(idxNeili).toBeLessThan(idxShengming)
    expect(pairs[idxNeili][0].length).toBe(pairs[idxShengming][0].length)
  })
})

describe('resolveLabel', () => {
  it('仙侠：生命加成% → 气血加成%', () => {
    expect(resolveLabel('生命加成%', 'xianxia')).toBe('气血加成%')
  })

  it('仙侠：法力加成% → 灵力加成%', () => {
    expect(resolveLabel('法力加成%', 'xianxia')).toBe('灵力加成%')
  })

  it('科幻：生命加成% → HP加成%', () => {
    expect(resolveLabel('生命加成%', 'scifi')).toBe('HP加成%')
  })

  it('科幻：法力加成% → 能量加成%', () => {
    expect(resolveLabel('法力加成%', 'scifi')).toBe('能量加成%')
  })

  it('替换是「全部替换」', () => {
    expect(resolveLabel('生命生命', 'xianxia')).toBe('气血气血')
  })

  it('长源优先 + 全部替换：生命值加成生命 → 气血加成气血', () => {
    expect(resolveLabel('生命值加成生命', 'xianxia')).toBe('气血加成气血')
  })

  it('钉死 旧版 的连锁副作用：fantasy 下 内力 → 生命值值', () => {
    // 先 (内力→生命值)，随后等长的 (生命→生命值) 再次命中，与 旧版 完全一致
    expect(resolveLabel('内力', 'fantasy')).toBe('生命值值')
  })

  it('pixel：冷却 → CD', () => {
    expect(resolveLabel('冷却', 'pixel')).toBe('CD')
  })

  it('空标签 → 原样返回', () => {
    expect(resolveLabel('', 'xianxia')).toBe('')
  })

  it('未知风格 → 原样返回', () => {
    expect(resolveLabel('生命加成%', 'zzz')).toBe('生命加成%')
  })

  it('styleId 为空 → 原样返回（TS 无「活跃风格」回退，见文件头偏离说明）', () => {
    expect(resolveLabel('生命加成%', '')).toBe('生命加成%')
  })
})

describe('resolveFieldLabel', () => {
  it('保留尾部冒号：生命加成%: → 气血加成%:', () => {
    expect(resolveFieldLabel('生命加成%:', 'xianxia')).toBe('气血加成%:')
  })

  it('无尾部冒号：生命加成% → 气血加成%', () => {
    expect(resolveFieldLabel('生命加成%', 'xianxia')).toBe('气血加成%')
  })

  it('只摘掉一个尾部冒号并拼回一个', () => {
    expect(resolveFieldLabel('生命加成%::', 'xianxia')).toBe('气血加成%::')
  })

  it('空串 → 原样返回', () => {
    expect(resolveFieldLabel('', 'xianxia')).toBe('')
  })

  it('未知风格 → 原样返回（含冒号）', () => {
    expect(resolveFieldLabel('生命加成%:', 'zzz')).toBe('生命加成%:')
  })

  it('styleId 为空 → 原样返回', () => {
    expect(resolveFieldLabel('生命加成%:', '')).toBe('生命加成%:')
  })
})

describe('inferStyleFromText', () => {
  it("'修仙 飞升' → 'xianxia'", () => {
    expect(inferStyleFromText('修仙 飞升')).toBe('xianxia')
  })

  it("'星际 赛博' → 'scifi'", () => {
    expect(inferStyleFromText('星际 赛博')).toBe('scifi')
  })

  it("单条术语命中（score=1）→ ''", () => {
    expect(inferStyleFromText('气血')).toBe('')
  })

  it("空串 → ''", () => {
    expect(inferStyleFromText('')).toBe('')
  })

  it("无任何命中 → ''", () => {
    expect(inferStyleFromText('随便文本xyz')).toBe('')
  })

  it("恰好 score=2（单个关键词）即达标：'魔法' → 'fantasy'", () => {
    expect(inferStyleFromText('魔法')).toBe('fantasy')
  })

  it("命中即选最高分：'冒险' → 'fantasy'（关键词 +2，且 fantasy 的 pve 术语值恰为「冒险」再 +1 = 3，胜过 modern/pixel 的 2）", () => {
    expect(inferStyleFromText('冒险')).toBe('fantasy')
  })

  it('平分取先出现者：scifi/fantasy/modern/pixel 并列 2 分 → scifi（用 >= 会错取 pixel）', () => {
    // '装备'+'技能' 是 scifi/fantasy/modern/pixel 的 equip/skill 术语值（各 +1），xianxia/wuxia 用别的词
    expect(inferStyleFromText('装备 技能')).toBe('scifi')
  })

  it('多关键词累积：修仙 飞升 灵气 → xianxia', () => {
    expect(inferStyleFromText('修仙 飞升 灵气')).toBe('xianxia')
  })
})

describe('normalizeGameStyleId', () => {
  it('已知 id → 原样返回', () => {
    expect(normalizeGameStyleId('xianxia')).toBe('xianxia')
    expect(normalizeGameStyleId('pixel')).toBe('pixel')
  })

  it("未知字符串 → ''", () => {
    expect(normalizeGameStyleId('zzz')).toBe('')
  })

  it("空字符串 → ''", () => {
    expect(normalizeGameStyleId('')).toBe('')
  })

  it("非字符串 → ''", () => {
    expect(normalizeGameStyleId(null)).toBe('')
    expect(normalizeGameStyleId(undefined)).toBe('')
    expect(normalizeGameStyleId(42)).toBe('')
    expect(normalizeGameStyleId({ id: 'xianxia' })).toBe('')
  })
})

describe('localStorage 助手（注入假 storage）', () => {
  it("键不存在 → ''", () => {
    expect(loadGameStyle(new FakeStorage())).toBe('')
  })

  it('键为已知 id → 返回该 id', () => {
    const storage = new FakeStorage()
    storage.setItem(ACTIVE_GAME_STYLE_STORAGE_KEY, 'scifi')
    expect(loadGameStyle(storage)).toBe('scifi')
  })

  it("键为未知值 → ''", () => {
    const storage = new FakeStorage()
    storage.setItem(ACTIVE_GAME_STYLE_STORAGE_KEY, 'not-a-style')
    expect(loadGameStyle(storage)).toBe('')
  })

  it('写入已知 id → setItem', () => {
    const storage = new FakeStorage()
    saveGameStyle('wuxia', storage)
    expect(storage.getItem(ACTIVE_GAME_STYLE_STORAGE_KEY)).toBe('wuxia')
  })

  it("写入 '' → removeItem 清键", () => {
    const storage = new FakeStorage()
    storage.setItem(ACTIVE_GAME_STYLE_STORAGE_KEY, 'wuxia')
    saveGameStyle('', storage)
    expect(storage.removed).toContain(ACTIVE_GAME_STYLE_STORAGE_KEY)
    expect(storage.getItem(ACTIVE_GAME_STYLE_STORAGE_KEY)).toBeNull()
  })

  it('写入未知 id → removeItem（不落无意义键）', () => {
    const storage = new FakeStorage()
    storage.setItem(ACTIVE_GAME_STYLE_STORAGE_KEY, 'wuxia')
    saveGameStyle('zzz', storage)
    expect(storage.removed).toContain(ACTIVE_GAME_STYLE_STORAGE_KEY)
    expect(storage.getItem(ACTIVE_GAME_STYLE_STORAGE_KEY)).toBeNull()
  })

  it('storage 为 null → 读写均静默 no-op，不抛', () => {
    expect(() => saveGameStyle('xianxia', null as unknown as StorageLike)).not.toThrow()
    expect(loadGameStyle(null as unknown as StorageLike)).toBe('')
  })

  it('未注入 storage（Node 下无 localStorage）→ 不抛且读回空串', () => {
    expect(() => saveGameStyle('xianxia')).not.toThrow()
    expect(loadGameStyle()).toBe('')
  })
})

describe('loadGameStyle / saveGameStyle 别名（既有接线使用）', () => {
  it('saveGameStyle 写、loadGameStyle 读，互为逆操作', () => {
    const storage = new FakeStorage()
    saveGameStyle('wuxia', storage)
    expect(loadGameStyle(storage)).toBe('wuxia')
  })

  it("saveGameStyle('') 清键，loadGameStyle 回 ''", () => {
    const storage = new FakeStorage()
    saveGameStyle('pixel', storage)
    saveGameStyle('', storage)
    expect(loadGameStyle(storage)).toBe('')
  })

  it('无 storage 时读写均不抛', () => {
    expect(() => saveGameStyle('scifi')).not.toThrow()
    expect(loadGameStyle()).toBe('')
  })
})
