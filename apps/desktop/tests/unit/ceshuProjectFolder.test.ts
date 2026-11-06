import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_KEYS, APP_CHAPTER_LABELS } from '@mobai/shared/appSchema'
import { buildProjectFolder, projectFilesToDoc, projectFolderName } from '@mobai/shared/ceshu/workflow'

/**
 * 项目文件夹构建器：一份策划书 → config.json + design/<章>.md + tasks/<岗位>.md。
 * 纯函数，不落盘（落盘在 main/ceshu/export/projectFolder.ts）。
 */
describe('项目文件夹 buildProjectFolder', () => {
  it('产出 config.json / design 章 / tasks 岗位', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    doc.meta.positioning = '一句话定位'
    const { files } = buildProjectFolder(doc)

    expect(Object.keys(files)).toContain('config.json')
    expect(Object.keys(files)).toContain('design/meta.md')
    expect(Object.keys(files)).toContain('design/gameplay.md')
    expect(Object.keys(files)).toContain('tasks/programmer.md')
    expect(Object.keys(files)).toContain('tasks/artist.md')

    expect(files['config.json']).toContain('星海计划')
    expect(files['config.json']).toContain('programmer')
    expect(files['design/meta.md']).toContain('一句话定位')
    expect(files['tasks/programmer.md']).toContain('程序任务')
  })

  it('config.json 是合法 JSON，含档位；未勾选模块时写 null（不物化「全开」）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    const parsed = JSON.parse(buildProjectFolder(doc).files['config.json']) as {
      gdd_scope: string
      enabled_modules: string[] | null
    }
    expect(parsed.gdd_scope).toBe('full')
    // 缺省 = 全部模块，但 config 要忠实记录「用户没选过」，而不是列 20 项
    expect(parsed.enabled_modules).toBeNull()
  })

  it('用户勾过模块时，config 写实际启用的那几项', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    ;(doc.meta as Record<string, unknown>).enabled_modules = ['combat', 'numeric']
    const parsed = JSON.parse(buildProjectFolder(doc).files['config.json']) as {
      enabled_modules: string[] | null
    }
    expect(parsed.enabled_modules).toEqual(['combat', 'numeric'])
  })

  it('应用档 doc_kind 与平台随 config.json 往返（导出再导入不会变回游戏档）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '效率工具' })
    ;(doc.meta as Record<string, unknown>).doc_kind = 'application'
    ;(doc.meta as Record<string, unknown>).platform = ['PC', '移动端']
    const { files } = buildProjectFolder(doc)
    const parsed = JSON.parse(files['config.json']) as { doc_kind: string; platform: string[] }
    expect(parsed.doc_kind).toBe('application')
    expect(parsed.platform).toEqual(['PC', '移动端'])

    const restored = projectFilesToDoc(files)
    expect(restored.meta.doc_kind).toBe('application')
    expect(restored.meta.platform).toEqual(['PC', '移动端'])
  })

  it('老导出的 config 无 doc_kind ⇒ 回填默认游戏档（向后兼容）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '旧项目' })
    const { files } = buildProjectFolder(doc)
    const config = JSON.parse(files['config.json']) as Record<string, unknown>
    delete config.doc_kind
    files['config.json'] = JSON.stringify(config)
    expect(projectFilesToDoc(files).meta.doc_kind).toBe('game')
  })

  it('非法 doc_kind 不回填（脏值不污染文档）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '脏值' })
    const { files } = buildProjectFolder(doc)
    const config = JSON.parse(files['config.json']) as Record<string, unknown>
    config.doc_kind = 'unknown-kind'
    files['config.json'] = JSON.stringify(config)
    expect(projectFilesToDoc(files).meta.doc_kind).toBe('game')
  })

  it('无损往返：doc → 文件夹 → doc，文字进 design、数值进 data', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    doc.meta.positioning = '一句话定位'
    doc.meta.tags = ['slg', '联盟']
    doc.gameplay.core_loop_points = ['算', '派', '等']

    const { files } = buildProjectFolder(doc)
    // 文字 → design/<章>.md；结构化 → data/<章>.json
    expect(files['design/meta.md']).toContain('一句话定位')
    expect(files['data/meta.json']).toContain('slg')
    expect(files['data/gameplay.json']).toContain('算')

    const back = projectFilesToDoc(files)
    expect(back.meta.positioning).toBe('一句话定位')
    expect(back.meta.tags).toEqual(['slg', '联盟'])
    expect(back.gameplay.core_loop_points).toEqual(['算', '派', '等'])
  })

  it('schema 之外的扩展字段落进 data/*.json，往返不丢', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    // 早期版本遗留 / 插件写入的键：schema 里没有定义，但文档里真实存在
    ;(doc.gameplay as Record<string, unknown>).legacy_extra_key = '别丢了我'
    ;(doc.gameplay as Record<string, unknown>).extra_list = ['a', 'b']

    const { files } = buildProjectFolder(doc)
    expect(files['data/gameplay.json']).toContain('别丢了我')
    expect(files['data/gameplay.json']).toContain('extra_list')

    const back = projectFilesToDoc(files)
    expect((back.gameplay as Record<string, unknown>).legacy_extra_key).toBe('别丢了我')
    expect((back.gameplay as Record<string, unknown>).extra_list).toEqual(['a', 'b'])
  })

  it('身份与版本链随 config.json 往返（同一文件夹导入两次不会变两份文档）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    doc.version_label = 'v1.3'
    doc.parent_id = 'root-id'
    doc.is_active = true
    doc.created_at = '2026-01-02 03:04:05'
    doc.updated_at = '2026-02-03 04:05:06'
    doc.version_note = '加了经济系统'

    const back = projectFilesToDoc(buildProjectFolder(doc).files)
    expect(back.ceshu_id).toBe(doc.ceshu_id)
    expect(back.version_label).toBe('v1.3')
    expect(back.parent_id).toBe('root-id')
    expect(back.is_active).toBe(true)
    expect(back.created_at).toBe('2026-01-02 03:04:05')
    expect(back.updated_at).toBe('2026-02-03 04:05:06')
    expect(back.version_note).toBe('加了经济系统')
  })

  it('style / module_type 随 config.json 往返（它们是 AI 提示词的输入）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    doc.style = 'xianxia'
    doc.module_type = 'slg'

    const back = projectFilesToDoc(buildProjectFolder(doc).files)
    expect(back.style).toBe('xianxia')
    expect(back.module_type).toBe('slg')
  })

  it('岗位任务计划落进 data/tasks.json 并能读回（重新生成要花 token，不能只活在内存里）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    doc.task_plan = {
      programmer: [{ title: '实现核心循环状态机', detail: '三态切换', priority: 'P0', source: 'gameplay' }],
      artist: [{ title: '绘制主界面', detail: '', priority: 'P2', source: 'uiux' }]
    }

    const { files } = buildProjectFolder(doc)
    expect(files['data/tasks.json']).toContain('实现核心循环状态机')
    // tasks/<岗位>.md 用的是 AI 任务，不再是按章清单
    expect(files['tasks/programmer.md']).toContain('实现核心循环状态机')
    expect(files['tasks/programmer.md']).toContain('P0')

    const back = projectFilesToDoc(files)
    expect(back.task_plan?.programmer?.[0]?.title).toBe('实现核心循环状态机')
    expect(back.task_plan?.programmer?.[0]?.priority).toBe('P0')
    expect(back.task_plan?.artist).toHaveLength(1)
  })

  it('没有任务计划时不产出 data/tasks.json', () => {
    const { files } = buildProjectFolder(createDefaultCeshu({ scope: 'lite' }))
    expect(files['data/tasks.json']).toBeUndefined()
  })

  it('可玩原型落进 prototype/demo.html，往返不丢（原型也是交付物）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    doc.demo_html = '<html><body><h1>demo</h1></body></html>'

    const { files } = buildProjectFolder(doc)
    expect(files['prototype/demo.html']).toContain('<h1>demo</h1>')

    const back = projectFilesToDoc(files)
    expect(back.demo_html).toContain('<h1>demo</h1>')
  })

  it('没有原型时不产出 prototype/demo.html', () => {
    const { files } = buildProjectFolder(createDefaultCeshu({ scope: 'lite' }))
    expect(files['prototype/demo.html']).toBeUndefined()
  })
})

