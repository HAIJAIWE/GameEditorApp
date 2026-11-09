import { describe, expect, it } from 'vitest'

import {
  parseTechDocSections,
  techDocSectionMaterials
} from '@mobai/shared/agent/techDoc/techDocDraft'
import { sanitizeSectionBody, replaceTechDocSection } from '@mobai/shared/agent/techDoc/techDocPrompt'
import { TECH_DOC_SECTIONS } from '@mobai/shared/agent/techDoc/techDocSchema'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { generateTechDocSectionTask } from '../../src/main/techDoc/generateSection'

/**
 * TDD 分节生成（2026-11-10）。
 *
 * 这批用例守的是**接入 AI 之后最容易静默坏掉的三处**：
 *   1. 编排把哪一节、哪份提示词交给模型（错了会写进别的小节）；
 *   2. 模型回自报标题 / 整篇围栏 / 开场白时正文要不要清洗（不清洗文档会出现重复标题）；
 *   3. 大纲里的「## 2. 架构总览」能不能被 replaceTechDocSection 认出（认不出就每节追加一份）。
 * 断言的是行为契约，不是提示词文案（文案归 techDocPrompt.test.ts）。
 */

interface GenerateCall {
  system: string
  prompt: string
}

function createPorts(reply: string | Error, cloud = false) {
  const calls: GenerateCall[] = []
  const client = {
    generate: async (system: string, prompt: string) => {
      calls.push({ system, prompt })
      if (reply instanceof Error) throw reply
      return {
        model: 'stub-model',
        content: reply,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
      }
    }
  }
  const ports = {
    llm: { llmCallOptions: async () => ({}), isCloudCall: () => cloud },
    client
  }
  return { ports, calls }
}

/** 16 条 600 字素材 ⇒ 提示词约 1 万字符、预估 5k token，超过 chapter 档 4000 预算 */
function hugeMaterials() {
  return Array.from({ length: 16 }, (_, index) => ({
    label: '素材' + index,
    chapter: '数值设计',
    value: 'x'.repeat(600)
  }))
}

