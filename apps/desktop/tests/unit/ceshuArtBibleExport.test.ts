import { describe, expect, it } from 'vitest'

import { createDefaultCeshu, isSoftwareDoc } from '@mobai/shared/ceshu/model'
import { CESHU_EXPORT_FORMATS, CESHU_FORMAT_EXTENSIONS, CESHU_FORMAT_LABELS } from '@mobai/shared/ceshu/reference'
import { renderCeshuArtBible } from '../../src/main/ceshu/export/content/artBible'

/**
 * Art Bible 独立交付物（2026-11-08）。
 * 依据 `docs/game-doc-corpus-2026.md`：行业里 Art Bible 是独立文档（色彩体系/UI 组件库/
 * 角色规范/资产命名管线），本项目 art 章本就含这些字段，缺的是单独发给美术/外包的出口。
 */
describe('Art Bible 导出格式登记', () => {
  it('格式列表 / 标签 / 扩展名三者齐备', () => {
    expect(CESHU_EXPORT_FORMATS).toContain('artbible')
    expect(CESHU_FORMAT_LABELS.artbible).toContain('Art Bible')
    expect(CESHU_FORMAT_EXTENSIONS.artbible).toBe('.md')
  })
})

describe('renderCeshuArtBible', () => {
  it('游戏档：把 art 章字段组织成独立文档，含已填值与来源回链', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    doc.art.art_style = '低多边形太空考古，冷色调 + 高饱和强调色'
    doc.art.color_system = '主色 #1B2A4A / 辅助 #4A6FA5 / 强调 #FFB703'
    const md = renderCeshuArtBible(doc)
    expect(md).toContain('Art Bible')
    expect(md).toContain('星河战记')
    expect(md).toContain('## 美术风格')
    expect(md).toContain('低多边形太空考古')
    expect(md).toContain('主色 #1B2A4A')
    expect(md).toContain('## 来源章节')
    expect(md).toContain('gdd.md#ch9') // art 是第 8 章，锚点比章号大 1
  })

  it('资产规格（含命名规则）以表格输出，列名齐全', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.art.asset_spec = ['角色立绘|1024x1024|PNG|chr_hero_001|需九宫']
    const md = renderCeshuArtBible(doc)
    expect(md).toContain('| 类型 | 尺寸 | 格式 | 命名 | 备注 |')
    expect(md).toContain('chr_hero_001')
  })

  it('未填字段列进「待定项」，方便美术对照', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.art.art_style = '像素风'
    const md = renderCeshuArtBible(doc)
    expect(md).toContain('## 待定项')
    expect(md).toContain('（待定）')
  })

  it('应用档：无美术章时给出明确提示，不产出错位的空骨架', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '应用', docKind: 'application' })
    expect(isSoftwareDoc(doc)).toBe(true)
    const md = renderCeshuArtBible(doc)
    expect(md).toContain('应用档')
    expect(md).not.toContain('## 美术风格')
  })
})
