import { describe, expect, it } from 'vitest'

import {
  BUNDLE_CONSUME_TASK_LABELS,
  BUNDLE_CONSUME_USAGE,
  buildBundleConsumePrompt
} from '../../src/shared/ceshuBundlePrompt'
import { buildCeshuBundle } from '../../src/shared/ceshuBundle'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

function makeBundle() {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  doc.combat.damage_formula = '伤害 = 攻击 - 防御'
  return buildCeshuBundle(doc, { exportedAt: '2026-10-22T12:00:00.000Z' })
}

describe('buildBundleConsumePrompt：机读轨消费提示词', () => {
  it('draft 任务：契约字典 + 空缺清单 + 增量输出格式 + 写作规范', () => {
    const prompt = buildBundleConsumePrompt(makeBundle(), 'draft')

    // schema 锚点：外部 AI 据此识别结构版本
    expect(prompt).toContain('mobai-ceshu-bundle/1')
    // 契约语义说明
    expect(prompt).toContain('aiDraftable=false')
    expect(prompt).toContain('该字段由人确定，你不要生成或修改它')
    expect(prompt).toContain('status=ai_draft')
    // 空缺清单：必填且可 AI 起草的进场；人定字段（游戏名称）不进场
    expect(prompt).toContain('文档信息（meta）· 一句话定位（positioning）')
    expect(prompt).not.toContain('游戏名称（game_name）')
    // 输出格式：只输出 JSON、增量、禁代码块
    expect(prompt).toContain('只输出 JSON')
    expect(prompt).toContain('不要 markdown 代码块')
    expect(prompt).toContain('{"章节key": {"字段key": 值}}')
    // 写作规范复用（与站内 AI 同一套标准）
    expect(prompt).toContain('写作规范')
    expect(prompt).toContain('单句尽量不超过 40 字')
  })

  it('review 任务：审阅重点 + 待审草稿清单 + issues 输出格式', () => {
    const bundle = makeBundle()
    bundle.chapters = bundle.chapters.map((chapter) => ({
      ...chapter,
      fields: chapter.fields.map((field) =>
        field.key === 'damage_formula' ? { ...field, status: 'ai_draft' } : field
      )
    }))
    const prompt = buildBundleConsumePrompt(bundle, 'review')

    expect(prompt).toContain('审阅')
    expect(prompt).toContain('逻辑矛盾')
    expect(prompt).toContain('内容重复')
    expect(prompt).toContain('不可执行')
    // 待审草稿清单点名具体字段（章 label 带「第N章·」前缀，与界面一致）
    expect(prompt).toContain('第五章·战斗系统设计 · 伤害公式（damage_formula）')
    // 输出格式是 issues 结构，不是增量 patch
    expect(prompt).toContain('"issues"')
    expect(prompt).toContain('severity')
    expect(prompt).toContain('没有问题就输出 {"issues": []}')
    // 内置校验结果进提示词
    expect(prompt).toContain('内置校验已发现的问题')
  })

  it('draft 与 review 是两套不同提示词（任务词表齐全）', () => {
    const bundle = makeBundle()
    const draft = buildBundleConsumePrompt(bundle, 'draft')
    const review = buildBundleConsumePrompt(bundle, 'review')
    expect(draft).not.toBe(review)
    expect(draft).toContain('补全')
    expect(review).toContain('审阅')
    expect(BUNDLE_CONSUME_TASK_LABELS.draft).not.toBe('')
    expect(BUNDLE_CONSUME_TASK_LABELS.review).not.toBe('')
    expect(BUNDLE_CONSUME_USAGE).toContain('<名称>.json')
  })

  it('人定字段永不出现在空缺清单里（即使为空）', () => {
    const bundle = makeBundle()
    bundle.doc.gameName = '' // 游戏名是「人定」字段
    const prompt = buildBundleConsumePrompt(bundle, 'draft')
    expect(prompt).not.toContain('game_name')
  })
})
