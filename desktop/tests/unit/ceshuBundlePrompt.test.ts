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

  it('reviewPending 任务：只列 ai_draft 字段并带人审要点，不评价已批准字段', () => {
    const bundle = makeBundle()
    bundle.chapters = bundle.chapters.map((chapter) => ({
      ...chapter,
      fields: chapter.fields.map((field) => {
        if (field.key === 'positioning') return { ...field, status: 'ai_draft' }
        if (field.key === 'skill_system') return { ...field, status: 'ai_draft' }
        if (field.key === 'combat_mode') return { ...field, status: 'approved' }
        return field
      })
    }))
    const prompt = buildBundleConsumePrompt(bundle, 'reviewPending')

    // 任务语义：范围锁在待审字段，且任务词表同步
    expect(BUNDLE_CONSUME_TASK_LABELS.reviewPending).toBe('只审待审字段')
    expect(prompt).toContain('只审待审字段')
    // 两个待审字段都点名（章节 label · 字段 label（key））
    expect(prompt).toContain('文档信息 · 一句话定位（positioning）')
    expect(prompt).toContain('第五章·战斗系统设计 · 技能系统（skill_system）')
    // 有 reviewHint 的字段把「人审要点」带进提示词，无 reviewHint 的字段不硬凑
    expect(prompt).toContain('是否一句话能讲清，且不与竞品同质')
    expect(prompt).not.toContain('人审要点：undefined')
    // 输出格式与 review 一致（issues 结构）
    expect(prompt).toContain('"issues"')
    expect(prompt).toContain('severity')
    expect(prompt).toContain('写作规范')
    // 已批准字段不进清单（标签不得出现在提示词里）
    expect(prompt).not.toContain('战斗模式')
  })

  it('reviewPending 任务：没有待审字段时明确收口为 {"issues": []}', () => {
    const prompt = buildBundleConsumePrompt(makeBundle(), 'reviewPending')

    expect(prompt).toContain('当前没有待审字段')
    expect(prompt).toContain('{"issues": []}')
    // 没有待审字段时不应再点名任何字段
    expect(prompt).not.toContain('伤害公式（damage_formula）')
  })
})