/** 导出目录名：游戏名做文件名要跨平台安全，空名要有回落 */
describe('projectFolderName', () => {
  it('用游戏名作目录名', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    expect(projectFolderName(doc)).toBe('星海计划')
  })

  it('去掉路径分隔符与 Windows 保留字符', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'A/B:C*D?E"F<G>H|I\\J' })
    expect(projectFolderName(doc)).toBe('A_B_C_D_E_F_G_H_I_J')
  })

  it('空名回落 ceshu-<id>', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '' })
    expect(projectFolderName(doc)).toBe(`ceshu-${doc.ceshu_id}`)
  })

  it('纯点号/空格的名字也回落（不能生成 . / .. 这类目录）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: ' .. ' })
    expect(projectFolderName(doc)).toBe(`ceshu-${doc.ceshu_id}`)
  })
})

describe('应用档项目文件夹：导出 SDD 章、导入能还原', () => {
  it('design/ 下是 17 个应用章，标题用 SDD 标签，且不含游戏章', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '效率工具', docKind: 'application' })
    const { files } = buildProjectFolder(doc)
    const designs = Object.keys(files).filter((path) => path.startsWith('design/'))
    expect(designs).toHaveLength(APP_CHAPTER_KEYS.length)
    expect(designs).toContain('design/architecture.md')
    expect(designs).toContain('design/risks.md')
    expect(designs).not.toContain('design/combat.md')
    expect(files['design/architecture.md']).toContain(APP_CHAPTER_LABELS.architecture)
  })

  it('导出 → 导入：档位、应用章内容都不丢（不被 isChapterKey 过滤掉）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '往返应用', docKind: 'application' })
    ;(doc as unknown as Record<string, unknown>).architecture = { modules: [{ module: 'A' }], storage: 'SQLite' }
    const { files } = buildProjectFolder(doc)
    const restored = projectFilesToDoc(files)
    const record = restored as unknown as Record<string, unknown>
    expect(restored.meta.doc_kind).toBe('application')
    // 用 toMatchObject：导入会合并 createDefaultCeshu 的默认空数组（既有行为，游戏档同理）
    expect(record.architecture).toMatchObject({ modules: [{ module: 'A' }], storage: 'SQLite' })
    for (const key of APP_CHAPTER_KEYS) expect(record[key], `读回丢了 ${key}`).toBeDefined()
  })

  it('游戏档导出仍只有 24 章（零回归）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '游戏' })
    const { files } = buildProjectFolder(doc)
    expect(Object.keys(files).filter((path) => path.startsWith('design/'))).toHaveLength(24)
    expect(files['design/combat.md']).toBeDefined()
    expect(files['design/architecture.md']).toBeUndefined()
  })
})
