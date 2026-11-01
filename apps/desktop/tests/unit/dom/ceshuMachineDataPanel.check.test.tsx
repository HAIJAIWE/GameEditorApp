// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuMachineDataPanel } from '../../../src/renderer/src/components/ceshuDoc'
import { checkContract } from '@mobai/shared/ceshu/validation'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { DataTableCheckResult } from '@mobai/shared/ceshu/data'
import type { DataTypeDef } from '@mobai/shared/types'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * 「设计 ↔ 数据表核对」：把策划书声明的表与数据编辑器实际表对上。
 *
 * 这块的价值全在「说清哪里不符」——只报一句「有 X 个问题」等于没说。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function doc() {
  const value = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  ;(value.tech as Record<string, unknown>).data_tables = ['装备|武器与防具|攻击力,稀有度|200']
  return value
}

const ISSUES: DataTableCheckResult = {
  requirements: [
    { raw: '装备|武器与防具|攻击力,稀有度|200', tableName: '装备', purpose: '武器与防具', keyFields: ['攻击力', '稀有度'], expectedCount: 200, isMinimum: false }
  ],
  issues: [
    { kind: 'count_short', level: 'error', table: '装备', message: '「装备」期望 200 条，实际 37 条' },
    { kind: 'missing_field', level: 'error', table: '装备', message: '「装备」缺字段：攻击力' }
  ],
  ok: false
}

describe('CeshuMachineDataPanel：数据表核对', () => {
  it('点核对 → 列出每条不符（不是只报个数）', async () => {
    api = installMbApi({ overrides: { 'ceshu.checkDataTables': () => ISSUES } })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)

    expect(view!.byTestId('datatable-check')).toBeTruthy()
    await view!.click(view!.byTestId('datatable-check-run'))

    expect(api!.calls).toContain('ceshu.checkDataTables')
    const text = view!.byTestId('datatable-issues').textContent ?? ''
    expect(text).toContain('期望 200 条，实际 37 条')
    expect(text).toContain('缺字段：攻击力')
  })

  it('全部对上时给一句明确的通过', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ({ ...ISSUES, issues: [], ok: true })
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))

    expect(view!.byTestId('datatable-check-ok').textContent).toContain('全部对得上')
  })

  it('没声明任何表时告诉用户去哪儿声明', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ({ requirements: [], issues: [], ok: true })
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))

    const text = view!.byTestId('datatable-check-none').textContent ?? ''
    expect(text).toContain('所需数据表')
    expect(text).toContain('表名|用途|关键字段|期望条数')
  })

  it('核对失败：显示错误，不假装通过', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => {
          throw new Error('数据库忙')
        }
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))

    expect(view!.byTestId('datatable-check-error').textContent).toContain('数据库忙')
  })
})

/**
 * 按声明补齐结构：先出计划，再确认执行。
 * 建表/加字段会改类型 schema（影响所有条目的表单），不能点一下就直接写。
 */
