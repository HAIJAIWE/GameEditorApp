import { LucideIcon } from '../../common'
import { RISK_LEVEL, resolveRiskLevel } from '@mobai/shared/agent/config'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'

/** 风险等级 → 中文档位（审批卡展示用） */
const RISK_LABELS: Record<number, string> = {
  [RISK_LEVEL.READ_ONLY]: '只读',
  [RISK_LEVEL.DATA_WRITE]: '写数据',
  [RISK_LEVEL.FILE_SYSTEM]: '文件系统',
  [RISK_LEVEL.NETWORK]: '网络',
  [RISK_LEVEL.SYSTEM]: '系统级'
}

/** 危险操作审批模态：展示工具 / 操作 / 参数，回传「允许 / 拒绝」决定 */
export function DigitalApproval({
  approval,
  onApprove
}: {
  approval: NonNullable<DigitalPanelState['approval']>
  onApprove: (approved: boolean) => void
}) {
  const risk = resolveRiskLevel(approval.tool, approval.action)
  const riskTone =
    risk >= RISK_LEVEL.SYSTEM ? 'danger' : risk >= RISK_LEVEL.NETWORK ? 'warn' : 'muted'
  return (
    <div className="digital-approval" data-testid="digital-approval">
      <div className="digital-approval-head">
        <span className="form-label"><LucideIcon name="alert-triangle" size={14} /> 危险操作确认</span>
        <span className={`digital-risk-badge digital-risk-${riskTone}`} data-testid="digital-approval-risk">
          风险：{RISK_LABELS[risk] ?? '未知'}
        </span>
      </div>
      <div className="item-meta">
        工具：{approval.tool} · 操作：{approval.action || '(未指定)'}
      </div>
      <details className="digital-approval-details" open>
        <summary className="item-meta">参数</summary>
        <pre className="digital-approval-params">{JSON.stringify(approval.params, null, 2)}</pre>
      </details>
      <div className="item-meta">批准后执行；拒绝会把「未确认」回灌给模型，让它换方案。</div>
      <div className="editor-actions">
        <button
          type="button"
          className="btn danger"
          data-testid="digital-approval-approve"
          onClick={() => onApprove(true)}
        >
          允许执行
        </button>
        <button
          type="button"
          className="btn"
          data-testid="digital-approval-reject"
          onClick={() => onApprove(false)}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}
