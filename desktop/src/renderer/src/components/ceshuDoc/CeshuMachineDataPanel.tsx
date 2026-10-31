import { useEffect, useState } from 'react'

import { CHAPTER_LABELS, type CeshuDocument } from '../../../../shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS } from '../../../../shared/ceshu/fields'
import { displayFieldValue } from '../../../../shared/ceshu/fields'
import { visibleChaptersForDoc } from '../../../../shared/ceshu/model'
import { CESHU_MACHINE_DATA_FIELDS } from '../../../../shared/ceshu/workflow'
import type { DataTableCheckResult, DataTableIssue } from '../../../../shared/ceshu/data'
import type { ContractReport } from '../../../../shared/ceshu/validation'
import { DATA_GEN_MAX_COUNT, DATA_GEN_MIN_COUNT } from '../../../../shared/ceshu/data'
import type { ScaffoldPlan } from '../../../../shared/ceshu/data'
import type { DataTypeDef } from '../../../../shared/types'
import { toErrorMessage } from '../../../../shared/util/system'

/**
 * 把「AI 生成缺失数据」的补充要求拼出来：说清要补哪张表、缺口多大、按什么原则生成。
 * 具体的数值/系统设定由 `ceshuDataGen.buildDataGenPrompt` 从策划书喂给模型，
 * 这里只负责把「为什么生成、生成什么边界」讲清楚，避免 AI 凭空编一堆无关数据。
 */
function buildFillInstruction(issue: DataTableIssue): string {
  const gapNote = issue.gap !== undefined ? `，缺口约 ${issue.gap} 条` : ''
  return (
    `「${issue.table}」表数据不足（单次生成上限 ${DATA_GEN_MAX_COUNT} 条，可多轮补齐${gapNote}）。` +
    '请严格依据本策划书的数值/系统章设定（含平衡公式、成长曲线、稀有度梯度、掉落概率等）生成数值合理的候选条目；' +
    '与当前数值体系无关或设计未定义的字段可留空或给合理默认值。' +
    '生成后请在预览里逐条核对、按实际数值微调后再导入数据表。'
  )
}

/**
 * 数据 / 机读（三栏布局「数据·机读」标签）：把「验收 / 机读数据」字段集中列出。
 * 这些字段不计入完成度（账本/断言/主张/用例），导出机读包走「导出」。
 *
 * 另挂一块「设计 ↔ 数据表核对」：策划书在「技术方案」章的「所需数据表」里声明了要建哪些表、
 * 多少条、要哪些字段，这里拿数据编辑器的实际状况去比——这是「设计文档驱动数据」的最后一公里，
 * 以前两边谁也发现不了彼此对不上。
 */
