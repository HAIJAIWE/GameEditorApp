import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { CHAPTER_LABELS, type CeshuDocument } from '@mobai/shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS } from '@mobai/shared/ceshu/fields'
import { displayFieldValue } from '@mobai/shared/ceshu/fields'
import { visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { CESHU_MACHINE_DATA_FIELDS } from '@mobai/shared/ceshu/workflow'
import type { DataTableCheckResult } from '@mobai/shared/ceshu/data'
import type { ContractReport } from '@mobai/shared/ceshu/validation'
import { DATA_GEN_MAX_COUNT, DATA_GEN_MIN_COUNT, buildDataFillInstruction } from '@mobai/shared/ceshu/data'
import type { ScaffoldPlan } from '@mobai/shared/ceshu/data'
import type { DataTypeDef } from '@mobai/shared/types'
import { toErrorMessage } from '@mobai/shared/util/system'

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
  const t = useT()
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
        t('machine.scaffoldApplied', { create: result.createTypeCount, fields: result.addFieldCount })
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
      <div className="machine-note">{t('machine.note')}</div>

      <section className="datatable-check" data-testid="datatable-check">
        <div className="datatable-check-head">
          <span className="datatable-check-title">{t('machine.checkTitle')}</span>
          <button
            type="button"
            className="btn slim"
            data-testid="datatable-check-run"
            disabled={busy}
            onClick={() => void runCheck()}
          >
            {busy ? t('machine.checking') : t('machine.check')}
          </button>
        </div>
        <div className="form-hint">{t('machine.checkHint', { section: CHAPTER_LABELS.tech })}</div>

        {error !== null && (
          <div className="error-banner" data-testid="datatable-check-error">
            {error}
          </div>
        )}

        {check !== null && (
          <div data-testid="datatable-check-result">
            {check.requirements.length === 0 ? (
              <div className="form-hint" data-testid="datatable-check-none">
                {t('machine.checkNone', { section: CHAPTER_LABELS.tech })}
              </div>
            ) : check.ok ? (
              <div className="notice-banner inline" data-testid="datatable-check-ok">
                {t('machine.checkOk', { n: check.requirements.length })}
              </div>
            ) : (
              <ul className="datatable-issues" data-testid="datatable-issues">
                {check.issues.map((issue) => (
                  <li
                    key={`${issue.kind}-${issue.table}-${issue.message}`}
                    className={`datatable-issue ${issue.level}`}
                    data-testid={`datatable-issue-${issue.kind}`}
                  >
                  <span className="datatable-issue-tag">{issue.level === 'error' ? t('machine.levelError') : t('machine.levelWarn')}</span>
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
                            instruction: buildDataFillInstruction(issue)
                          })
                        }
                      >
                        {issue.gap !== undefined ? t('machine.aiFillWithGap', { n: issue.gap }) : t('machine.aiFill')}
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
                    {t('machine.scaffoldPlan')}
                  </button>
                  <span className="form-hint">{t('machine.scaffoldHint')}</span>
                </div>
              ) : (
                <div className="datatable-scaffold-plan" data-testid="datatable-scaffold-preview">
                  <div className="form-hint">
                    {t('machine.scaffoldPreview', { create: plan.createTypeCount, fields: plan.addFieldCount })}
                  </div>
                  <ul className="datatable-issues">
                    {plan.tables.map((table) => (
                      <li key={table.declaredName} className="datatable-plan-row">
                        <div className="datatable-plan-head">
                          <span className={`import-tag ${table.action === 'create_type' ? 'create' : 'update'}`}>
                            {table.action === 'create_type' ? t('machine.actionCreate') : table.action === 'add_fields' ? t('machine.actionAddFields') : t('machine.actionSkip')}
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
                                <span className="item-meta">{t('machine.fieldReason', { reason: field.reason })}</span>
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
                      {busy ? t('machine.applying') : t('machine.apply')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-testid="datatable-scaffold-cancel"
                      disabled={busy}
                      onClick={() => setPlan(null)}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="contract-check" data-testid="contract-check">
        <div className="datatable-check-head">
          <span className="datatable-check-title">{t('machine.contractTitle')}</span>
          <button
            type="button"
            className="btn slim"
            data-testid="contract-check-run"
            disabled={busy}
            onClick={() => void runContractCheck()}
          >
            {busy ? t('machine.contractChecking') : t('machine.contractCheck')}
          </button>
        </div>
        <div className="form-hint">{t('machine.contractHint')}</div>

        {contract !== null && (
          <div data-testid="contract-check-result">
            <div className="notice-banner inline" data-testid="contract-check-verdict">
              {contract.passed ? t('machine.contractPassed') : t('machine.contractFailed', { n: contract.errorCount })}
              {contract.warningCount > 0 ? t('machine.contractWarnings', { n: contract.warningCount }) : ''}
              <span className="item-meta">
                {t('machine.ruleset', { id: contract.contract.rulesetId || t('machine.rulesetUnset') })}
              </span>
            </div>

            {contract.findings.length === 0 ? (
              <div className="form-hint" data-testid="contract-check-clean">
                {t('machine.contractClean')}
              </div>
            ) : (
              <ul className="datatable-issues" data-testid="contract-findings">
                {contract.findings.map((finding, index) => (
                  <li
                    key={`${finding.code}-${index}`}
                    className={`datatable-issue ${finding.level}`}
                    data-testid={`contract-finding-${finding.level}`}
                  >
                    <span className="datatable-issue-tag">{finding.level === 'error' ? t('machine.findingError') : t('machine.findingWarn')}</span>
                    {finding.message}
                  </li>
                ))}
              </ul>
            )}

            <div className="form-hint" data-testid="contract-summary">
              {t('machine.contractSummary', {
                params: contract.contract.parameters.length,
                assertions: contract.contract.assertions.length,
                checks: contract.contract.prototype.checks.length,
                journeys: contract.contract.journeys.length,
                cases: contract.contract.testCases.length
              })}
            </div>
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <div className="artifact-placeholder" data-testid="machine-empty">
          <p>{t('machine.empty')}</p>
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
                {row.filled ? row.value : t('machine.unfilled')}
              </div>
              <div className="machine-reason">{row.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
