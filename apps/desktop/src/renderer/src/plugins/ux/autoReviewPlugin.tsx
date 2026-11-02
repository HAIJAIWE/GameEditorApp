import { useEffect, useState, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 执行预审（#27，对齐 dsh experimental auto-review 的 LLM 判读版）。
 *
 * 渲染进程插件：一个开关面板。开关经 `window.mbApi.agent.setPreReviewEnabled` 控制**主进程侧**
 * 的预审开关；主进程在 `AgentBrainService.chat()` 里用本次生效的 LLM 传输层构造预审 provider
 * （详见 `main/agent/agentService/preReview.ts`）。语义与 dsh Auto 一致：
 * - 高危工具（静态风险 ≥ SYSTEM）执行前由当前模型判读；
 * - `allow` ⇒ 直接执行（顶替人工审批）；`deny` ⇒ ask 转人工 / never 终局；失败 ⇒ fail-closed 拒绝。
 *
 * 同时以 `service` 能力暴露 `{ isEnabled, enable, disable }`，供其它代码查询/切换。
 */
export function defineAutoReviewPlugin(_host: PluginHost): PluginManifest {
  registerReactBinding('autoReview.panel', (props: PanelBindingProps) => <AutoReviewPanel {...props} />)
  return {
    id: 'auto-review',
    name: 'auto-review',
    version: '0.1.0',
    description: 'Pre-execution review: the current model judges risk before a tool runs (allow runs directly / deny goes to manual or outright reject)',
    meta: {
      labelKey: 'agent.autoReview.metaLabel',
      icon: 'shield',
      descriptionKey: 'agent.autoReview.metaDescription'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'autoReview.open',
        label: 'Pre-execution review',
        labelKey: 'agent.autoReview.metaLabel',
        run: () => _host.openPanel('autoReview.panel')
      },
      {
        kind: 'sidebar',
        id: 'autoReview.sidebar',
        order: 920,
        items: [{ key: 'auto-review', labelKey: 'nav.autoReview', icon: 'shield', command: 'autoReview.open' }]
      },
      {
        kind: 'panel',
        id: 'autoReview.panel',
        title: 'Pre-execution review',
        titleKey: 'agent.autoReview.metaLabel',
        ui: { type: 'text', text: translate(getLocalePreference(), 'agent.autoReview.metaLabel') }
      },
      {
        // 暴露给其它代码的查询/切换接口（与开关面板同源）
        kind: 'service',
        id: 'agent.review',
        invoke: (input?: unknown): unknown => {
          const action = typeof input === 'object' && input !== null ? (input as { action?: unknown }).action : undefined
          if (action === 'isEnabled') return reviewEnabled
          if (action === 'enable') {
            reviewEnabled = true
            void window.mbApi.agent.setPreReviewEnabled({ enabled: true })
            return true
          }
          if (action === 'disable') {
            reviewEnabled = false
            void window.mbApi.agent.setPreReviewEnabled({ enabled: false })
            return true
          }
          return false
        }
      }
    ]
  }
}

// 模块级镜像：service 与面板共享同一份开关状态（面板卸载不丢状态）
let reviewEnabled = false

function AutoReviewPanel(props: PanelBindingProps): ReactElement {
  const { onClose } = props
  const [enabled, setEnabled] = useState(reviewEnabled)
  const [synced, setSynced] = useState(false)
  const t = useT()

  // 打开面板时从主进程同步真实状态（避免与其它入口不一致）
  useEffect(() => {
    let cancelled = false
    void window.mbApi.agent
      .getPreReviewEnabled()
      .then((res) => {
        if (cancelled) return
        reviewEnabled = res.enabled
        setEnabled(res.enabled)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSynced(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = async (next: boolean): Promise<void> => {
    reviewEnabled = next
    setEnabled(next)
    try {
      await window.mbApi.agent.setPreReviewEnabled({ enabled: next })
    } catch {
      // 开关写入失败静默（面板状态已本地切换；下次打开面板会重新同步）
    }
  }

  return (
    <div className="panel auto-review">
      <div className="panel-header">
        <h3>{t('agent.autoReview.metaLabel')}</h3>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      <div className="auto-review-toggle">
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!synced}
            onChange={(event) => void toggle(event.target.checked)}
          />
          <span>{t('agent.autoReview.enable')}</span>
        </label>
        <span className={`auto-review-status ${enabled ? 'on' : 'off'}`}>
          {enabled ? t('agent.autoReview.on') : t('agent.autoReview.off')}
        </span>
      </div>

      <p className="auto-review-hint">{t('agent.autoReview.hintLead')}</p>
      <ul className="auto-review-hint">
        <li>{t('agent.autoReview.ruleAllow')}</li>
        <li>{t('agent.autoReview.ruleDeny')}</li>
        <li>{t('agent.autoReview.ruleFail')}</li>
      </ul>
      <p className="auto-review-hint">{t('agent.autoReview.hintFooter')}</p>
    </div>
  )
}