export default function CeshuMachineDataPanel({
  doc,
  onTypesChanged,
  onGenerateData
}: {
  doc: CeshuDocument
  /** 补齐结构会改类型 schema，上层要重新拉一次类型列表 */
  onTypesChanged?: (types: DataTypeDef[]) => void
  /** 「AI 生成缺失数据」：把缺口表交回上层，由 AI 生成候选、人工核对后再导入（AI 驱动生成、人微调） */
  onGenerateData?: (target: { typeId: string; count: number; instruction: string }) => void
}) {
  const visible = new Set(visibleChaptersForDoc(doc))
  const rows = CESHU_MACHINE_DATA_FIELDS.filter((item) => visible.has(item.chapter)).map((item) => {
    const field = (CESHU_CHAPTER_FIELDS[item.chapter] ?? []).find((candidate) => candidate.key === item.field)
    const data = (doc[item.chapter] ?? {}) as Record<string, unknown>
    const value = field !== undefined ? displayFieldValue(field, data[item.field]) : ''
    return { ...item, label: field?.label ?? item.field, value, filled: value !== '' }
  })

  const [check, setCheck] = useState<DataTableCheckResult | null>(null)
  const [plan, setPlan] = useState<ScaffoldPlan | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contract, setContract] = useState<ContractReport | null>(null)

  const runContractCheck = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setContract(await window.mbApi.ceshu.checkContract({ id: doc.ceshu_id }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const runCheck = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    setPlan(null)
    try {
      setCheck(await window.mbApi.ceshu.checkDataTables({ id: doc.ceshu_id }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // 挂载即核对：从「AI 生成缺失数据」返回时面板会重挂（生成面板占满内容区），
  // 自动再核对一次就能看到缺口是否补齐，不必让用户再手点一次「核对数据表」。
  // 走 .then 回调而不是直接调 runCheck：effect 体内同步 setState 会触发级联渲染（lint 也拦）。
  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .checkDataTables({ id: doc.ceshu_id })
      .then((result) => {
        if (!cancelled) setCheck(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [doc.ceshu_id])

  /**
   * 先算计划、再确认执行。
   * 建表/加字段会改类型 schema（影响所有条目的表单），不能点一下就直接写。
   */
  const previewScaffold = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      setPlan(await window.mbApi.ceshu.planDataTableScaffold({ id: doc.ceshu_id }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const applyScaffold = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.mbApi.ceshu.applyDataTableScaffold({ id: doc.ceshu_id })
      setCheck(result.check)
      setPlan(null)
      setNotice(
        `已新建 ${result.createTypeCount} 张表、补 ${result.addFieldCount} 个字段（未生成任何数据行）`
      )
      // 类型变了：让上层重新拉 schema，否则数据编辑器还拿旧字段
      onTypesChanged?.(await window.mbApi.schema.list())
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 有「未建表 / 缺字段」才值得补齐；条数不足是数据问题，建表解决不了 */
  const fixable = check !== null && check.issues.some((issue) => issue.kind === 'missing_table' || issue.kind === 'missing_field')

  return (
    <div className="machine-panel" data-testid="machine-panel">
      <div className="machine-note">验收 / 机读数据（不计入完成度）。导出机读包请用「导出」。</div>

      <section className="datatable-check" data-testid="datatable-check">
        <div className="datatable-check-head">
          <span className="datatable-check-title">设计 ↔ 数据表核对</span>
          <button
            type="button"
            className="btn slim"
            data-testid="datatable-check-run"
            disabled={busy}
            onClick={() => void runCheck()}
          >
            {busy ? '核对中…' : '核对数据表'}
          </button>
        </div>
        <div className="form-hint">
          依据「{CHAPTER_LABELS.tech}」章的「所需数据表」声明，比对数据编辑器里的实际条数与字段。
        </div>

        {error !== null && (
          <div className="error-banner" data-testid="datatable-check-error">
            {error}
          </div>
        )}

        {check !== null && (
          <div data-testid="datatable-check-result">
            {check.requirements.length === 0 ? (
              <div className="form-hint" data-testid="datatable-check-none">
                还没有声明任何数据表。在「{CHAPTER_LABELS.tech}」章的「所需数据表」里按
                「表名|用途|关键字段|期望条数」写几行，再回来核对。
              </div>
            ) : check.ok ? (
              <div className="notice-banner inline" data-testid="datatable-check-ok">
                声明的 {check.requirements.length} 张表全部对得上（条数与关键字段一致）。
              </div>
            ) : (
              <ul className="datatable-issues" data-testid="datatable-issues">
                {check.issues.map((issue) => (
                  <li
                    key={`${issue.kind}-${issue.table}-${issue.message}`}
                    className={`datatable-issue ${issue.level}`}
                    data-testid={`datatable-issue-${issue.kind}`}
                  >
                  <span className="datatable-issue-tag">{issue.level === 'error' ? '不符' : '注意'}</span>
                  {issue.message}
                  {(issue.kind === 'count_short' || issue.kind === 'empty_table') &&
                    issue.typeId !== undefined &&
                    onGenerateData !== undefined && (
                      <button
                        type="button"
                        className="btn slim datatable-fill-btn"
                        data-testid="datatable-ai-fill"
                        disabled={busy}
                        onClick={() =>
                          onGenerateData({
                            typeId: issue.typeId as string,
                            count: Math.min(
                              Math.max(issue.gap ?? DATA_GEN_MAX_COUNT, DATA_GEN_MIN_COUNT),
                              DATA_GEN_MAX_COUNT
                            ),
                            instruction: buildFillInstruction(issue)
                          })
                        }
                      >
                        AI 生成缺失数据{issue.gap !== undefined ? `（缺 ${issue.gap} 条）` : ''}
                      </button>
                    )}
                </li>
                ))}
              </ul>
            )}

            {notice !== null && (
              <div className="notice-banner inline" data-testid="datatable-scaffold-notice">
                {notice}
              </div>
            )}

            {fixable &&
              (plan === null ? (
                <div className="datatable-scaffold-actions">
                  <button
                    type="button"
                    className="btn"
                    data-testid="datatable-scaffold-plan"
                    disabled={busy}
                    onClick={() => void previewScaffold()}
                  >
                    按声明补齐结构
                  </button>
                  <span className="form-hint">只建表/加字段，不生成数据行</span>
                </div>
              ) : (
                <div className="datatable-scaffold-plan" data-testid="datatable-scaffold-preview">
                  <div className="form-hint">
                    将要新建 {plan.createTypeCount} 张表、补 {plan.addFieldCount} 个字段：
                  </div>
                  <ul className="datatable-issues">
                    {plan.tables.map((table) => (
                      <li key={table.declaredName} className="datatable-plan-row">
                        <div className="datatable-plan-head">
                          <span className={`import-tag ${table.action === 'create_type' ? 'create' : 'update'}`}>
                            {table.action === 'create_type' ? '新建表' : table.action === 'add_fields' ? '补字段' : '跳过'}
                          </span>
                          <span className="datatable-plan-name">{table.targetTypeName}</span>
                          <span className="item-meta">{table.note}</span>
                        </div>
                        {table.fields.length > 0 && (
                          <ul className="import-change-list">
                            {table.fields.map((field) => (
                              <li key={field.name} className="import-change">
                                <span className="import-change-field">{field.label}</span>
                                <span className="item-meta">
                                  {field.name} · {field.type}
                                </span>
                                <span className="item-meta">（{field.reason}）</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className="datatable-scaffold-actions">
                    <button
                      type="button"
                      className="btn primary"
                      data-testid="datatable-scaffold-apply"
                      disabled={busy}
                      onClick={() => void applyScaffold()}
                    >
                      {busy ? '执行中…' : '确认执行'}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-testid="datatable-scaffold-cancel"
                      disabled={busy}
                      onClick={() => setPlan(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="contract-check" data-testid="contract-check">
        <div className="datatable-check-head">
          <span className="datatable-check-title">设计契约体检</span>
          <button
            type="button"
            className="btn slim"
            data-testid="contract-check-run"
            disabled={busy}
            onClick={() => void runContractCheck()}
          >
            {busy ? '体检中…' : '体检契约'}
          </button>
        </div>
        <div className="form-hint">
          把数值断言、原型验收、验收旅程、账本对账投影成一份机读契约，检查它们作为整体是否成立
          （并把「规则集标识」显出来，用于和原型 Demo 证明引用同一套规则）。
        </div>

        {contract !== null && (
          <div data-testid="contract-check-result">
            <div className="notice-banner inline" data-testid="contract-check-verdict">
              {contract.passed ? '契约成立（PASS）' : `契约有问题（FAIL：${contract.errorCount} 条错误）`}
              {contract.warningCount > 0 ? `，另有 ${contract.warningCount} 条提醒` : ''}
              <span className="item-meta"> · 规则集 {contract.contract.rulesetId || '（未设置）'}</span>
            </div>

            {contract.findings.length === 0 ? (
              <div className="form-hint" data-testid="contract-check-clean">
                参数、断言、原型验收、旅程、账本全部自洽。
              </div>
            ) : (
              <ul className="datatable-issues" data-testid="contract-findings">
                {contract.findings.map((finding, index) => (
                  <li
                    key={`${finding.code}-${index}`}
                    className={`datatable-issue ${finding.level}`}
                    data-testid={`contract-finding-${finding.level}`}
                  >
                    <span className="datatable-issue-tag">{finding.level === 'error' ? '错误' : '提醒'}</span>
                    {finding.message}
                  </li>
                ))}
              </ul>
            )}

            <div className="form-hint" data-testid="contract-summary">
              契约摘要：{contract.contract.parameters.length} 个参数 · {contract.contract.assertions.length} 条断言 ·
              原型 {contract.contract.prototype.checks.length} 项验收 · {contract.contract.journeys.length} 条旅程 ·
              {contract.contract.testCases.length} 条用例
            </div>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <div className="artifact-placeholder" data-testid="machine-empty">
          <p>当前档位/品类下没有机读数据字段。</p>
        </div>
      ) : (
        <ul className="machine-list">
          {rows.map((row) => (
            <li
              key={`${row.chapter}.${row.field}`}
              className="machine-item"
              data-testid={`machine-${row.chapter}-${row.field}`}
            >
              <div className="machine-item-head">
                <span className="machine-chapter">{CHAPTER_LABELS[row.chapter]}</span>
                <span className="machine-label">{row.label}</span>
              </div>
              <div className={`machine-value${row.filled ? '' : ' empty'}`}>
                {row.filled ? row.value : '（未填）'}
              </div>
              <div className="machine-reason">{row.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
