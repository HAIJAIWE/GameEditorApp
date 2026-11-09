import { describe, expect, it } from 'vitest'

import { renderCeshuMarkdown, renderCeshuDeliverableMarkdown } from '../../src/main/ceshu/export/doc/markdown'
import { renderCeshuHomepage } from '../../src/main/ceshu/export/content/homepage'
import { renderCeshuNarrative } from '../../src/main/ceshu/export/content/narrative'
import { expandPersonaEntries } from '../../src/main/ceshu/export/extraFieldRules'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 导出：schema 外扩展键 + 用户画像形态 的本地化守卫。
 *
 * 现场（2026-11-09，真实文档 dd66f593 导出的 19 页 docx）：文档信息章末尾印出
 * `enabled_modules:` 后跟 17 行英文章 key、`template_version: 2026.11`、
 * `ai_generated:` 后跟 7 行 ISO 时间戳、`business_model:` 整段重复文本；
 * 产品愿景章印出 `user_personas:` 裸名。读者拿到的成品里有一整页是内部字段名。
 *
 * 本测试守住「这些键要么本地化成人话、要么按机读/重复口径落位，绝不再印裸 key」。
 */

const APPENDIX = '## 附录：验收与机读数据'

function makeDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', name: '扩展键样本' })
  doc.meta.enabled_modules = ['combat', 'economy', 'numeric'] as never
  doc.meta.template_version = '2026.11' as never
  doc.meta.ai_generated = { meta: '2026-11-08T16:49:01.725Z', combat: '2026-11-08T16:49:01.725Z' } as never
  doc.meta.business_model = '抽卡保底 50 抽，ARPU 30-50 元。' as never
  return doc
}

describe('导出扩展键：本地化与落位', () => {
  it('enabled_modules 翻成中文章名一行，不再印英文章 key', () => {
    const markdown = renderCeshuMarkdown(makeDoc())
    expect(markdown).toContain('**已启用模块**:')
    expect(markdown).toContain('战斗系统设计')
    expect(markdown).not.toContain('**enabled_modules**')
  })

  it('template_version 用中文标签（版本号本身保持原样）', () => {
    const markdown = renderCeshuMarkdown(makeDoc())
    expect(markdown).toContain('**模板版本**: 2026.11')
    expect(markdown).not.toContain('**template_version**')
  })

  it('ai_generated 进「附录：验收与机读数据」，且时间是人类可读格式', () => {
    const markdown = renderCeshuMarkdown(makeDoc())
    const appendixAt = markdown.indexOf(APPENDIX)
    const at = markdown.indexOf('**AI 生成时间**')
    expect(at).toBeGreaterThan(appendixAt)
    // ISO 串按本地时区渲染成 'YYYY-MM-DD HH:mm:ss'（UTC 16:49:01 ⇒ 东八区 次日 00:49:01）
    expect(markdown).toMatch(/2026-11-0[89] \d\d:49:01/)
    expect(markdown).not.toContain('**ai_generated**')
    // ISO 原串不该在成品里露脸
    expect(markdown).not.toContain('T16:49:01.725Z')
  })

  it('meta.business_model 在 vision 有值时不重复输出（两份已经互相矛盾）', () => {
    const doc = makeDoc()
    doc.vision.business_model = '保底 90 抽，ARPU 40-60 元。'
    const markdown = renderCeshuMarkdown(doc)
    expect(markdown).toContain('保底 90 抽')
    expect(markdown).not.toContain('保底 50 抽')
    expect(markdown).not.toContain('**business_model**')
  })

  it('vision 没有商业模式时，meta 那份仍然输出（不丢信息）', () => {
    const doc = makeDoc()
    doc.vision.business_model = ''
    const markdown = renderCeshuMarkdown(doc)
    expect(markdown).toContain('**商业模式**: 抽卡保底 50 抽')
  })
})

describe('vision.user_personas：数组形态展开成三个中文标签', () => {
  it('字符串数组（AI 实测形态）按槽位还原，标签是 schema 里的中文', () => {
    const doc = makeDoc()
    doc.vision.user_personas = [
      '主画像：18-25 岁男性学生，追求无压力御剑探索',
      '次画像：26-35 岁上班族，碎片时间刷日常',
      '潜在画像：35 岁回归玩家，重情怀'
    ] as never
    const markdown = renderCeshuMarkdown(doc)
    expect(markdown).toContain('**主要用户**: 18-25 岁男性学生')
    expect(markdown).toContain('**次要用户**: 26-35 岁上班族')
    expect(markdown).toContain('**潜在用户**: 35 岁回归玩家')
    // 裸 key 与「主画像：」前缀都不该出现
    expect(markdown).not.toContain('**user_personas**')
    expect(markdown).not.toContain('主画像：')
  })

  it('认不出前缀时按出现顺序填空槽（不丢信息）', () => {
    const expanded = expandPersonaEntries('vision', 'user_personas', ['甲', '乙'])
    expect(expanded).toEqual([
      ['user_personas.primary', '甲'],
      ['user_personas.secondary', '乙']
    ])
  })

  it('嵌套对象形态（模板 / 手填）同样展开', () => {
    const markdown = renderCeshuMarkdown(
      Object.assign(makeDoc(), {
        vision: { user_personas: { primary: '核心玩家', secondary: '休闲玩家' } }
      })
    )
    expect(markdown).toContain('**主要用户**: 核心玩家')
    expect(markdown).toContain('**次要用户**: 休闲玩家')
    expect(markdown).not.toContain('**user_personas**')
  })

  it('画像插在 schema 原位（design_vision 之后、差异化优势之前），不是章尾', () => {
    const doc = makeDoc()
    doc.vision = {
      design_vision: '做成御剑探索的仙侠开放世界',
      user_personas: ['主画像：学生'],
      differentiation: '差异化：御剑飞行无 loading'
    } as never
    const markdown = renderCeshuMarkdown(doc)
    const visionAt = markdown.indexOf('**设计愿景**')
    const personaAt = markdown.indexOf('**主要用户**')
    const diffAt = markdown.indexOf('**差异化优势**')
    expect(visionAt).toBeGreaterThan(-1)
    expect(personaAt).toBeGreaterThan(visionAt)
    expect(diffAt).toBeGreaterThan(personaAt)
  })

  it('首页 / 叙事版都能取到画像（点路径与数组两种形态都取得到）', () => {
    const doc = makeDoc()
    doc.meta.positioning = '一句话定位'
    doc.vision = {
      design_vision: '设计愿景',
      user_personas: ['主画像：18-25 岁学生', '次画像：26-35 岁上班族']
    } as never
    const home = renderCeshuHomepage(doc)
    expect(home).toContain('主要用户')
    expect(home).toContain('18-25 岁学生')
    const narrative = renderCeshuNarrative(doc)
    expect(narrative).toContain('主要用户')
    expect(narrative).toContain('次要用户')
    expect(narrative).not.toContain('**user_personas**')
  })

  it('交付版（deliverable）同样不印裸 key', () => {
    const markdown = renderCeshuDeliverableMarkdown(makeDoc())
    expect(markdown).not.toContain('**enabled_modules**')
    expect(markdown).not.toContain('**template_version**')
    expect(markdown).not.toContain('**ai_generated**')
  })
})
