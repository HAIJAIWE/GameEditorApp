import { mkdtempSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportCeshuDocument } from '../../src/main/ceshu/export/exporter'
import {
  CESHU_BUNDLE_SCHEMA,
  buildCeshuBundle,
  renderCeshuBundleJson
} from '../../src/main/ceshu/export/delivery/bundle'
import type { CeshuDocument } from '../../src/shared/ceshu/reference/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'
import { setFieldStatuses } from '../../src/shared/ceshu/fields/ceshuFieldStatus'

function makeDoc(scope: 'full' | 'lite' = 'full'): CeshuDocument {
  const doc = createDefaultCeshu({ scope, name: '测试游戏' })
  doc.meta.game_type = 'RPG'
  doc.meta.positioning = '一句话定位'
  doc.meta.tags = ['剧情向', '开放世界']
  doc.combat.damage_formula = '伤害 = 攻击 - 防御'
  const battle = doc.systems.battle as { enabled: boolean; config: Record<string, unknown> }
  battle.enabled = true
  battle.config.turn_mode = 'turn_based'
  return doc
}

/** 给 meta 打上字段状态（走正式 API，避免测试手搓内部结构） */
function withFieldStatus(doc: CeshuDocument): CeshuDocument {
  doc.meta = setFieldStatuses(doc.meta, 'combat', { damage_formula: 'ai_draft' }, '2026-10-22T12:00:00.000Z')
  return doc
}

describe('双轨导出·机读轨 JSON 渲染', () => {
  it('结构：schema 标记、导出时间、文档头、章节目录、校验摘要', () => {
    const json = renderCeshuBundleJson(makeDoc(), { exportedAt: '2026-10-22T12:00:00.000Z' })
    const bundle = JSON.parse(json) as ReturnType<typeof buildCeshuBundle>

    expect(bundle.schema).toBe(CESHU_BUNDLE_SCHEMA)
    expect(CESHU_BUNDLE_SCHEMA).toBe('mobai-ceshu-bundle/1')
    expect(bundle.exportedAt).toBe('2026-10-22T12:00:00.000Z')
    expect(bundle.doc).toMatchObject({
      ceshuId: expect.any(String),
      versionLabel: 'v1.0',
      gddScope: 'full',
      gameName: '测试游戏',
      gameType: 'RPG',
      positioning: '一句话定位',
      tags: ['剧情向', '开放世界']
    })
    expect(bundle.chapters).toHaveLength(24) // P2 后 meta + 23 编号章
    expect(bundle.chapters[0]).toMatchObject({ key: 'meta', label: '文档信息', index: 1 })
    expect(bundle.chapters.at(-1)).toMatchObject({ index: 24 })
    expect(bundle.validation.errorCount).toBe(bundle.validation.errors.length)
    // 2 空格缩进 + 结尾换行（Git diff 友好）
    expect(json).toContain('\n  "schema": "mobai-ceshu-bundle/1"')
    expect(json.endsWith('\n')).toBe(true)
  })

  it('lite 档只含基础章（文档信息段 + 核心设计 9 章 = 10 章）', () => {
    const bundle = buildCeshuBundle(makeDoc('lite'))
    expect(bundle.doc.gddScope).toBe('lite')
    expect(bundle.chapters).toHaveLength(10)
    expect(bundle.chapters.map((chapter) => chapter.key)).not.toContain('market_analysis')
  })

  it('字段带协作契约：required / aiDraftable / aiHint / reviewHint', () => {
    const bundle = buildCeshuBundle(makeDoc())
    const meta = bundle.chapters.find((chapter) => chapter.key === 'meta')
    const positioning = meta?.fields.find((field) => field.key === 'positioning')
    expect(positioning).toMatchObject({
      key: 'positioning',
      label: '一句话定位',
      kind: 'text',
      required: true,
      aiDraftable: true,
      value: '一句话定位'
    })
    expect(positioning?.aiHint).not.toBe('')
    expect(positioning?.reviewHint).not.toBe('')

    // 人定字段：aiDraftable=false（下游机器据此跳过自动填写）
    const gameName = meta?.fields.find((field) => field.key === 'game_name')
    expect(gameName?.aiDraftable).toBe(false)
    expect(gameName?.required).toBe(true)
  })

  it('字段值原样序列化 + 审核状态来自 meta.field_status', () => {
    const bundle = buildCeshuBundle(withFieldStatus(makeDoc()))
    const combat = bundle.chapters.find((chapter) => chapter.key === 'combat')
    const damage = combat?.fields.find((field) => field.key === 'damage_formula')
    expect(damage?.value).toBe('伤害 = 攻击 - 防御')
    expect(damage?.status).toBe('ai_draft')

    // 无状态记录的字段不带 status 键（消费方用 in 判断，不猜）
    const other = combat?.fields.find((field) => field.key === 'damage_formula_points')
    expect(other && 'status' in other).toBe(false)
  })

  it('systems 章：系统配置作为原始值整体进 JSON（不拍平）', () => {
    const bundle = buildCeshuBundle(makeDoc())
    const systems = bundle.chapters.find((chapter) => chapter.key === 'systems')
    const battle = systems?.fields.find((field) => field.key === 'battle')
    expect(battle?.value).toMatchObject({ enabled: true, config: { turn_mode: 'turn_based' } })
  })

  it('schema 外扩展键保留值、不编造契约', () => {
    const doc = makeDoc()
    doc.meta.custom_note = '模板带来的扩展字段'
    const bundle = buildCeshuBundle(doc)
    const extra = bundle.chapters[0].fields.find((field) => field.key === 'custom_note')
    expect(extra).toMatchObject({ key: 'custom_note', label: 'custom_note', value: '模板带来的扩展字段' })
    expect(extra && 'kind' in extra).toBe(false)
  })
})

describe('双轨导出：exportCeshuDocument(bundle)', () => {
  it('一次写两份：.md（人读）+ .json（机读），结果带 files', async () => {
    const dir = makeDir()
    const target = join(dir, '策划书')
    const result = await exportCeshuDocument(makeDoc(), 'bundle', target)

    expect(result.format).toBe('bundle')
    expect(result.filePath).toBe(join(dir, '策划书.md'))
    expect(result.files).toHaveLength(2)
    expect(result.files?.map((file) => file.path)).toEqual([join(dir, '策划书.md'), join(dir, '策划书.json')])

    // 两份都真实落盘
    expect(existsSync(join(dir, '策划书.md'))).toBe(true)
    const json = JSON.parse(readFileSync(join(dir, '策划书.json'), 'utf-8')) as ReturnType<typeof buildCeshuBundle>
    expect(json.schema).toBe(CESHU_BUNDLE_SCHEMA)
    expect(json.doc.gameName).toBe('测试游戏')
    // md 人读轨内容正常
    expect(readFileSync(join(dir, '策划书.md'), 'utf-8')).toContain('# 测试游戏')
  })

  it('目标路径已带 .md 扩展名时不重复补', async () => {
    const dir = makeDir()
    const result = await exportCeshuDocument(makeDoc(), 'bundle', join(dir, 'doc.md'))
    expect(result.filePath).toBe(join(dir, 'doc.md'))
    expect(existsSync(join(dir, 'doc.json'))).toBe(true)
  })
})

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-ceshu-bundle-'))
}
