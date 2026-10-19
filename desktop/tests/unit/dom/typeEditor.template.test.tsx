// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import TypeEditorPanel from '../../../src/renderer/src/components/TypeEditorPanel'
import type { DataTypeDef, TypeFieldDef } from '../../../src/shared/types'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 「应用字段模板」前的失联确认。
 *
 * ## 为什么要锁
 * 应用模板只改 schema（`schema:save` 写 type_schema.json），**不动条目数据** ——
 * 条目的 `data` 里旧字段值原样保留。但字段名一旦不在 schema 里，界面上就**不再显示**，
 * 用户视角等同于「数据没了」。这是静默失联，比报错更糟，所以替换前必须问一句。
 *
 * 锁三件事：
 * 1. 有字段会失联时**不立即替换**，先出确认条并点名是哪些字段；
 * 2. 取消后字段原样不动；
 * 3. 确认后才替换（且替换结果 = 模板字段）。
 */

const field = (name: string, label = `${name}:`): TypeFieldDef => ({
  name,
  label,
  type: 'entry',
  editable: true
})

const CHARACTER: DataTypeDef = {
  id: 'character',
  name: '角色',
  pluralKey: 'characters',
  color: '#2196F3',
  formFields: [
    { ...field('id', 'ID:'), editable: false },
    field('name', '角色名称:'),
    field('desc', '描述:'),
    field('image', '图片:')
  ]
}

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  vi.restoreAllMocks()
})

async function renderPanel(): Promise<RenderResult> {
  installMbApi({
    overrides: {
      'schema.listFieldTemplates': () => ({ builtin: [], custom: [] }),
      'schema.list': () => [CHARACTER]
    }
  })
  view = await renderDom(
    <TypeEditorPanel types={[CHARACTER]} onSaved={() => undefined} onClose={() => undefined} />
  )
  return view
}

/** 草稿里当前所有字段名（字段行输入框的 testid 是 `te-field-name-<index>`） */
function fieldNames(result: RenderResult): string[] {
  return result
    .queryAll('[data-testid^="te-field-name-"]')
    .map((node) => (node as HTMLInputElement).value)
}

/** 选中模板并点「应用模板」 */
async function pickTemplate(result: RenderResult, name: string): Promise<void> {
  const select = result.byTestId('te-template') as HTMLSelectElement
  // 原生 change 必须包 act：否则 React 的受控组件更新会在断言之后才落定（并报警告）
  await act(async () => {
    select.value = name
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await result.flush()
  await result.click(result.byTestId('te-apply-template'))
}

describe('应用字段模板的失联确认', () => {
  it('模板缺少当前字段时不立即替换，并点名会失联的字段', async () => {
    const result = await renderPanel()
    // 「卡牌TCG」没有 desc / image（有 id/name/cost/atk/…）
    await pickTemplate(result, '卡牌TCG')

    const confirm = result.byTestId('te-template-confirm')
    expect(confirm.textContent).toContain('卡牌TCG')
    // 只点名真正会失联的字段：卡牌TCG 有 desc 但没有 image，故只有「图片」会失联
    expect(confirm.textContent).toContain('图片')
    expect(confirm.textContent).not.toContain('描述')
    // 关键：此刻字段**还没被替换**（描述字段仍在草稿里）
    expect(fieldNames(result)).toContain('desc')
  })

  it('取消后字段原样不动', async () => {
    const result = await renderPanel()
    await pickTemplate(result, '卡牌TCG')
    await result.click(result.byTestId('te-template-confirm-cancel'))

    expect(result.query('[data-testid="te-template-confirm"]')).toBeNull()
    // 描述字段还在（说明没替换）
    expect(fieldNames(result)).toContain('desc')
  })

  it('确认后才替换为模板字段', async () => {
    const result = await renderPanel()
    await pickTemplate(result, '卡牌TCG')
    await result.click(result.byTestId('te-template-confirm-apply'))

    expect(result.query('[data-testid="te-template-confirm"]')).toBeNull()
    const names = fieldNames(result)
    // 卡牌模板的字段进来（cost），失联的图片字段出去，同名的描述保留
    expect(names).toContain('cost')
    expect(names).not.toContain('image')
    expect(names).toContain('desc')
  })
})
