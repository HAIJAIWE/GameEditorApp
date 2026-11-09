import { describe, expect, it } from 'vitest'

import {
  TECH_DOC_ENGINEER_PERSONA,
  buildTechDocSectionPrompt,
  replaceTechDocSection
} from '@mobai/shared/agent/techDoc/techDocPrompt'
import { TECH_DOC_SECTIONS } from '@mobai/shared/agent/techDoc/techDocSchema'

/**
 * TDD 分节生成的提示词（2026-11-10）。
 *
 * 这批用例守的是**两件实测踩过的事故**，不是文案正确性：
 *   1. 提示词缺长度下限 ⇒ 每节只出三四行空话（本仓「AI 生成内容过少」的已知根因之一）；
 *   2. 提示词缺输出契约 ⇒ 模型自带 `## 节标题` / 整段 JSON / 开场白，渲染层把正文塞进文档后出现重复标题。
 * 因此断言的是「契约句在不在、素材有没有进 prompt、替换是否纯」，而不是逐字比对全文。
 */
describe('TECH_DOC_ENGINEER_PERSONA', () => {
  it('是中文技术设计角色，且守住「只答怎么实现 / 不编造」两条底线', () => {
    expect(TECH_DOC_ENGINEER_PERSONA.length).toBeGreaterThan(0)
    expect(TECH_DOC_ENGINEER_PERSONA).toContain('技术设计工程师')
    expect(TECH_DOC_ENGINEER_PERSONA).toContain('怎么实现')
    // 不确定的实现细节必须标「待确认」，而不是编造——这是本节最常见的事实性错误
    expect(TECH_DOC_ENGINEER_PERSONA).toContain('待确认')
    expect(TECH_DOC_ENGINEER_PERSONA).not.toContain('undefined')
    // 角色设定要覆盖「可施工」的具体产物，否则模型退回写设计感想
    for (const token of ['数据结构', '接口', '错误码', '边界条件', '性能预算']) {
      expect(TECH_DOC_ENGINEER_PERSONA).toContain(token)
    }
  })
})

describe('buildTechDocSectionPrompt：9 节全覆盖', () => {
  it('每个标准章节都能构造出 system + prompt，且含该节标题与写作指引', () => {
    for (const section of TECH_DOC_SECTIONS) {
      const built = buildTechDocSectionPrompt({
        gameName: '星河战记',
        sectionId: section.id,
        materials: []
      })
      expect(built.system, section.id).toBe(TECH_DOC_ENGINEER_PERSONA)
      expect(built.prompt, section.id).toContain('星河战记')
      expect(built.prompt, section.id).toContain(section.title)
      expect(built.prompt, section.id).toContain(section.guidance)
    }
  })

  it('未知 sectionId 用 id 兜底而不抛错（界面误传不该整节生成失败）', () => {
    const built = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'custom-section',
      materials: []
    })
    expect(built.prompt).toContain('custom-section')
    expect(built.prompt).toContain('待确认')
  })

  it('空 sectionId 抛错（静默兜底会生成一节不知道写什么的正文）', () => {
    expect(() =>
      buildTechDocSectionPrompt({ gameName: '星河战记', sectionId: '   ', materials: [] })
    ).toThrow()
  })
})

describe('buildTechDocSectionPrompt：长度下限与输出契约', () => {
  it('显式给出「每节不少于 600 字 / 每个小节不少于 120 字」', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'architecture',
      materials: []
    })
    expect(prompt).toMatch(/不少于\s*600\s*字/)
    expect(prompt).toMatch(/不少于\s*120\s*字/)
    // 说明「不要凑字数」——只有数字会诱导水字数
    expect(prompt).toContain('不要写空话凑字数')
  })

  it('输出契约：只出正文、用 ### 分块、禁 JSON / 禁重写节标题 / 禁围栏包全文', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'interfaces',
      materials: []
    })
    expect(prompt).toContain('## 输出契约（必须遵守）')
    expect(prompt).toContain('只输出本节 markdown 正文')
    expect(prompt).toContain('### ')
    expect(prompt).toContain('不要输出整段 JSON')
    expect(prompt).toContain('不要重写节标题')
    expect(prompt).toContain('围栏')
  })
})

describe('buildTechDocSectionPrompt：GDD 素材渲染', () => {
  it('非空素材逐条渲染成 - **label**（来自 chapter）：value', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'architecture',
      materials: [
        { label: '引擎', chapter: '2. 技术规格', value: 'Unreal Engine 5' },
        { label: '核心循环', chapter: '3. 核心玩法', value: '探索 → 采集 → 建造' }
      ]
    })
    expect(prompt).toContain('- **引擎**（来自 2. 技术规格）：Unreal Engine 5')
    expect(prompt).toContain('- **核心循环**（来自 3. 核心玩法）：探索 → 采集 → 建造')
    expect(prompt).not.toContain('本节暂无 GDD 素材')
  })

  it('多行素材值压成一行（否则 markdown 列表项会被折断成正文段）', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'data-model',
      materials: [{ label: '存档字段', chapter: '2. 技术规格', value: 'playerId: string\nlevel: number' }]
    })
    expect(prompt).toContain('playerId: string level: number')
    expect(prompt).not.toContain('playerId: string\nlevel: number')
  })

  it('空素材给出「暂无 GDD 素材」兜底提示，并允许按工程常识给最小设计', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '空项目',
      sectionId: 'modules',
      materials: []
    })
    expect(prompt).toContain('本节暂无 GDD 素材')
    expect(prompt).toContain('最小可行设计')
    expect(prompt).toContain('待确认')
  })

  it('全是空值的素材等同无素材（不渲染空条目）', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '空项目',
      sectionId: 'modules',
      materials: [
        { label: '引擎', chapter: '2. 技术规格', value: '   ' },
        { label: '目标设备', chapter: '2. 技术规格', value: '' }
      ]
    })
    expect(prompt).toContain('本节暂无 GDD 素材')
    expect(prompt).not.toContain('- **引擎**')
  })
})

