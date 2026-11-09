import { describe, expect, it } from 'vitest'

import { buildHandoffFiles } from '../../src/main/ceshu/export/delivery/handoff'
import { createDefaultCeshu, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_LABELS, APP_PARTS, APP_ROLES } from '@mobai/shared/appSchema'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 应用档交接包守卫：不再套用游戏的 7 卷 11 文档分卷 / 品类裁剪 / 游戏角色，
 * 而是按 SDD 分区 + APP_ROLES 组织。游戏档流程由 ceshuHandoff*.test.ts 锁定。
 */
function appDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '效率工具' })
  doc.meta.project_name = '效率工具'
  doc.meta.platform = ['desktop', 'web']
  return doc
}

const extras = { generatedAt: '2026-11-06T20:00:00.000Z' }

describe('应用档：交接包按 SDD 章节重组', () => {
  const files = buildHandoffFiles(appDoc(), extras)

  it('不再生成游戏分卷与品类专属文件', () => {
    const paths = Object.keys(files)
    expect(paths.some((path) => /^0\d-/.test(path))).toBe(false) // 00-架构 / 01-核心玩法 …
    expect(files['README.md']).not.toContain('核心循环')
    expect(files['README.md']).not.toContain('品类')
    expect(files['README.md']).not.toContain('伤害公式')
    expect(files['index.json']).not.toContain('"genre"')
    expect(files['index.json']).not.toContain('"game"')
    expect(files['index.json']).not.toContain('HANDOFF')
  })

  it('逐章设计文件与岗位任务文件齐全', () => {
    for (const key of visibleChaptersForDoc(appDoc())) {
      expect(files[`design/${key}.md`], key).toBeDefined()
      expect(files[`design/${key}.md`]).toContain(APP_CHAPTER_LABELS[key])
    }
    for (const role of APP_ROLES) {
      expect(files[`tasks/${role.key}.md`], role.key).toContain(`${role.label}任务`)
    }
    expect(files['tasks/programmer.md']).toBeUndefined()
  })

  it('README 是 SDD 分区口径，含项目名、平台与岗位责任', () => {
    const readme = files['README.md']
    expect(readme).toContain('效率工具')
    expect(readme).toContain('软件设计文档')
    expect(readme).toContain('desktop')
    for (const part of APP_PARTS.filter((p) => p.key !== 'ai_layer')) expect(readme).toContain(part.label)
    for (const role of APP_ROLES) expect(readme).toContain(role.label)
    expect(readme).not.toContain('程序')
    expect(readme).not.toContain('美术')
  })

  it('index.json 是可调度的机读清单', () => {
    const manifest = JSON.parse(files['index.json']) as {
      schema: string
      docKind: string
      parts: Array<{ key: string; chapters: string[] }>
      chapters: Array<{ key: string; label: string; agentId: string; file: string }>
      roles: Array<{ key: string; label: string; taskFile: string }>
    }
    expect(manifest.schema).toBe('mb-app-handoff/v1')
    expect(manifest.docKind).toBe('application')
    expect(manifest.parts.map((part) => part.key)).toEqual(APP_PARTS.map((part) => part.key))
    expect(manifest.chapters.map((chapter) => chapter.key)).toEqual([...visibleChaptersForDoc(appDoc())])
    for (const chapter of manifest.chapters) {
      expect(chapter.label).toBe(APP_CHAPTER_LABELS[chapter.key])
      expect(chapter.agentId).toBeTruthy()
      expect(chapter.file).toBe(`design/${chapter.key}.md`)
    }
    expect(manifest.roles.map((role) => role.key)).toEqual(APP_ROLES.map((role) => role.key))
  })

  it('开发路线按分区顺序，不用游戏角色措辞', () => {
    const route = files['开发路线.md']
    expect(route).toContain('效率工具')
    for (const part of APP_PARTS.filter((p) => p.key !== 'ai_layer')) expect(route).toContain(part.label)
    expect(route).not.toContain('进引擎')
    expect(route).not.toContain('品类')
  })

  it('gdd.md / bundle.json / contract.json 仍是同源产物，抬头是 SDD 口径', () => {
    expect(files['gdd.md']).toContain('完整软件设计文档')
    expect(files['gdd.md']).toContain('效率工具')
    expect(files['gdd.md']).not.toContain('完整策划书')
    // 交接包是交付件：内部校验附录（「字段 xx 为必填项」）不进 gdd.md
    expect(files['gdd.md']).not.toContain('附录：数据校验报告')
    expect(files['gdd.md']).not.toContain('附录：审核进度')
    expect(files['bundle.json']).toContain('architecture')
    expect(files['contract.json']).toContain('ruleset')
  })

  it('可选装箱：数据表与原型', () => {
    const doc = appDoc()
    doc.demo_html = '<html>界面原型</html>'
    const withExtras = buildHandoffFiles(doc, {
      ...extras,
      types: [{ id: 't1', name: '任务' } as never],
      items: []
    })
    expect(withExtras['prototype/demo.html']).toContain('界面原型')
    expect(withExtras['schema.json']).toContain('mb-type-schema/v1')
  })
})

describe('游戏档：交接包仍走原分卷体系', () => {
  it('产出 00- 分卷与 gdd.md 原抬头', () => {
    const files = buildHandoffFiles(createDefaultCeshu({ scope: 'full', name: '星海计划' }), extras)
    expect(Object.keys(files).some((path) => path.startsWith('00-架构/'))).toBe(true)
    expect(files['gdd.md']).toContain('完整策划书')
    expect(files['gdd.md']).toContain('（00-架构 … 06-研发）')
    // 游戏档同口径：交付件不带内部校验附录
    expect(files['gdd.md']).not.toContain('附录：数据校验报告')
    expect(files['index.json']).not.toContain('mb-app-handoff')
  })
})
