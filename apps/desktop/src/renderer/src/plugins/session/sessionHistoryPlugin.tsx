import { useEffect, useState, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import { translate } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { PanelShell, StateView } from '../../components/common'
import { registerReactBinding } from '../host'

/**
 * 会话历史检索（#25，对齐 dsh session-search）。
 *
 * 渲染进程插件：经 `window.mbApi.agent` 调用 `sessionTurns`（聚合 turns.jsonl）与 `draftList`
 * （既有草稿），提供搜索框过滤 + 点击草稿只读回看。零新 IPC 之外的依赖——只用既有 agent IPC。
 *
 * 与「插件市场」同构：`command` + `sidebar` + `panel` 三件套，富 UI 外置为 reactBinding。
 *
 * 外壳（Phase A）：窗口标题与关闭由 `AppPanelOverlay` 提供，本组件不再自己画 `panel-header`
 * 与关闭按钮；正文统一走 `PanelShell` + `StateView`，并**修掉原先 `catch {}` 的静默降级**
 * —— 读失败现在显示错误态与「重试」，而不是伪装成「没有数据」。
 */
export function defineSessionHistoryPlugin(_host: PluginHost): PluginManifest {
  registerReactBinding('sessionHistory.panel', () => <SessionHistoryPanel />)
  return {
    id: 'session-history',
    name: 'session-history',
    version: '0.1.0',
    description: 'Session history search: list sessions/drafts, search by content, review drafts read-only',
    meta: {
      labelKey: 'nav.sessionHistory',
      icon: 'clock',
      descriptionKey: 'sessionHistory.metaDescription'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'sessionHistory.open',
        label: 'Session history',
        labelKey: 'nav.sessionHistory',
        run: () => _host.openPanel('sessionHistory.panel')
      },
      {
        kind: 'sidebar',
        id: 'sessionHistory.sidebar',
        order: 910,
        items: [{ key: 'session-history', labelKey: 'nav.sessionHistory', icon: 'clock', command: 'sessionHistory.open' }]
      },
      {
        kind: 'panel',
        id: 'sessionHistory.panel',
        title: 'Session history',
        titleKey: 'nav.sessionHistory',
        ui: { type: 'text', text: translate(getLocalePreference(), 'nav.sessionHistory') }
      }
    ]
  }
}

interface DraftItem {
  name: string
  time: string
  messageCount: number
  path: string
}

interface SessionItem {
  sessionId: string
  title: string
  firstMessage: string
  messageCount: number
  turnCount: number
  lastActivity: number
}

function SessionHistoryPanel(): ReactElement {
  const t = useT()
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [detail, setDetail] = useState<{ name: string; messages: Array<Record<string, unknown>> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 重试计数：自增即触发 effect 重新拉取（比把 load 提成 useCallback 更少改动） */
  const [reloadKey, setReloadKey] = useState(0)

  // 拉会话历史（服务端按 query 过滤）与草稿列表
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const [turnsRes, draftRes] = await Promise.all([
          window.mbApi.agent.sessionTurns({ query: query || undefined }),
          window.mbApi.agent.draftList()
        ])
        if (cancelled) return
        setSessions(turnsRes.sessions as SessionItem[])
        // 草稿按名称过滤（客户端，名称不含首消息体）
        const q = query.trim().toLowerCase()
        setDrafts((draftRes as DraftItem[]).filter((d) => q === '' || d.name.toLowerCase().includes(q)))
      } catch (err) {
        // 不再静默：读失败必须让用户看见，否则会被误读成「没有历史」
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [query, reloadKey])

  const openDraft = async (path: string, name: string): Promise<void> => {
    try {
      const res = await window.mbApi.agent.draftLoad({ path })
      setDetail({ name, messages: res.messages as Array<Record<string, unknown>> })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const isEmpty = sessions.length === 0 && drafts.length === 0

  return (
    <PanelShell
      testId="session-history-panel"
      toolbar={
        <div className="session-history-search">
          <input
            type="search"
            placeholder={t('sessionHistory.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {loading && <span className="session-history-loading">{t('common.loading')}</span>}
        </div>
      }
    >
      {error !== null ? (
        <StateView
          kind="error"
          description={error}
          action={
            <button type="button" className="btn" onClick={() => setReloadKey((key) => key + 1)}>
              {t('common.retry')}
            </button>
          }
        />
      ) : loading && isEmpty ? (
        <StateView kind="loading" />
      ) : isEmpty ? (
        <StateView kind="empty" />
      ) : (
        <>
          <section>
            <h4>{t('sessionHistory.sessionsHead', { n: sessions.length })}</h4>
            {sessions.length === 0 ? (
              <StateView kind="empty" title={t('sessionHistory.noSessions')} />
            ) : (
              <ul className="session-history-list">
                {sessions.map((s) => (
                  <li key={s.sessionId} className="session-history-item">
                    <span className="session-history-title">{s.title}</span>
                    <span className="session-history-meta">
                      {t('sessionHistory.sessionMeta', {
                        messages: s.messageCount,
                        turns: s.turnCount,
                        time: formatActivity(s.lastActivity)
                      })}
                    </span>
                    <span className="session-history-snippet">{s.firstMessage.slice(0, 80)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>{t('sessionHistory.draftsHead', { n: drafts.length })}</h4>
            {drafts.length === 0 ? (
              <StateView kind="empty" title={t('sessionHistory.noDrafts')} />
            ) : (
              <ul className="session-history-list">
                {drafts.map((d) => (
                  <li key={d.path} className="session-history-item session-history-draft">
                    <button type="button" className="btn-link" onClick={() => void openDraft(d.path, d.name)}>
                      {d.name}
                    </button>
                    <span className="session-history-meta">
                      {t('sessionHistory.draftMeta', { time: d.time, messages: d.messageCount })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail && (
            <section className="session-history-detail">
              <h4>{t('sessionHistory.detailHead', { name: detail.name })}</h4>
              <button type="button" className="btn" onClick={() => setDetail(null)}>
                {t('sessionHistory.collapse')}
              </button>
              <ol className="session-history-messages">
                {detail.messages.map((message, index) => (
                  <li key={index}>
                    <span className="session-history-role">[{String(message.role)}]</span>{' '}
                    {typeof message.content === 'string' ? message.content.slice(0, 300) : JSON.stringify(message.content)}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </PanelShell>
  )
}

function formatActivity(timestamp: number): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