describe('buildTechDocSectionPrompt：已写完的其它节', () => {
  it('列出其它节标题与体量，并排除本节自身', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'flows',
      materials: [],
      written: [
        { title: '架构总览', body: '## 架构总览\n分层说明……'.repeat(3) },
        { title: '关键流程与时序', body: '（当前正在生成的节，不应出现在已写完清单里）' }
      ]
    })
    expect(prompt).toContain('## 已写完的其它节')
    expect(prompt).toContain('架构总览')
    expect(prompt).not.toContain('（当前正在生成的节，不应出现在已写完清单里）')
  })

  it('没有已写完的节时给一句明确的空状态，而不是留一个空标题', () => {
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'overview',
      materials: [],
      written: []
    })
    expect(prompt).toContain('## 已写完的其它节')
    expect(prompt).toContain('其它节尚未写入')
  })
})

describe('buildTechDocSectionPrompt：额外要求', () => {
  it('extra 非空时作为最后一节追加在末尾', () => {
    const extra = '必须用 Unity 2022 LTS；存档走 JSON 明文，不做加密。'
    const { prompt } = buildTechDocSectionPrompt({
      gameName: '星河战记',
      sectionId: 'dependencies',
      materials: [],
      extra
    })
    expect(prompt).toContain('## 额外要求')
    expect(prompt.trimEnd().endsWith(extra)).toBe(true)
  })

  it('extra 为空或纯空白时完全不出现额外要求段', () => {
    for (const extra of [undefined, '', '   \n  ']) {
      const { prompt } = buildTechDocSectionPrompt({
        gameName: '星河战记',
        sectionId: 'dependencies',
        materials: [],
        extra
      })
      expect(prompt).not.toContain('## 额外要求')
    }
  })
})

describe('replaceTechDocSection', () => {
  const markdown = [
    '# 技术设计文档',
    '',
    '## 概述与目标',
    '',
    '> 一段话说明这个系统做什么……',
    '',
    '旧的概述正文，要被替换掉。',
    '',
    '## 架构总览',
    '',
    '架构这一节保持不动。',
    '',
    '## 数据模型',
    '',
    '数据模型这一节也保持不动。'
  ].join('\n')

  it('命中标题：替换正文（含旧指引引用行），其它节原样保留', () => {
    const next = replaceTechDocSection(markdown, '概述与目标', '### 目标\n\n新的概述正文，讲清做什么与不做什么。')
    expect(next).toBeDefined()
    expect(next).not.toContain('旧的概述正文')
    // 旧指引是 `> ` 引用行，属于本节正文，必须一并替换，否则文档里拖着过期指引
    expect(next).not.toContain('> 一段话说明这个系统做什么……')
    expect(next).toContain('### 目标')
    expect(next).toContain('新的概述正文')
    expect(next).toContain('## 概述与目标')
    expect(next).toContain('架构这一节保持不动。')
    expect(next).toContain('数据模型这一节也保持不动。')
  })

  it('替换中间节时不会吃掉下一节标题（### 三级标题不是节边界）', () => {
    const next = replaceTechDocSection(markdown, '架构总览', '### 分层\n\n客户端 / 主进程 / 存储三层。\n\n### 数据流\n\n响应式推送。')
    expect(next).toContain('## 数据模型')
    expect(next).toContain('数据模型这一节也保持不动。')
    expect(next).not.toContain('架构这一节保持不动')
    expect(next).toContain('### 分层')
    expect(next).toContain('### 数据流')
  })

  it('未命中标题：追加到文末并补 ## 标题', () => {
    const next = replaceTechDocSection(markdown, '风险与权衡', '### 已知风险\n\n网络抖动。')
    expect(next.startsWith(markdown.trimEnd())).toBe(true)
    expect(next).toContain('## 风险与权衡')
    expect(next).toContain('### 已知风险')
    // 追加不应凭空改动已有内容
    expect(next).toContain('旧的概述正文，要被替换掉。')
  })

  it('空文档追加时不留多余空行', () => {
    expect(replaceTechDocSection('', '概述与目标', '正文')).toBe('## 概述与目标\n\n正文')
  })

  it('纯函数：不修改入参（原字符串仍含旧正文）', () => {
    const original = markdown
    const next = replaceTechDocSection(original, '概述与目标', '### 目标\n\n新正文')
    expect(original).toContain('旧的概述正文')
    expect(original).toBe(markdown)
    expect(original).not.toBe(next)
  })

  it('空 sectionTitle 抛错（否则会匹配到任意 ## 行，静默写坏文档）', () => {
    expect(() => replaceTechDocSection(markdown, '  ', '正文')).toThrow()
  })

  it('保留 CRLF 换行（Windows 落盘文档混入 LF 会让整片 diff 变色）', () => {
    const crlfDoc = '# 文档\r\n\r\n## 概述与目标\r\n\r\n旧正文\r\n\r\n## 架构总览\r\n\r\n不动。'
    const next = replaceTechDocSection(crlfDoc, '概述与目标', '### 目标\n\n新正文')
    expect(next).toContain('新正文')
    expect(next).toContain('## 架构总览')
    // 去掉 CRLF 后不得再剩 `\n`：说明没有任何一处被写成裸 LF
    expect(next.replace(/\r\n/g, '')).not.toContain('\n')
    expect(next).toContain('\r\n')
  })
})
