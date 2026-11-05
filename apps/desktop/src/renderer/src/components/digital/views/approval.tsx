import { useT } from '@mobai/client-ui'
import { LucideIcon } from '../../common'
import { JsonTree } from './JsonTree'
import { RISK_LEVEL, resolveRiskLevel } from '@mobai/shared/agent/config'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
import type { MessageKey } from '@mobai/shared/i18n'

/** 风险等级 → 中文档位（审批卡展示用） */
const RISK_LABEL_KEYS: Record<number, MessageKey> = {
  [RISK_LEVEL.READ_ONLY]: 'agent.risk.readonly',
  [RISK_LEVEL.DATA_WRITE]: 'agent.risk.dataWrite',
  [RISK_LEVEL.FILE_SYSTEM]: 'agent.risk.fileSystem',
  [RISK_LEVEL.NETWORK]: 'agent.risk.network',
  [RISK_LEVEL.SYSTEM]: 'agent.risk.system'
}

/** 危险操作审批模态：展示工具 / 操作 / 参数，回传「允许 / 拒绝」决定 */
export function DigitalApproval({
  approval,
  onApprove
}: {
  approval: NonNullable<DigitalPanelState['approval']>
  onApprove: (approved: boolean) => void
}) {
  const t = useT()
  const risk = resolveRiskLevel(approval.tool, approval.action)
  const riskTone =
    risk >= RISK_LEVEL.SYSTEM ? 'danger' : risk >= RISK_LEVEL.NETWORK ? 'warn' : 'muted'
  return (
    <div className="digital-approval" data-testid="digital-approval">
      <div className="digital-approval-head">
        <span className="form-label"><LucideIcon name="alert-triangle" size={14} /> {t('agent.approval.title')}</span>
        <span className={`digital-risk-badge digital-risk-${riskTone}`} data-testid="digital-approval-risk">
          {t('agent.approval.risk', { label: t(RISK_LABEL_KEYS[risk] ?? 'agent.risk.system') })}
        </span>
      </div>
      <div className="item-meta">
        {t('agent.approval.tool', { tool: approval.tool, action: approval.action || t('agent.interaction.unspecified') })}
      </div>
      <details className="digital-approval-details" open>
        <summary className="item-meta">{t('agent.approval.params')}</summary>
        <JsonTree value={approval.params} rawClassName="digital-approval-params" />
      </details>
      <div className="item-meta">{t('agent.approval.note')}</div>
      <div className="editor-actions">
        <button
          type="button"
          className="btn danger"
          data-testid="digital-approval-approve"
          onClick={() => onApprove(true)}
        >
          {t('agent.approval.allow')}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="digital-approval-reject"
          onClick={() => onApprove(false)}
        >
          {t('agent.approval.reject')}
        </button>
      </div>
    </div>
  )
}