describe('CeshuMachineDataPanel：按声明补齐', () => {
  const PLAN = {
    tables: [
      {
        declaredName: '装备',
        action: 'add_fields' as const,
        targetTypeId: 'equip',
        pluralKey: '',
        targetTypeName: '装备',
        fields: [{ label: '攻击力:', name: 'atk', type: 'spinbox' as const, reason: '名字是数值指标' }],
        skippedFields: ['数值'],
        note: '表已存在，补齐缺的字段'
      }
    ],
    createTypeCount: 0,
    addFieldCount: 1,
    skippedTableCount: 0
  }

  it('有「缺字段」才给补齐入口；条数不足不给（建表解决不了数据少）', async () => {
    api = installMbApi({ overrides: { 'ceshu.checkDataTables': () => ISSUES } })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))
    expect(view!.byTestId('datatable-scaffold-plan')).toBeTruthy()
  })

  it('只有条数不足时不给补齐入口', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ({
          ...ISSUES,
          issues: [{ kind: 'count_short', level: 'error', table: '装备', message: '「装备」期望 200 条，实际 37 条' }],
          ok: false
        })
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))
    expect(view!.query('[data-testid="datatable-scaffold-plan"]')).toBeNull()
  })

  it('出计划 → 列出要加的字段与推定的类型', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ISSUES,
        'ceshu.planDataTableScaffold': () => PLAN
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))
    await view!.click(view!.byTestId('datatable-scaffold-plan'))

    expect(api!.calls).toContain('ceshu.planDataTableScaffold')
    const text = view!.byTestId('datatable-scaffold-preview').textContent ?? ''
    expect(text).toContain('攻击力:')
    expect(text).toContain('spinbox')
    expect(text).toContain('名字是数值指标')
  })

  it('确认执行 → 报改动数，并把新类型列表交回上层', async () => {
    const nextTypes: DataTypeDef[] = [
      {
        id: 'equip',
        name: '装备',
        pluralKey: 'equips',
        color: '#2196F3',
        formFields: [{ name: 'id', label: 'ID:', type: 'entry', editable: false }]
      }
    ]
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ISSUES,
        'ceshu.planDataTableScaffold': () => PLAN,
        'ceshu.applyDataTableScaffold': () => ({
          plan: PLAN,
          createTypeCount: 0,
          addFieldCount: 1,
          check: { requirements: ISSUES.requirements, issues: [], ok: true }
        }),
        'schema.list': () => nextTypes
      }
    })

    let received: DataTypeDef[] | null = null
    view = await renderDom(
      <CeshuMachineDataPanel doc={doc()} onTypesChanged={(types) => (received = types)} />
    )
    await view!.click(view!.byTestId('datatable-check-run'))
    await view!.click(view!.byTestId('datatable-scaffold-plan'))
    await view!.click(view!.byTestId('datatable-scaffold-apply'))

    expect(api!.calls).toContain('ceshu.applyDataTableScaffold')
    expect(view!.byTestId('datatable-scaffold-notice').textContent).toContain('补 1 个字段')
    // 关键：类型变了要通知宿主，否则数据编辑器还拿旧字段
    expect(received).not.toBeNull()
  })

  it('取消计划：不调 apply', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ISSUES,
        'ceshu.planDataTableScaffold': () => PLAN
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))
    await view!.click(view!.byTestId('datatable-scaffold-plan'))
    await view!.click(view!.byTestId('datatable-scaffold-cancel'))

    expect(api!.calls).not.toContain('ceshu.applyDataTableScaffold')
    expect(view!.query('[data-testid="datatable-scaffold-preview"]')).toBeNull()
  })
})

/**
 * AI 生成缺失数据：把「设计↔数据表核对」发现的条数缺口，转成 AI 生成候选 + 人工核对的入口。
 * 这一向严格遵循「AI 驱动生成、人微调」——按钮只把定位信息与缺口交给上层，
 * 真正的生成/导入仍走 AiDataGenPanel 的「候选 → 勾选 → 导入」链路，绝不偷偷灌空行。
 */
