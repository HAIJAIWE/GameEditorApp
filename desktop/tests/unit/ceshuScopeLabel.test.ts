import { describe, expect, it } from 'vitest'

import {
  CHAPTER_KEYS,
  GDD_SCOPE_FULL,
  GDD_SCOPE_LITE,
  LITE_CHAPTER_KEYS,
  contentChapterCount
} from '../../src/shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshu/fields'
import { GDD_SCOPE_LABELS } from '../../src/shared/ceshu/reference'

/**
 * 档位文案里的「N 章」必须**由 `CHAPTER_KEYS` 派生**，不许写死。
 *
 * 真实事故（2026-10-26）：为「像设计文档」追加 7 个 P2 章后，full 从 16 章变成 23 章，
 * 但档位标签、全量生成面板、章节导航提示、智能体工具描述里仍写着「专业版 16 章」——
 * 用户左边看到 24 个章节导航、右边标签说 16 章。这类文案腐烂没有任何编译期信号，
 * 只能靠守卫钉住。改章节数时若这里红了，说明**该改的是文案的派生方式，不是这个断言**。
 */
describe('档位文案：章数由 CHAPTER_KEYS 派生（防文案腐烂）', () => {
  it('contentChapterCount：full = 全部编号章（24 章 −「文档信息」= 23），lite = 9', () => {
    expect(contentChapterCount(GDD_SCOPE_FULL)).toBe(CHAPTER_KEYS.length - 1)
    expect(contentChapterCount(GDD_SCOPE_FULL)).toBe(23)
    expect(contentChapterCount(GDD_SCOPE_LITE)).toBe(LITE_CHAPTER_KEYS.length)
    expect(contentChapterCount(GDD_SCOPE_LITE)).toBe(9)
  })

  it('档位标签里的「+ N 章」与实际章数一致', () => {
    expect(GDD_SCOPE_LABELS.full).toContain(`+ ${contentChapterCount(GDD_SCOPE_FULL)} 章`)
    expect(GDD_SCOPE_LABELS.lite).toContain(`+ ${contentChapterCount(GDD_SCOPE_LITE)} 章`)
    expect(GDD_SCOPE_LABELS.full).not.toContain('16 章')
  })

  it('meta.gdd_scope 的下拉别名与 GDD_SCOPE_LABELS 同源（不各写一份）', () => {
    const field = CESHU_CHAPTER_FIELDS.meta.find((item) => item.key === 'gdd_scope')
    expect(field?.optionLabels).toEqual(GDD_SCOPE_LABELS)
  })
})
