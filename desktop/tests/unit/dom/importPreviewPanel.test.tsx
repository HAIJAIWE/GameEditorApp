// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { ImportPreviewPanel } from '../../../src/renderer/src/components/data'
import type { DataTypeDef, ImportPreview, ImportSummary } from '../../../src/shared/types'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * 导入预览面板：确认前把「新增多少、改了哪些字段」摆出来。
 *
 * 这是导入的唯一闸门——点错了就写库了（撤销栈只记单条，批量写不可撤销），
 * 所以这里要守住三件事：数字对、差异可见、确认才落库。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

const TYPES: DataTypeDef[] = [
  {
    id: 'equip',
    name: '装备',
    pluralKey: 'equips',
    color: '#4CAF50',
    formFields: [
      { name: 'id', label: 'ID:', type: 'entry', editable: false },
      { name: 'name', label: '装备名称:', type: 'entry', editable: true },
      { name: 'value', label: '数值:', type: 'spinbox', editable: true }
    ]
  }
]

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    kind: 'excel',
    filePath: '/tmp/装备.xlsx',
    totalRows: 3,
    createCount: 1,
    updateCount: 1,
    unchangedCount: 1,
    skipped: 0,
    byType: { equip: { create: 1, update: 1, unchanged: 1 } },
    records: [
      { type: 'equip', businessId: '0', name: '铁剑', kind: 'update', changes: [{ key: 'value', before: 10, after: 35 }] },
      { type: 'equip', businessId: '2', name: '秘银剑', kind: 'create', changes: [] }
    ],
    truncated: false,
    unknownTypes: {},
    missingIdSources: [],
    ...overrides
  }
}

const SUMMARY: ImportSummary = {
  filePath: '/tmp/装备.xlsx',
  totalItems: 2,
  imported: 1,
  updated: 1,
  skipped: 0,
  byType: { equip: 2 },
  unknownTypes: {},
  missingIdSources: []
}

describe('ImportPreviewPanel：展示', () => {
  it('统计与字段级差异（中文标签 + 前→后）', async () => {
    api = installMbApi()
    view = await renderDom(
      <ImportPreviewPanel previewId="imp-1" preview={preview()} types={TYPES} onApplied={() => {}} onCancel={() => {}} />
    )

    const stats = view!.byTestId('import-preview-stats').textContent ?? ''
    expect(stats).toContain('新增 1')
    expect(stats).toContain('修改 1')
    expect(stats).toContain('未变 1')

    const list = view!.byTestId('import-preview-list').textContent ?? ''
    // 字段 key → 中文标签（value → 数值:）
    expect(list).toContain('数值:')
    expect(list).toContain('10')
    expect(list).toContain('35')
    expect(list).toContain('铁剑')
    expect(list).toContain('秘银剑')
  })

  it('没有 id 列时红条警告（会变成重复项）', async () => {
    api = installMbApi()
    view = await renderDom(
      <ImportPreviewPanel
        previewId="imp-1"
        preview={preview({ missingIdSources: ['工作表「装备」'] })}
        types={TYPES}
        onApplied={() => {}}
        onCancel={() => {}}
      />
    )
    expect(view!.byTestId('import-preview-missing-id').textContent).toContain('重复项')
  })

  it('完全没有变化时说明白，而不是列一张空表', async () => {
    api = installMbApi()
    view = await renderDom(
      <ImportPreviewPanel
        previewId="imp-1"
        preview={preview({ createCount: 0, updateCount: 0, records: [] })}
        types={TYPES}
        onApplied={() => {}}
        onCancel={() => {}}
      />
    )
    expect(view!.byTestId('import-preview-nochange').textContent).toContain('不会产生任何变化')
  })

  it('变更过多时提示已截断', async () => {
    api = installMbApi()
    view = await renderDom(
      <ImportPreviewPanel
        previewId="imp-1"
        preview={preview({ truncated: true })}
        types={TYPES}
        onApplied={() => {}}
        onCancel={() => {}}
      />
    )
    expect(view!.byTestId('import-preview-truncated').textContent).toContain('仅列出前')
  })
})

describe('ImportPreviewPanel：动作', () => {
  it('确认导入：调 applyImport，把汇总交回上层', async () => {
    api = installMbApi({ overrides: { 'data.applyImport': () => SUMMARY } })
    let applied: ImportSummary | null = null
    view = await renderDom(
      <ImportPreviewPanel
        previewId="imp-42"
        preview={preview()}
        types={TYPES}
        onApplied={(summary) => (applied = summary)}
        onCancel={() => {}}
      />
    )

    await view!.click(view!.byTestId('import-preview-apply'))

    expect(api!.calls).toContain('data.applyImport')
    expect(applied).not.toBeNull()
    expect((applied as unknown as ImportSummary).imported).toBe(1)
  })

  it('确认失败（会话过期）：显示错误，不假装成功', async () => {
    api = installMbApi({
      overrides: {
        'data.applyImport': () => {
          throw new Error('导入会话已失效，请重新选择文件')
        }
      }
    })
    let applied = false
    view = await renderDom(
      <ImportPreviewPanel
        previewId="imp-old"
        preview={preview()}
        types={TYPES}
        onApplied={() => (applied = true)}
        onCancel={() => {}}
      />
    )

    await view!.click(view!.byTestId('import-preview-apply'))

    expect(view!.byTestId('import-preview-error').textContent).toContain('已失效')
    expect(applied).toBe(false)
  })

  it('取消：不调任何导入通道', async () => {
    api = installMbApi()
    let cancelled = false
    view = await renderDom(
      <ImportPreviewPanel
        previewId="imp-1"
        preview={preview()}
        types={TYPES}
        onApplied={() => {}}
        onCancel={() => (cancelled = true)}
      />
    )

    await view!.click(view!.byTestId('import-preview-cancel'))

    expect(cancelled).toBe(true)
    expect(api!.calls).not.toContain('data.applyImport')
  })
})
