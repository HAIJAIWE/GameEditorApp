import { describe, expect, it } from 'vitest'

import { buildHandoffFiles, handoffFolderName } from '../../src/main/ceshu/export/handoff'
import type { CeshuDocument } from '../../src/shared/ceshu/ceshuConstants'
import { HANDOFF_VOLUMES, handoffVolumeIndexPath, planHandoffDocs } from '../../src/shared/ceshu/ceshuHandoff'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

/**
 * 交接包导出的**装箱单**（2026-10-27）。
 *
 * 钉住三件事：
 * 1. 分卷 + 总纲 + 人读/机读/契约一定在（这是「按卷施工」的最小集）；
 * 2. 数据侧（schema/snapshot）与原型**只在有内容时才写**——空文件会让实现方以为「本来就没有数据」；
 * 3. 不重复造数据：快照复用 `buildJsonSnapshot` 的形状（`mb-data-snapshot/v1`）。
 */

function makeDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '测试游戏' })
}

const TYPES: DataTypeDef[] = [
  {
    id: 'equipment',
    name: '装备',
    pluralKey: 'equipments',
    color: '#888',
    formFields: [
      { name: 'id', label: 'ID', type: 'entry', editable: false },
      { name: 'attack', label: '攻击', type: 'spinbox', editable: true, from: 0, to: 999 }
    ]
  }
]

const ITEMS: ItemRecord[] = [
  {
    id: 'eq_1',
    type: 'equipment',
    data: { id: 'eq_1', name: '铁剑', attack: 10 },
    createdAt: '2026-10-01T00:00:00',
    updatedAt: '2026-10-01T00:00:00'
  }
]

const GENERATED_AT = '2026-10-27 12:00:00'

