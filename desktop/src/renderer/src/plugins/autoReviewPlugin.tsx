import { useEffect, useState, type ReactElement } from 'react'

import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import { registerReactBinding, type PanelBindingProps } from './reactBindings'

/**
 * 执行预审（#27，对齐 dsh auto-review / 执行前审查）。
 *
 * 渲染进程插件：一个开关面板。开关经 `window.mbApi.agent.setPreReviewEnabled` 控制**主进程侧**
 * 的预审 provider（详见 `main/agent/agentService/preReview.ts`）。主进程在 `agent:chat` 处理时，
 * 若开关打开即装配确定性预审：风险等级 ≥ SYSTEM 的高危操作被模型/规则先拦一道（[STOP]，不再走人工）；
 * 其余放行至人工审批。人类始终是最终闸。
 *
 * 同时以 `service` 能力暴露 `{ isEnabled, enable, disable }`，供其它代码查询/切换。
 */
export function defineAutoReviewPlugin(_host: PluginHost): PluginManifest {
  registerReactBinding('autoReview.panel', (props: PanelBindingProps) => <AutoReviewPanel {...props} />)
  return {
    id: 'auto-review',
    name: 'auto-review',
    version: '0.1.0',
    description: '执行预审：工具执行前由模型/规则做风险预审（高危操作先拦一道）',
    meta: {
      label: '执行预审',
      icon: '🛡️',
      description: '工具执行前的模型/规则风险预审开关'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'autoReview.open',
        label: '执行预审',
        run: () => _host.openPanel('autoReview.panel')
      },
      {
        kind: 'sidebar',
        id: 'autoReview.sidebar',
        order: 920,
        items: [{ key: 'auto-review', label: '执行预审', icon: '🛡️', command: 'autoReview.open' }]
      },
      {
        kind: 'panel',
        id: 'autoReview.panel',
        title: '执行预审',
        ui: { type: 'text', text: '执行预审' }
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
        <h3>执行预审</h3>
        <button type="button" className="btn" onClick={onClose}>
          关闭
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
          <span>启用执行预审</span>
        </label>
        <span className={`auto-review-status ${enabled ? 'on' : 'off'}`}>{enabled ? '已开启' : '已关闭'}</span>
      </div>

      <p className="auto-review-hint">
        开启后，工具执行前会先由模型/规则做一轮风险预审：<b>风险等级为 SYSTEM 的高危操作</b>
        （如 shell / code / scheduler）会被直接拦截（不再走人工审批）；其余操作放行至人工审批。
        预审只能收紧、不会放宽——人类始终是最终闸。
      </p>
      <p className="auto-review-hint">
        当前实现为确定性启发式（离线、零延迟）。后续可升级为「LLM 判读参数意图」的 provider，
        接口不变、循环无需改动。
      </p>
    </div>
  )
}
