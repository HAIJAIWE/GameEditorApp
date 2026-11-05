import { useEffect, useState, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import type { RecentChangeView } from '@mobai/shared/agent/observability'
import { DigitalChangeList } from '../../components/digital'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 「最近改动」面板（dsh deliverables 的本土对应物）。
 *
 * dsh 的 deliverables 是「workspace 文件 diff 卡」；本仓库的数据在 **SQLite**、会话在 JSONL，
 * 文件 diff 语义对不上。真正记录「智能体改了什么数据」的是**操作日志**（`OperationLogStore`，
 * 内存态、按会话，供会话级回滚）。本面板读它，展示最近的数据变更（新建/修改/删除）。
 *
 * 全程只读；数据经 IPC `agent:recentChanges` 从主进程取。
 */
export function defineRecentChangesPlugin(_host: PluginHost): PluginManifest {
  registerReactBinding('recentChanges.panel', (props: PanelBindingProps) => <RecentChangesPanel {...props} />)
  return {
    id: 'recent-changes',
    name: 'recent-changes',
    version: '0.1.0',
    description: 'Recent changes: data the agent modified (from the operation log)',
    meta: {
      label: 'Recent changes',
      labelKey: 'plugin.recentChanges.label',
      icon: 'pencil',
      description: 'Recent data changes made by the agent (from the operation log)',
      descriptionKey: 'plugin.recentChanges.desc'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'recentChanges.open',
        label: 'Recent changes',
        labelKey: 'plugin.recentChanges.label',
        run: () => _host.openPanel('recentChanges.panel')
      },
      {
        kind: 'sidebar',
        id: 'recentChanges.sidebar',
        order: 930,
        items: [{ key: 'recent-changes', labelKey: 'nav.recentChanges', icon: 'pencil', command: 'recentChanges.open' }]
      },
      {
        kind: 'panel',
        id: 'recentChanges.panel',
        title: 'Recent changes',
        titleKey: 'plugin.recentChanges.label',
        ui: { type: 'text', text: 'Recent changes' }
      }
    ]
  }
}

function RecentChangesPanel({ onClose }: PanelBindingProps): ReactElement {
  const t = useT()
  const [changes, setChanges] = useState<RecentChangeView[]>([])
  // 首次挂载即加载，故 loading 初值为 true；`load` 的 setState 都在 await 之后（避免 effect 内同步 setState）
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 首次加载：effect 内先 await 再 setState（避免 effect 内同步 setState 触发级联渲染）
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await window.mbApi.agent.recentChanges({ limit: 100 })
        if (cancelled) return
        setChanges(res.changes)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = (): void => {
    setLoading(true)
    void (async () => {
      try {
        const res = await window.mbApi.agent.recentChanges({ limit: 100 })
        setChanges(res.changes)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    })()
  }

  return (
    <div className="panel recent-changes">
      <div className="panel-header">
        <h3>{t('plugin.recentChanges.label')}</h3>
        <div className="recent-changes-actions">
          <button type="button" className="btn" disabled={loading} onClick={refresh}>
            {loading ? t('recentChanges.refreshing') : t('recentChanges.refresh')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      {error !== null && (
        <p className="recent-changes-error">{t('recentChanges.readFailed', { error })}</p>
      )}
      {/* 行渲染统一在 DigitalChangeList（与对话内联改动卡共用），此处只负责取数与刷新 */}
      <DigitalChangeList changes={changes} loading={loading} />
    </div>
  )
}