describe('buildHandoffFiles：包内容', () => {
  it('最小集：README + 6 个卷目录 + 规划文档 + gdd + bundle + contract + index.json', () => {
    const doc = makeDoc()
    const files = buildHandoffFiles(doc, { generatedAt: GENERATED_AT })
    const paths = Object.keys(files)
    const planned = planHandoffDocs(doc)

    expect(paths).toContain('README.md')
    expect(paths).toContain('开发路线.md')
    expect(paths).toContain('gdd.md')
    expect(paths).toContain('bundle.json')
    expect(paths).toContain('contract.json')
    expect(paths).toContain('index.json')
    for (const volume of HANDOFF_VOLUMES) {
      expect(paths).toContain(handoffVolumeIndexPath(volume))
    }
    for (const item of planned) {
      expect(paths).toContain(item.path)
    }
    // README + 开发路线 + 6 卷目录 + 规划文档 + gdd/bundle/contract + index.json
    expect(paths).toHaveLength(1 + HANDOFF_VOLUMES.length + planned.length + 5)

    // 机读清单必须能解析，且文档数与规划一致（agent 靠它调度，解析失败就退回凭感觉挑）
    const manifest = JSON.parse(files['index.json']) as { schema: string; docs: unknown[] }
    expect(manifest.schema).toBe('mb-handoff-index/1')
    expect(manifest.docs).toHaveLength(planned.length)
  })

  it('品类裁剪会减少文档：视觉小说不含「敌人与 Boss」', () => {
    const doc = makeDoc()
    doc.meta.game_type = '视觉小说'
    const paths = Object.keys(buildHandoffFiles(doc, { generatedAt: GENERATED_AT }))
    expect(paths).toContain('02-内容/03-剧情分支与结局.md')
    expect(paths.some((path) => path.includes('敌人与 Boss'))).toBe(false)
    expect(paths.some((path) => path.includes('技能与 Buff'))).toBe(false)
  })

  it('组合品类会追加文档：SLG+卡牌 同时出「联盟与对抗」「抽卡与卡池」', () => {
    const doc = makeDoc()
    doc.meta.game_type = 'SLG'
    doc.meta.game_type_tags = ['卡牌']
    const paths = Object.keys(buildHandoffFiles(doc, { generatedAt: GENERATED_AT }))
    expect(paths.some((path) => path.includes('联盟与对抗'))).toBe(true)
    expect(paths.some((path) => path.includes('抽卡与卡池'))).toBe(true)
  })

  it('目录结构：卷文件夹下的文档路径带两位顺序号', () => {
    const files = buildHandoffFiles(makeDoc(), { generatedAt: GENERATED_AT })
    const docPaths = Object.keys(files).filter((path) => path.endsWith('.md') && path.includes('/'))
    expect(docPaths).toContain('00-架构/01-范围与平台.md')
    expect(docPaths).toContain('03-系统/01-装备与词条.md')
    expect(docPaths.every((path) => /^\d{2}-[^/]+\/(README|\d{2}-.+)\.md$/.test(path))).toBe(true)
  })

  it('README 里带生成时间（时间由调用方注入，测试可复现）', () => {
    const files = buildHandoffFiles(makeDoc(), { generatedAt: GENERATED_AT })
    expect(files['README.md']).toContain(GENERATED_AT)
  })

  it('没传数据表：不写 schema.json / snapshot（避免空文件误导）', () => {
    const files = buildHandoffFiles(makeDoc(), { generatedAt: GENERATED_AT })
    expect(files['schema.json']).toBeUndefined()
    expect(files['data/snapshot.json']).toBeUndefined()
  })

  it('传了 types + items：写 schema.json 与确定性快照', () => {
    const files = buildHandoffFiles(makeDoc(), { generatedAt: GENERATED_AT, types: TYPES, items: ITEMS })

    const schema = JSON.parse(files['schema.json'] ?? '{}') as { schema: string; types: DataTypeDef[] }
    expect(schema.schema).toBe('mb-type-schema/v1')
    expect(schema.types[0]?.formFields.map((field) => field.name)).toEqual(['id', 'attack'])

    const snapshot = JSON.parse(files['data/snapshot.json'] ?? '{}') as {
      $schema: string
      counts: { total: number; byType: Record<string, number> }
      items: ItemRecord[]
    }
    // 与数据编辑器的快照导出同形（同一个 buildJsonSnapshot，字段名是 `$schema`）
    expect(snapshot.$schema).toBe('mb-data-snapshot/v1')
    expect(snapshot.counts.total).toBe(1)
    expect(snapshot.counts.byType.equipment).toBe(1)
    expect(snapshot.items[0]?.data.attack).toBe(10)
  })

  it('没有原型就不写 prototype/demo.html；有则原样带上', () => {
    const empty = buildHandoffFiles(makeDoc(), { generatedAt: GENERATED_AT })
    expect(empty['prototype/demo.html']).toBeUndefined()

    const doc = makeDoc()
    doc.demo_html = '<!DOCTYPE html><html><body>demo</body></html>'
    const withDemo = buildHandoffFiles(doc, { generatedAt: GENERATED_AT })
    expect(withDemo['prototype/demo.html']).toContain('<!DOCTYPE html>')
  })

  it('contract.json 是合法 JSON 且带规则集标识', () => {
    const files = buildHandoffFiles(makeDoc(), { generatedAt: GENERATED_AT })
    const contract = JSON.parse(files['contract.json'] ?? '{}') as { rulesetId?: string }
    expect(typeof contract.rulesetId).toBe('string')
  })
})

describe('handoffFolderName：目录名', () => {
  it('带「-交接包」后缀', () => {
    expect(handoffFolderName(makeDoc())).toBe('测试游戏-交接包')
  })

  it('去掉文件名非法字符；空名回退', () => {
    const doc = makeDoc()
    doc.meta.game_name = 'A/B:C*D?'
    expect(handoffFolderName(doc)).toBe('A_B_C_D_-交接包')

    doc.meta.game_name = '   '
    expect(handoffFolderName(doc)).toBe('未命名游戏-交接包')
  })
})
