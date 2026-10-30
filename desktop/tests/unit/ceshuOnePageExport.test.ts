import { describe, expect, it } from 'vitest'

import { renderCeshuDeliverableMarkdown } from '../../src/main/ceshu/export/markdown'
import { renderCeshuOnePageMarkdown } from '../../src/main/ceshu/export/onepage'
import { renderCeshuTasksMarkdown } from '../../src/main/ceshu/export/tasks'
import { CESHU_EXPORT_FORMATS, CESHU_FORMAT_EXTENSIONS } from '../../src/shared/ceshu/reference/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'

/**
 * 一页式导出（2026 对齐）：与 UI「一页总览」同口径——必填全列（空→待填）、非必填只列已填、
 * 机读数据只给计数、按档位×品类×模块裁剪。
 */
describe('一页式导出 renderCeshuOnePageMarkdown', () => {
  it('格式枚举含 onepage / deliverable，扩展名 .md', () => {
    expect(CESHU_EXPORT_FORMATS).toContain('onepage')
    expect(CESHU_EXPORT_FORMATS).toContain('deliverable')
    expect(CESHU_EXPORT_FORMATS).toContain('tasks')
    expect(CESHU_FORMAT_EXTENSIONS.onepage).toBe('.md')
    expect(CESHU_FORMAT_EXTENSIONS.deliverable).toBe('.md')
    expect(CESHU_FORMAT_EXTENSIONS.tasks).toBe('.md')
  })

  it('含游戏名 / 立项阶段 / 必填进度；空必填显示（待填）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const md = renderCeshuOnePageMarkdown(doc)
    expect(md).toContain('《测试游戏》· 一页摘要')
    expect(md).toContain('立项阶段')
    expect(md).toContain('必填已填')
    expect(md).toContain('（待填）')
  })

  it('已填值进正文；机读数据不进正文，只给计数', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.meta.positioning = '一句话定位'
    const md = renderCeshuOnePageMarkdown(doc)
    expect(md).toContain('一句话定位')
    // economy 章尾应有机读数据计数（ledger 属机读层）
    expect(md).toContain('另有')
    expect(md).toContain('机读数据')
  })

  it('关掉的系统模块不出现在一页摘要里', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.meta.enabled_modules = ['combat']
    const md = renderCeshuOnePageMarkdown(doc)
    expect(md).toContain('核心玩法') // 通用底座
    expect(md).not.toContain('经济系统设计') // economy 被关掉
    expect(md).not.toContain('数值设计') // numeric 被关掉
  })
})

describe('交付版 renderCeshuDeliverableMarkdown', () => {
  it('封面 + 一页摘要 + 目录 + 详细章节；不含内部附录', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.meta.positioning = '一句话定位'
    const md = renderCeshuDeliverableMarkdown(doc)
    expect(md).toContain('# 测试游戏') // 封面
    expect(md).toContain('## 一页摘要')
    expect(md).toContain('## 目录')
    expect(md).toContain('一句话定位')
    // 内部过程附录不应出现在交付版
    expect(md).not.toContain('附录：审核进度')
    expect(md).not.toContain('附录：数据校验报告')
  })

  it('交付版尊重系统模块（关掉的模块不出现）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.meta.enabled_modules = ['combat']
    const md = renderCeshuDeliverableMarkdown(doc)
    expect(md).toContain('核心玩法')
    expect(md).not.toContain('经济系统设计')
  })
})

describe('岗位任务清单 renderCeshuTasksMarkdown', () => {
  const roleSection = (md: string, label: string): string =>
    md.split(/\n## /).find((part) => part.startsWith(`${label}任务`)) ?? ''

  it('按岗位分节；章节归属正确（程序/数值各拿各的）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const md = renderCeshuTasksMarkdown(doc)
    expect(md).toContain('# 《测试游戏》· 岗位任务清单')
    for (const label of ['程序', '美术', '测试', '数值', '音频']) {
      expect(md).toContain(`## ${label}任务`)
    }
    expect(roleSection(md, '程序')).toContain('核心玩法') // gameplay 属程序
    expect(roleSection(md, '程序')).not.toContain('经济系统设计') // economy 不属程序
    expect(roleSection(md, '数值')).toContain('经济系统设计') // economy 属数值
  })

  it('已填字段带上设计要求，空的标（待补）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.gameplay.core_loop = '算→派→等→判→谈'
    const md = renderCeshuTasksMarkdown(doc)
    expect(md).toContain('算→派→等→判→谈')
    expect(md).toContain('（待补）')
  })
})
