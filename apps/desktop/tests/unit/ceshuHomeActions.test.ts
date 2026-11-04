import { describe, expect, it } from 'vitest'

import {
  CESHU_HOME_ACTIONS,
  MAX_DESCRIBED_HOME_ACTIONS,
  homeGuideActions,
  showHomeActionDescriptions
} from '@mobai/shared/ceshu/homeActions'
import { CATALOGS } from '@mobai/shared/i18n'

/**
 * 首页「开始」引导屏动作注册表（对齐 dsh GuideBody 的 guide entries 层）。
 * 这些是静态契约：新增/删除一个门、改 testid、漏翻译键都会在这里红。
 */
describe('ceshu home action registry', () => {
  it('注册表非空，id 与 testId 均唯一', () => {
    expect(CESHU_HOME_ACTIONS.length).toBeGreaterThan(0)
    const ids = CESHU_HOME_ACTIONS.map((action) => action.id)
    const testIds = CESHU_HOME_ACTIONS.map((action) => action.testId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(testIds).size).toBe(testIds.length)
    expect(testIds).toContain('home-new-blank')
    expect(testIds).toContain('home-new-copy')
    expect(testIds).toContain('home-clone-open')
    expect(testIds).toContain('home-open-folder')
    expect(testIds).toContain('home-browse-library')
  })

  it('门与滚动锚点分离：4 个门 + 1 个锚点，锚点不参与描述阈值', () => {
    const guides = homeGuideActions()
    const anchors = CESHU_HOME_ACTIONS.filter((action) => action.kind === 'anchor')
    expect(guides).toHaveLength(4)
    expect(anchors).toHaveLength(1)
    expect(anchors[0].id).toBe('library')
    expect(showHomeActionDescriptions(guides.length)).toBe(true)
  })

  it('描述阈值对齐 dsh MAX_DESCRIBED_ENTRIES', () => {
    expect(MAX_DESCRIBED_HOME_ACTIONS).toBe(4)
    expect(showHomeActionDescriptions(0)).toBe(true)
    expect(showHomeActionDescriptions(4)).toBe(true)
    expect(showHomeActionDescriptions(5)).toBe(false)
    // 传入自定义注册表时仍按门数计算，不写死内置数组
    expect(showHomeActionDescriptions(homeGuideActions([]).length)).toBe(true)
    expect(showHomeActionDescriptions(3, 2)).toBe(false)
  })

  it('每个门都有描述键，锚点没有；锚点始终可点', () => {
    for (const action of homeGuideActions()) {
      expect(action.descriptionKey, `${action.id} 缺描述键`).toBeDefined()
      expect(action.busySensitive, `${action.id} 应随 busy 禁用`).toBe(true)
    }
    for (const action of CESHU_HOME_ACTIONS.filter((item) => item.kind === 'anchor')) {
      expect(action.descriptionKey).toBeUndefined()
      expect(action.busySensitive).toBe(false)
    }
  })

  it('所有文案键在 zh / en 两份目录里都存在', () => {
    const keys: string[] = []
    for (const action of CESHU_HOME_ACTIONS) {
      keys.push(action.labelKey)
      if (action.descriptionKey !== undefined) keys.push(action.descriptionKey)
      if (action.titleKey !== undefined) keys.push(action.titleKey)
    }
    for (const key of keys) {
      expect(CATALOGS.zh[key as keyof typeof CATALOGS.zh], `zh 缺键 ${key}`).toBeTypeOf('string')
      expect(CATALOGS.en[key as keyof typeof CATALOGS.en], `en 缺键 ${key}`).toBeTypeOf('string')
    }
  })
})