describe('CeshuMachineDataPanel：AI 生成缺失数据', () => {
  const FILL_ISSUES: DataTableCheckResult = {
    requirements: [
      { raw: '装备|武器与防具|攻击力,稀有度|200', tableName: '装备', purpose: '武器与防具', keyFields: ['攻击力', '稀有度'], expectedCount: 200, isMinimum: false }
    ],
    issues: [
      { kind: 'count_short', level: 'error', table: '装备', message: '「装备」期望 200 条，实际 37 条', typeId: 'equip', gap: 163 }
    ],
    ok: false
  }

  it('count_short 且有 typeId → 出现「AI 生成缺失数据」按钮', async () => {
    api = installMbApi({ overrides: { 'ceshu.checkDataTables': () => FILL_ISSUES } })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} onGenerateData={() => {}} />)
    await view!.click(view!.byTestId('datatable-check-run'))
    expect(view!.byTestId('datatable-ai-fill')).toBeTruthy()
  })

  it('按钮带缺口文案，并回调上层（缺口超上限时钳制到 20）', async () => {
    let received: { typeId: string; count: number; instruction: string } | null = null
    api = installMbApi({ overrides: { 'ceshu.checkDataTables': () => FILL_ISSUES } })
    view = await renderDom(
      <CeshuMachineDataPanel
        doc={doc()}
        onGenerateData={(target) => {
          received = target
        }}
      />
    )
    await view!.click(view!.byTestId('datatable-check-run'))
    await view!.click(view!.byTestId('datatable-ai-fill'))

    expect(received).not.toBeNull()
    expect(received!.typeId).toBe('equip')
    expect(received!.count).toBe(20) // 缺口 163 被钳制到每类上限 20
    expect(received!.instruction).toContain('缺口约 163 条')
  })

  it('没有 typeId 的 count_short（旧数据）不显示按钮', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.checkDataTables': () => ({
          ...ISSUES,
          issues: [{ kind: 'count_short', level: 'error', table: '装备', message: '「装备」期望 200 条，实际 37 条' }],
          ok: false
        })
      }
    })
    view = await renderDom(<CeshuMachineDataPanel doc={doc()} />)
    await view!.click(view!.byTestId('datatable-check-run'))
    expect(view!.query('[data-testid="datatable-ai-fill"]')).toBeNull()
  })
})

/**
 * 「设计契约体检」：把散在各章的可验证承诺投影成机读契约，整体盖章 PASS/FAIL。
 * 与上面「数据表核对」并列——一个是数据侧对上，一个是文档自身自洽。
 */
describe('CeshuMachineDataPanel：设计契约体检', () => {
  function readyDoc() {
    const value = createDefaultCeshu({ scope: 'full', name: '深潮灯塔' })
    value.numeric.numeric_parameters = [{ param: 'hp_base', value: '10', range: '', up: '', down: '' }]
    value.numeric.numeric_assertions = [
      { claim: '断言一', expr: 'hp_base', expected: '10', tolerance: '0', accept: '==10' }
    ]
    value.qa.prototype_acceptance = [{ check: '首载无错误', result: '通过', evidence: '跑通' }]
    value.qa.acceptance_journeys = [{ journey: '首次进入', steps: '开局', expected: '能玩' }]
    return value
  }

  it('点体检 → 显示出规则集标识与 PASS 结论', async () => {
    api = installMbApi({ overrides: { 'ceshu.checkContract': () => checkContract(readyDoc()) } })
    view = await renderDom(<CeshuMachineDataPanel doc={readyDoc()} />)

    expect(view!.byTestId('contract-check')).toBeTruthy()
    await view!.click(view!.byTestId('contract-check-run'))

    expect(api!.calls).toContain('ceshu.checkContract')
    const verdict = view!.byTestId('contract-check-verdict').textContent ?? ''
    expect(verdict).toContain('契约成立')
    expect(verdict).toContain('ceshu-') // 规则集标识（与 Demo 比对用）
    expect(view!.byTestId('contract-check-clean')).toBeTruthy()
  })

  it('断言复算不符 → 逐条列出错误，不给模糊的「有 N 个问题」', async () => {
    const bad = readyDoc()
    bad.numeric.numeric_assertions = [
      { claim: '算错的断言', expr: 'hp_base', expected: '999', tolerance: '0', accept: '==999' }
    ]
    api = installMbApi({ overrides: { 'ceshu.checkContract': () => checkContract(bad) } })
    view = await renderDom(<CeshuMachineDataPanel doc={bad} />)

    await view!.click(view!.byTestId('contract-check-run'))
    const text = view!.byTestId('contract-findings').textContent ?? ''
    expect(text).toContain('算错的断言')
    expect(view!.byTestId('contract-check-verdict').textContent ?? '').toContain('FAIL')
  })
})