describe('generateTechDocSectionTask', () => {
  it('把本节角色提示词与素材交给模型，返回清洗后的正文与标准标题', async () => {
    const { ports, calls } = createPorts(
      ['## 2. 架构总览', '', '### 分层', '', '客户端 / 主进程 / 存储三层。'].join('\n')
    )
    const result = await generateTechDocSectionTask(ports as never, {
      gameName: '星河战记',
      sectionId: 'architecture',
      materials: [{ label: '技术选型', chapter: '技术方案', value: 'Unity 2022 LTS' }]
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.system).toContain('技术设计工程师')
    expect(calls[0]?.prompt).toContain('架构总览')
    expect(calls[0]?.prompt).toContain('Unity 2022 LTS')
    // 自报的「## 2. 架构总览」必须被剥掉：外层换节标题时不能再多出一行同名标题
    expect(result.body.startsWith('## ')).toBe(false)
    expect(result.body).toContain('### 分层')
    expect(result.title).toBe('架构总览')
    expect(result.sectionId).toBe('architecture')
    expect(result.model).toBe('stub-model')
    expect(result.usage?.totalTokens).toBe(30)
  })

  it('未知 sectionId 用 id 兜底标题（界面误传不该整节生成失败）', async () => {
    const { ports } = createPorts('正文')
    const result = await generateTechDocSectionTask(ports as never, {
      gameName: '星河战记',
      sectionId: 'custom-section',
      materials: []
    })
    expect(result.title).toBe('custom-section')
  })

  it('云端超预算且未确认：抛确认原因且不调用模型（DD-17）', async () => {
    const { ports, calls } = createPorts('正文', true)
    await expect(
      generateTechDocSectionTask(ports as never, {
        gameName: '星河战记',
        sectionId: 'data-model',
        materials: hugeMaterials()
      })
    ).rejects.toThrow('token')
    expect(calls).toHaveLength(0)
  })

  it('带 confirmed 重发时越过确认门并正常生成', async () => {
    const { ports, calls } = createPorts('### 表结构\n\n敌人表：id / hp / atk。', true)
    const result = await generateTechDocSectionTask(ports as never, {
      gameName: '星河战记',
      sectionId: 'data-model',
      materials: hugeMaterials(),
      confirmed: true
    })
    expect(calls).toHaveLength(1)
    expect(result.body).toContain('敌人表')
  })
})

describe('sanitizeSectionBody', () => {
  it('剥掉包住整篇正文的围栏', () => {
    const tick = String.fromCharCode(96)
    const fence = tick + tick + tick
    const fenced = [fence, '### 分层', '', '三层。', fence].join('\n')
    expect(sanitizeSectionBody(fenced, '架构总览')).toBe('### 分层\n\n三层。')
  })

  it('单个代码片段本身的围栏保留（那不是包住整篇正文的围栏）', () => {
    const tick = String.fromCharCode(96)
    const fence = tick + tick + tick
    const body = [fence + 'json', '{"hp": 100}', fence].join('\n')
    const cleaned = sanitizeSectionBody(body, '数据模型')
    expect(cleaned.startsWith(fence + 'json')).toBe(true)
    expect(cleaned).toContain('{"hp": 100}')
  })

  it('剥掉自报的节标题（允许序号前缀），并保留真实正文', () => {
    const body = ['## 架构总览', '', '### 分层', '', '三层。'].join('\n')
    expect(sanitizeSectionBody(body, '架构总览')).toBe('### 分层\n\n三层。')
    const numbered = ['## 2. 架构总览', '', '### 分层', '', '三层。'].join('\n')
    expect(sanitizeSectionBody(numbered, '架构总览')).toBe('### 分层\n\n三层。')
  })

  it('只在第一行是客套时剥开场白，正文里的「以下是」不动', () => {
    const body = ['好的，以下是架构总览：', '', '### 分层', '', '三层。'].join('\n')
    expect(sanitizeSectionBody(body, '架构总览')).toBe('### 分层\n\n三层。')
    const keep = ['### 分层', '', '以下是三层说明。'].join('\n')
    expect(sanitizeSectionBody(keep, '架构总览')).toBe(keep)
  })

  it('空正文返回空串，不抛错', () => {
    expect(sanitizeSectionBody('', '架构总览')).toBe('')
    expect(sanitizeSectionBody('   \n  ', '架构总览')).toBe('')
  })
})

describe('replaceTechDocSection：认序号前缀', () => {
  const outlineDoc = [
    '# 技术设计文档',
    '',
    '## 1. 概述与目标',
    '',
    '旧概述。',
    '',
    '## 2. 架构总览',
    '',
    '旧架构。'
  ].join('\n')

  it('大纲标题带序号时替换原节，而不是追加到文末', () => {
    const next = replaceTechDocSection(outlineDoc, '架构总览', '### 分层\n\n三层。')
    expect(next).toContain('### 分层')
    expect(next).not.toContain('旧架构。')
    // 关键回归：不得出现第二份同名节
    expect(next.split('## 2. 架构总览')).toHaveLength(2)
    expect(next).toContain('旧概述。')
  })
})

describe('parseTechDocSections', () => {
  it('按二级标题切节，三级标题不切', () => {
    const markdown = [
      '# 文档',
      '',
      '## 概述与目标',
      '',
      '### 目标',
      '',
      '正文一。',
      '',
      '## 架构总览',
      '',
      '正文二。'
    ].join('\n')
    const sections = parseTechDocSections(markdown)
    expect(sections.map((item) => item.title)).toEqual(['概述与目标', '架构总览'])
    expect(sections[0]?.body).toContain('### 目标')
    expect(sections[0]?.body).toContain('正文一。')
    expect(sections[1]?.body).toBe('正文二。')
  })

  it('无二级标题时返回空数组', () => {
    expect(parseTechDocSections('# 只有一级标题\n\n正文')).toEqual([])
  })
})

describe('techDocSectionMaterials', () => {
  it('取本节映射章的已填字段，带上中文章名与字段名，空字段不进素材', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    doc.vision.design_vision = '星际考古的核心幻想'
    const materials = techDocSectionMaterials(doc, 'overview')
    const hit = materials.find((item) => item.value === '星际考古的核心幻想')
    expect(hit).toBeDefined()
    expect(hit?.chapter).toContain('产品愿景')
    expect(materials.every((item) => item.value.trim() !== '')).toBe(true)
  })

  it('单条素材截断到 600 字，最多 16 条', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    doc.vision.design_vision = 'x'.repeat(700)
    const materials = techDocSectionMaterials(doc, 'overview')
    expect(materials.length).toBeLessThanOrEqual(16)
    const long = materials.find((item) => item.value.startsWith('xxx'))
    expect(long?.value.length).toBe(601)
    expect(long?.value.endsWith('…')).toBe(true)
  })

  it('未知 sectionId 返回空素材（提示词层会走「本节暂无 GDD 素材」兜底）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    doc.vision.design_vision = '有素材'
    expect(techDocSectionMaterials(doc, 'custom-section')).toEqual([])
  })

  it('9 个标准节都能取到素材或明确为空，不抛错', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    for (const section of TECH_DOC_SECTIONS) {
      expect(() => techDocSectionMaterials(doc, section.id)).not.toThrow()
    }
  })
})
