import { describe, expect, it } from 'vitest'

import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  CHAPTER_NAMES,
  CHAPTER_PARTS,
  CHAPTER_REQUIRED_FIELDS,
  LITE_CHAPTER_KEYS,
  META_CHAPTER_KEY,
  NUMBERED_CHAPTER_KEYS,
  chapterNumber,
  chapterPartOf,
  partDisplayName,
  visibleChapterKeys,
  type ChapterKey
} from '../../src/shared/ceshu/reference/ceshuConstants'

/**
 * 策划书结构守卫（单一事实源 = `CHAPTER_PARTS`）。
 *
 * 为什么需要这份守卫：章节顺序、章号、显示名、档位裁剪分散在多个消费方（侧边栏 / 导出 /
 * 主题校验 / AI 生成计划），历史上就出过「重排后 lite 章号跳号 1,2,3,4,5,6,11,13,14」
 * 这类只在界面上肉眼可见、typecheck 与业务测试都抓不到的缺陷。这里把「结构不变式」
 * 直接锁死，任何重排/合并/增删章节只要破坏不变式就立刻红灯。
 */

/** 中文数字表（与 ceshuConstants 内部同源；用于核对标签里的章号） */
// P2 扩展设计 7 章后共 23 个编号章（meta 不占章号），中文数字同步扩展到二十三
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十', '二十一', '二十二', '二十三']

describe('策划书常量：顶层结构不变式', () => {
  it('CHAPTER_KEYS = 文档信息段（恒在首位、只出现一次）+ 有章号章节', () => {
    expect(CHAPTER_KEYS[0]).toBe(META_CHAPTER_KEY)
    expect(CHAPTER_KEYS.filter((key) => key === META_CHAPTER_KEY)).toHaveLength(1)
    expect(CHAPTER_KEYS).toEqual([META_CHAPTER_KEY, ...NUMBERED_CHAPTER_KEYS])
  })

  it('NUMBERED_CHAPTER_KEYS = CHAPTER_PARTS 顺序展开（章节顺序的唯一事实源）', () => {
    expect(NUMBERED_CHAPTER_KEYS).toEqual(CHAPTER_PARTS.flatMap((part) => [...part.chapters]))
  })

  it('每个分区非空且 key/label 唯一；分区 chapters 恰好划分 NUMBERED_CHAPTER_KEYS（无重叠、无遗漏）', () => {
    const partKeys = CHAPTER_PARTS.map((part) => part.key)
    expect(new Set(partKeys).size).toBe(partKeys.length)
    const labels = CHAPTER_PARTS.map((part) => part.label)
    expect(new Set(labels).size).toBe(labels.length)

    for (const part of CHAPTER_PARTS) {
      expect(part.chapters.length).toBeGreaterThan(0)
      // 分区内不得重复章节
      expect(new Set(part.chapters).size).toBe(part.chapters.length)
    }
    const flattened = CHAPTER_PARTS.flatMap((part) => [...part.chapters])
    expect(flattened).toHaveLength(NUMBERED_CHAPTER_KEYS.length)
    expect(new Set(flattened).size).toBe(flattened.length)
    expect([...flattened].sort()).toEqual([...NUMBERED_CHAPTER_KEYS].sort())
  })

  it('CHAPTER_NAMES 与 CHAPTER_REQUIRED_FIELDS 覆盖全部章节（含文档信息段）', () => {
    expect(Object.keys(CHAPTER_NAMES).sort()).toEqual([...CHAPTER_KEYS].sort())
    expect(Object.keys(CHAPTER_REQUIRED_FIELDS).sort()).toEqual([...CHAPTER_KEYS].sort())
    // 文档信息段：封面信息，不占章号但有必填项（游戏名/类型/定位/标签）
    expect(CHAPTER_REQUIRED_FIELDS.meta).toEqual(['game_name', 'game_type', 'positioning', 'tags'])
  })

  it('story = 原世界观 + 角色的必填项并集（结构重构后不再有独立 worldview/characters 章）', () => {
    expect(CHAPTER_KEYS).not.toContain('worldview' as ChapterKey)
    expect(CHAPTER_KEYS).not.toContain('characters' as ChapterKey)
    expect(CHAPTER_REQUIRED_FIELDS.story).toEqual(['architecture', 'main_plot', 'protagonist', 'main_npc_count'])
  })
})

describe('策划书常量：章号与标签由数组位置派生', () => {
  it('chapterNumber 在有章号章节上恒为 1..N 连续；文档信息段为 0', () => {
    expect(chapterNumber(META_CHAPTER_KEY)).toBe(0)
    const numbers = NUMBERED_CHAPTER_KEYS.map((key) => chapterNumber(key))
    expect(numbers).toEqual(numbers.map((_, index) => index + 1))
  })

  it('CHAPTER_LABELS：文档信息段无「第N章·」前缀，其余与章号严格对齐', () => {
    expect(CHAPTER_LABELS.meta).toBe(CHAPTER_NAMES.meta)
    expect(CHAPTER_LABELS.meta.startsWith('第')).toBe(false)

    for (const key of NUMBERED_CHAPTER_KEYS) {
      const n = chapterNumber(key)
      expect(CHAPTER_LABELS[key]).toBe(`第${CN[n - 1]}章·${CHAPTER_NAMES[key]}`)
    }
  })

  it('chapterPartOf / partDisplayName：分区归属与中文序号一致', () => {
    expect(chapterPartOf(META_CHAPTER_KEY)).toBeNull()

    CHAPTER_PARTS.forEach((part, index) => {
      expect(partDisplayName(part)).toBe(`${CN[index]}、${part.label}`)
      for (const key of part.chapters) {
        expect(chapterPartOf(key)).toBe(part)
      }
    })
  })
})

describe('策划书常量：档位裁剪（lite 必须是有章号章节的前缀）', () => {
  it('LITE_CHAPTER_KEYS 是 NUMBERED_CHAPTER_KEYS 的前缀 ⇒ lite 章号恒为 1..9 不跳号', () => {
    expect(LITE_CHAPTER_KEYS.length).toBeGreaterThan(0)
    expect(LITE_CHAPTER_KEYS).toEqual(NUMBERED_CHAPTER_KEYS.slice(0, LITE_CHAPTER_KEYS.length))
    // 直接断言章号连续，这是当初「目录像缺页」缺陷的回归点
    expect(LITE_CHAPTER_KEYS.map((key) => chapterNumber(key))).toEqual(
      LITE_CHAPTER_KEYS.map((_, index) => index + 1)
    )
  })

  it('visibleChapterKeys：full = 全部章节；lite = 文档信息段 + 核心设计 9 章', () => {
    expect(visibleChapterKeys('full')).toEqual(CHAPTER_KEYS)
    expect(LITE_CHAPTER_KEYS).toHaveLength(9)
    expect(visibleChapterKeys('lite')).toEqual([
      'meta',
      'vision',
      'story',
      'gameplay',
      'systems',
      'combat',
      'economy',
      'numeric',
      'art',
      'audio'
    ])
    // 专业版补充章节不在标准版（技术/资源/制作与商业区整块排除）
    for (const key of ['tech', 'resources', 'mvp', 'market_analysis', 'monetization', 'accessibility'] as ChapterKey[]) {
      expect(visibleChapterKeys('lite')).not.toContain(key)
    }
    // lite 是 full 的子集（不存在「lite 可见但 full 不可见」的章节）
    const fullSet = new Set<ChapterKey>(visibleChapterKeys('full'))
    for (const key of visibleChapterKeys('lite')) expect(fullSet.has(key)).toBe(true)
  })
})
