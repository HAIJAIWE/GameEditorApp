import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '../../src/shared/ceshu/model'
import {
  TASK_PER_ROLE_LIMIT,
  buildRoleTaskPrompt,
  buildTaskDigest,
  countTaskPlan,
  isEmptyTaskPlan,
  parseRoleTaskPlan,
  taskRolesForDoc
} from '../../src/shared/ceshu/prompts'

/**
 * 岗位任务生成：纯逻辑（摘要 / 提示词 / 解析）。
 *
 * 这层要守住的是**「任务不是阅读清单」**——解析必须丢掉「理解某章」式的空话吗？
 * 不能靠关键词封杀（会误杀「实现存档系统」这类真任务），所以提示词里下硬约束，
 * 解析只做结构校验：岗位、章、优先级、空标题。
 */

function makeDoc(): ReturnType<typeof createDefaultCeshu> {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  doc.meta.game_type = 'SLG'
  doc.gameplay.core_loop = '探索→战斗→养成'
  doc.gameplay.core_loop_points = ['探索', '战斗', '养成']
  return doc
}

describe('buildTaskDigest', () => {
  it('只列已填字段，跳过机读数据', () => {
    const doc = makeDoc()
    // 机读字段：即便填了也不该占摘要预算
    doc.numeric.numeric_assertions = ['击杀耗时|≤3s']

    const digest = buildTaskDigest(doc)
    expect(digest).toContain('核心循环：探索→战斗→养成')
    expect(digest).toContain('（gameplay）')
    expect(digest).not.toContain('击杀耗时')
  })

  it('预算封顶后截断并标注省略', () => {
    const doc = makeDoc()
    // 60 字符装不下一个章块 ⇒ 走截断分支
    const digest = buildTaskDigest(doc, 60)
    expect(digest).toContain('省略')
    expect(digest).not.toContain('核心循环')
  })

  it('全空文档给明确说明，而不是空串', () => {
    const doc = createDefaultCeshu({ scope: 'lite' })
    expect(buildTaskDigest(doc)).toContain('还没有任何已填内容')
  })
})

describe('buildRoleTaskPrompt', () => {
  it('带上硬约束：可执行动作 / 不许发明 / 只用给定章 key', () => {
    const { system, prompt } = buildRoleTaskPrompt(makeDoc())
    expect(system).toContain('可执行动作')
    expect(system).toContain('不许发明')
    expect(system).toContain('P0')
    // 章 key 白名单必须出现在 prompt 里，否则 AI 会编章名
    expect(prompt).toContain('可用章 key：')
    expect(prompt).toContain('gameplay')
    // 骨架 JSON 可解析，且键是岗位
    const json = /```json\n([\s\S]+?)\n```/.exec(prompt)?.[1] ?? ''
    const skeleton = JSON.parse(json) as Record<string, unknown>
    expect(Object.keys(skeleton)).toContain('programmer')
    expect(Object.keys(skeleton)).toContain('artist')
  })

  it('空文档也能组提示词（不抛错）', () => {
    const { prompt } = buildRoleTaskPrompt(createDefaultCeshu({ scope: 'lite' }))
    expect(prompt).toContain('策划书摘要')
  })
})

describe('taskRolesForDoc', () => {
  it('覆盖全部岗位（不按「章有没有内容」裁剪——默认值会污染判断）', () => {
    const roles = taskRolesForDoc(makeDoc())
    expect(roles).toEqual(['programmer', 'artist', 'tester', 'numeric', 'audio'])
  })

  it('空文档同样给全部岗位（按钮永远可用）', () => {
    expect(taskRolesForDoc(createDefaultCeshu({ scope: 'lite' }))).toHaveLength(5)
  })
})

describe('parseRoleTaskPlan', () => {
  it('保留合法条目，丢掉未知岗位/空标题', () => {
    const doc = makeDoc()
    const raw = JSON.stringify({
      programmer: [
        { title: '实现核心循环状态机', detail: '三态切换，验收：可跑通一局', priority: 'P0', source: 'gameplay' },
        { title: '', detail: '空标题要被丢掉', priority: 'P0', source: 'gameplay' }
      ],
      artist: [{ title: '绘制主界面', detail: '', priority: 'P1', source: 'uiux' }],
      marketing: [{ title: '投广告', detail: '编出来的岗位', priority: 'P0', source: 'meta' }]
    })

    const plan = parseRoleTaskPlan(raw, doc)
    expect(plan.programmer).toHaveLength(1)
    expect(plan.programmer?.[0]?.title).toBe('实现核心循环状态机')
    expect(plan.artist).toHaveLength(1)
    expect(plan).not.toHaveProperty('marketing')
    expect(countTaskPlan(plan)).toBe(2)
    expect(isEmptyTaskPlan(plan)).toBe(false)
  })

  it('非法章回落到第一个可见章；非法优先级回落到 P1', () => {
    const doc = makeDoc()
    const raw = JSON.stringify({
      programmer: [{ title: '接入存档', detail: '', priority: 'URGENT', source: '不存在的章' }]
    })
    const task = parseRoleTaskPlan(raw, doc).programmer?.[0]
    expect(task?.priority).toBe('P1')
    expect(task?.source).toBeTypeOf('string')
    // 必须是文档真实可见的章
    expect(doc[task!.source]).toBeDefined()
  })

  it('每岗条数封顶', () => {
    const doc = makeDoc()
    const many = Array.from({ length: 30 }, (_, index) => ({
      title: `任务${index}`,
      detail: '',
      priority: 'P0',
      source: 'gameplay'
    }))
    const plan = parseRoleTaskPlan(JSON.stringify({ programmer: many }), doc)
    expect(plan.programmer).toHaveLength(TASK_PER_ROLE_LIMIT)
  })

  it('非 JSON / 空对象 → 空计划', () => {
    const doc = makeDoc()
    expect(isEmptyTaskPlan(parseRoleTaskPlan('抱歉我无法完成', doc))).toBe(true)
    expect(isEmptyTaskPlan(parseRoleTaskPlan('{}', doc))).toBe(true)
    expect(isEmptyTaskPlan(parseRoleTaskPlan('[1,2,3]', doc))).toBe(true)
  })
})
