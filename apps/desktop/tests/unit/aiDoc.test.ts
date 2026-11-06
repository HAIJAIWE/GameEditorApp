import { describe, expect, it } from 'vitest'

import { buildAppHandoffFiles } from '../../src/main/ceshu/export/delivery/appHandoff'
import { buildExcelWorkbook } from '../../src/main/ceshu/export/doc/excel'
import {
  chapterLabelForDoc,
  chapterNumberForDoc,
  createDefaultCeshu,
  getDocKind,
  normalizeCeshu,
  requiredFieldsForDoc,
  visibleChaptersForDoc,
  withChapter
} from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * AI 档（第三种文档）端到端守卫：不只 spec 层注册，章表分派 / 读盘补齐 /
 * 保存保持档位 / 交接包口径都要真的按 ai 走，不能悄悄落回游戏。
 */
const MODEL_CHAPTERS = ['model_card', 'data_sheet', 'system_card', 'eval_redteam'] as const

function aiDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', docKind: 'ai', name: '智能客服' })
}

describe('AI 档：档位与章表分派', () => {
  it('建出来就是 ai 档，可见章含软件 16 章 + 模型层 4 章 + meta', () => {
    const doc = aiDoc()
    expect(getDocKind(doc)).toBe('ai')
    const visible = visibleChaptersForDoc(doc)
    expect(visible).toContain('meta')
    for (const key of MODEL_CHAPTERS) expect(visible).toContain(key)
    // 20 编号章 + meta
    expect(visible).toHaveLength(21)
    // 不掺游戏章
    expect(visible).not.toContain('gameplay')
    expect(visible).not.toContain('level_design')
  })

  it('模型层四章的标签 / 章号 / 必填来自 AI 章表（不是游戏常量）', () => {
    const doc = aiDoc()
    expect(chapterLabelForDoc(doc, 'model_card')).toContain('模型卡')
    expect(chapterLabelForDoc(doc, 'eval_redteam')).toContain('评测与红队')
    // AI 分区顺序：定义 3 + 产品 3 + 技术 4 = 10 章后进入模型层
    expect(chapterNumberForDoc(doc, 'model_card')).toBe(11)
    expect(chapterNumberForDoc(doc, 'eval_redteam')).toBe(14)
    expect(chapterNumberForDoc(doc, 'meta')).toBe(0)
    expect(requiredFieldsForDoc(doc, 'model_card')).toContain('base_model')
    expect(requiredFieldsForDoc(doc, 'eval_redteam')).toContain('eval_metrics')
  })

  it('应用章 key 与 AI 章 key 在各自档位下解释不同内容（按档位分派）', () => {
    const ai = aiDoc()
    const app = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '效率工具' })
    // 同名 key `api` 两档都有，但章号/标签由各自规格给出
    expect(chapterLabelForDoc(ai, 'api')).toContain('接口')
    expect(chapterLabelForDoc(app, 'api')).toContain('接口')
    // AI 独有章在应用档不存在
    expect(visibleChaptersForDoc(app)).not.toContain('model_card')
  })
})

describe('AI 档：读盘与保存保持档位', () => {
  it('normalizeCeshu 往返后仍是 ai 档，并补齐缺失的模型层章', () => {
    const raw = JSON.parse(JSON.stringify(aiDoc())) as Record<string, unknown>
    delete raw.model_card
    delete raw.eval_redteam
    const normalized = normalizeCeshu(raw)
    expect(getDocKind(normalized)).toBe('ai')
    const d = normalized as unknown as Record<string, unknown>
    expect(typeof d.model_card).toBe('object')
    expect(typeof d.eval_redteam).toBe('object')
  })

  it('withChapter 编辑 meta 时不会把 ai 档改回游戏（脏值也保留原档）', () => {
    const doc = aiDoc()
    const kept = withChapter(doc, 'meta', { ...doc.meta, doc_kind: 'ai' })
    expect(getDocKind(kept)).toBe('ai')
    const dirty = withChapter(doc, 'meta', { ...doc.meta, doc_kind: 'unknown' })
    expect(getDocKind(dirty)).toBe('ai')
  })
})

describe('AI 档：交接包按 SDD 口径（含模型层章）', () => {
  it('index.json 标 docKind=ai，章节目录含模型卡，README 用 AI 文档名', () => {
    const files = buildAppHandoffFiles(aiDoc(), { generatedAt: '2026-11-07 00:00:00' })
    expect(files['index.json']).toContain('"docKind": "ai"')
    expect(files['index.json']).toContain('"model_card"')
    expect(files['index.json']).toContain('AI 产品设计文档')
    expect(files['README.md']).toContain('模型卡')
    expect(files['README.md']).toContain('AI 产品设计文档')
    // 模型层章有逐章设计文件
    expect(files['design/model_card.md']).toBeTypeOf('string')
  })

  it('Excel 导出含模型层四章 sheet', () => {
    const workbook = buildExcelWorkbook(aiDoc())
    const names = workbook.worksheets.map((sheet) => sheet.name)
    for (const name of ['模型卡', '数据表', '系统卡', '评测与红队']) {
      expect(names).toContain(name)
    }
  })
})
