// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import ItemForm from '../../../src/renderer/src/components/ItemForm'
import type { DataTypeDef, ItemRecord, TypeFieldDef } from '../../../src/shared/types'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 条目编辑器的「字段偏少」引导条。
 *
 * ## 为什么要锁这条
 * 分区数量由**字段**决定（`buildFormLayout`），所以一个只有 4 个字段的自建类型
 * 只能分出一个「基础信息」区。用户看到「只有一个分区」时极容易以为编辑器坏了，
 * 而不知道字段可以在「字段结构编辑器 → 字段模板」里整体换（内置 7 套按玩法分类的模板）。
 *
 * 这条提示是**唯一**把「分区少」和「字段可换」连起来的地方，
 * 一旦被删或条件写错，用户会重新掉回同一个困惑里。
 */

const field = (name: string, type: TypeFieldDef['type'] = 'entry', label = `${name}:`): TypeFieldDef => ({
  name,
  label,
  type,
  editable: true
})

const FOUR_FIELDS: TypeFieldDef[] = [
  { ...field('id'), editable: false },
  field('name', 'entry', '角色名称:'),
  field('desc', 'desc', '描述:'),
  field('image', 'image', '图片:')
]

const SIX_FIELDS: TypeFieldDef[] = [...FOUR_FIELDS, field('job', 'combobox', '职业:'), field('tags', 'tags', '标签:')]

const TYPES: DataTypeDef[] = [
  { id: 'character', name: '角色', pluralKey: 'characters', color: '#2196F3', formFields: FOUR_FIELDS }
]

const ITEM: ItemRecord = {
  id: '0',
  type: 'character',
  data: { id: '0', name: '角色 1' },
  createdAt: '',
  updatedAt: ''
}

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  vi.restoreAllMocks()
})

async function renderForm(fields: TypeFieldDef[], onEditType?: (typeId: string) => void): Promise<RenderResult> {
  installMbApi({})
  view = await renderDom(
    <ItemForm item={ITEM} fields={fields} types={TYPES} onSaved={() => undefined} onEditType={onEditType} />
  )
  return view
}

describe('字段偏少时的引导', () => {
  it('字段 < 5 时出现，并说明「字段数决定分区数」', async () => {
    const result = await renderForm(FOUR_FIELDS, () => undefined)
    const hint = result.byTestId('item-form-few-fields')
    expect(hint.textContent).toContain('只有 4 个字段')
    expect(hint.textContent).toContain('2 个分区')
    // 必须点名模板入口，否则用户仍然不知道去哪改
    expect(hint.textContent).toContain('字段结构编辑器')
  })

  it('字段 ≥ 5 时不出现（内置类型不该看到这条提示）', async () => {
    const result = await renderForm(SIX_FIELDS, () => undefined)
    expect(result.query('[data-testid="item-form-few-fields"]')).toBeNull()
  })

  it('没有 onEditType 时不出现（避免给一个点了没反应的按钮）', async () => {
    const result = await renderForm(FOUR_FIELDS, undefined)
    expect(result.query('[data-testid="item-form-few-fields"]')).toBeNull()
  })

  it('「配置字段」把当前类型 id 回传给上层', async () => {
    const onEditType = vi.fn()
    const result = await renderForm(FOUR_FIELDS, onEditType)
    const button = [...result.byTestId('item-form-few-fields').querySelectorAll('button')].find((node) =>
      node.textContent?.includes('配置字段')
    )
    expect(button).toBeTruthy()
    await result.click(button as HTMLElement)
    expect(onEditType).toHaveBeenCalledWith('character')
  })
})
