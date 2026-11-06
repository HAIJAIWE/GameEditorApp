import { describe, expect, it } from 'vitest'

import {
  CESHU_ROLE_LABELS,
  CESHU_ROLE_ORDER,
  collectRoleTasks,
  renderTaskPlanMarkdown,
  roleChaptersForDoc,
  taskRoleLabelForDoc,
  taskRolesForDoc
} from '@mobai/shared/ceshu/workflow'
import { buildRoleTaskPrompt, parseRoleTaskPlan } from '@mobai/shared/ceshu/prompts'
import { buildProjectFolder } from '@mobai/shared/ceshu/workflow'
import { createDefaultCeshu, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { APP_AI_LAYER_KEYS, APP_CHAPTER_LABELS, APP_ROLES } from '@mobai/shared/appSchema'
import { renderCeshuTasksMarkdown } from '../../src/main/ceshu/export/delivery/tasks'
import { renderCeshuMarkdown } from '../../src/main/ceshu/export/doc/markdown'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 路线 A 第 5 步守卫：岗位任务与导出模板按 docKind 分派。
 * 游戏档的 5 岗字面量与导出文本由既有 400+ 单测锁定，这里再反向断言一遍。
 */
function appDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '效率工具' })
  doc.meta.project_name = '效率工具'
  doc.meta.platform = ['desktop', 'web']
  return doc
}

function gameDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '星海计划' })
}

describe('应用档：岗位规格化层', () => {
  it('岗位列表 / 标签 / 章映射走 APP_ROLES', () => {
    const doc = appDoc()
    expect([...taskRolesForDoc(doc)]).toEqual(APP_ROLES.map((item) => item.key))
    expect(taskRoleLabelForDoc(doc, 'backend')).toBe('后端')
    expect(taskRoleLabelForDoc(doc, 'product')).toBe('产品')
    expect(roleChaptersForDoc(doc, 'backend')).toContain('architecture')
    expect(roleChaptersForDoc(doc, 'frontend')).toContain('interaction')
    // 应用岗位不应映射到任何游戏章
    for (const role of taskRolesForDoc(doc)) {
      for (const chapter of roleChaptersForDoc(doc, role)) {
        // AI 模型层章仅在 ai_enabled 时可见，不属于「游戏章」
        if (APP_AI_LAYER_KEYS.includes(chapter)) continue
        expect(visibleChaptersForDoc(doc)).toContain(chapter)
      }
    }
  })

  it('collectRoleTasks 按应用章取字段，不出现游戏章', () => {
    const sections = collectRoleTasks(appDoc(), 'backend')
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      expect(visibleChaptersForDoc(appDoc())).toContain(section.chapter)
      expect(section.label).toBe(APP_CHAPTER_LABELS[section.chapter])
    }
  })

  it('游戏档逐项零回归', () => {
    const doc = gameDoc()
    expect([...taskRolesForDoc(doc)]).toEqual([...CESHU_ROLE_ORDER])
    expect(taskRoleLabelForDoc(doc, 'programmer')).toBe(CESHU_ROLE_LABELS.programmer)
    expect(roleChaptersForDoc(doc, 'numeric')).toContain('economy')
  })
})

describe('应用档：AI 岗位任务提示词与解析', () => {
  it('提示词是 SDD 角色与措辞，骨架用应用岗位 key', () => {
    const doc = appDoc()
    const { system, prompt } = buildRoleTaskPrompt(doc)
    expect(system).toContain('资深技术负责人')
    expect(system).toContain('软件设计文档')
    expect(system).not.toContain('游戏制作人')
    expect(prompt).toContain('项目：效率工具')
    expect(prompt).toContain('软件设计文档摘要')
    expect(prompt).not.toContain('品类：')
    for (const role of APP_ROLES) expect(prompt).toContain(role.key)
    expect(prompt).not.toContain('programmer（程序）')
  })

  it('解析只保留应用岗位，丢弃游戏岗位与未知岗位', () => {
    const doc = appDoc()
    const plan = parseRoleTaskPlan(
      JSON.stringify({
        product: [{ title: '梳理验收条件', detail: '每条可判定', priority: 'P0', source: 'scope' }],
        programmer: [{ title: '实现伤害公式', detail: '', priority: 'P1', source: 'combat' }],
        marketing: [{ title: '写文案', detail: '', priority: 'P1', source: 'overview' }]
      }),
      doc
    )
    expect(Object.keys(plan)).toEqual(['product'])
    expect(plan.product?.[0].title).toBe('梳理验收条件')
    expect(renderTaskPlanMarkdown(plan.product ?? [], doc)).toContain(APP_CHAPTER_LABELS.scope)
  })

  it('游戏档提示词与解析仍是既有 5 岗口径', () => {
    const doc = gameDoc()
    const { system, prompt } = buildRoleTaskPrompt(doc)
    expect(system).toContain('资深游戏制作人')
    expect(prompt).toContain('策划书摘要')
    for (const role of CESHU_ROLE_ORDER) expect(prompt).toContain(role)
    const plan = parseRoleTaskPlan(
      JSON.stringify({ programmer: [{ title: '实现战斗', detail: '', priority: 'P0', source: 'combat' }] }),
      doc
    )
    expect(Object.keys(plan)).toEqual(['programmer'])
  })
})

describe('应用档：导出模板', () => {
  it('岗位任务清单用 SDD 岗位，标题是项目名', () => {
    const md = renderCeshuTasksMarkdown(appDoc())
    expect(md).toContain('《效率工具》')
    for (const role of APP_ROLES) expect(md).toContain(`${role.label}任务`)
    expect(md).not.toContain('程序任务')
    expect(md).not.toContain('未命名策划书')
  })

  it('项目文件夹 config.roles 与 tasks/*.md 都是应用岗位', () => {
    const { files } = buildProjectFolder(appDoc())
    const config = JSON.parse(files['config.json']) as { roles: Array<{ key: string; label: string }> }
    expect(config.roles.map((item) => item.key)).toEqual(APP_ROLES.map((item) => item.key))
    expect(files['tasks/backend.md']).toContain('后端任务')
    expect(files['tasks/product.md']).toContain('产品任务')
    expect(files['tasks/programmer.md']).toBeUndefined()
  })

  it('主 Markdown 导出是 SDD 章与项目头部，无 undefined 标签', () => {
    const doc = appDoc()
    const md = renderCeshuMarkdown(doc)
    for (const key of visibleChaptersForDoc(doc)) expect(md).toContain(APP_CHAPTER_LABELS[key])
    expect(md).toContain('# 效率工具')
    expect(md).toContain('平台:')
    expect(md).not.toContain('undefined')
    expect(md).not.toContain('未命名策划书')
  })

  it('交接包抬头与目录名按档位换措辞', async () => {
    const { handoffFolderName } = await import('../../src/main/ceshu/export/delivery/handoff')
    expect(handoffFolderName(appDoc())).toBe('效率工具-交接包')
    expect(handoffFolderName(gameDoc())).toContain('-交接包')
  })

  it('游戏档导出逐字节零回归', () => {
    const md = renderCeshuTasksMarkdown(gameDoc())
    expect(md).toContain('《星海计划》')
    for (const role of CESHU_ROLE_ORDER) expect(md).toContain(`${CESHU_ROLE_LABELS[role]}任务`)
    expect(md).not.toContain('后端任务')
    const main = renderCeshuMarkdown(gameDoc())
    expect(main).toContain('# 星海计划')
    expect(main).toContain('类型:')
    expect(main).toContain('附录：审核进度')
  })
})
