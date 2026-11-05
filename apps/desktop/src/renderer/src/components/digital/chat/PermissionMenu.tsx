import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import type { MessageKey } from '@mobai/shared/i18n'
import type { PermissionMode } from '@mobai/shared/agent/config'

import { LucideIcon } from '../../common'

/**
 * 权限档位下拉（对齐 dsh permission-presets 的 read-only / ask / full）。
 *
 * 选中经 IPC 落盘 + 灌进主进程共享持有者（`permissionPolicyHolder`），
 * 调度器硬上限与循环确认门实时读它 —— 运行中切换即生效，无需重建 store / 重开会话。
 *
 * 组件自管开合与「点外部 / Esc 关闭」；初始档位来自主进程持久化值（userData 落盘）。
 */
const MODE_ITEMS: ReadonlyArray<{ mode: PermissionMode; label: MessageKey; desc: MessageKey }> = [
  { mode: 'readOnly', label: 'agent.permission.readOnly', desc: 'agent.permission.readOnlyDesc' },
  { mode: 'ask', label: 'agent.permission.ask', desc: 'agent.permission.askDesc' },
  { mode: 'full', label: 'agent.permission.full', desc: 'agent.permission.fullDesc' }
]

export function PermissionMenu(): ReactElement {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<PermissionMode>('full')
  /** 切到「完全访问」前的风险确认视图（提权不该点一下就生效） */
  const [confirming, setConfirming] = useState(false)
  const [acked, setAcked] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // 挂载即拉当前档位（主进程已从 userData 灌入共享持有者）
  useEffect(() => {
    let alive = true
    void window.mbApi.agent
      .getPermissionMode()
      .then((res) => {
        if (alive) setMode(res.mode)
      })
      .catch(() => {
        /* 拉取失败回落默认 full（与持有者默认值一致） */
      })
    return () => {
      alive = false
    }
  }, [])

  const close = useCallback((): void => {
    setOpen(false)
    setConfirming(false)
    setAcked(false)
  }, [])

  // 点外部 / Esc 关闭（自管，不依赖面板的统一 document 监听）
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  /** 真正落盘并切换（确认视图通过后才走到这里） */
  const apply = useCallback(async (next: PermissionMode): Promise<void> => {
    setMode(next)
    setOpen(false)
    setConfirming(false)
    setAcked(false)
    try {
      await window.mbApi.agent.setPermissionMode({ mode: next })
    } catch {
      /* IPC 失败保留 UI 态；下次打开会重新拉取主进程真实值 */
    }
  }, [])

  const choose = useCallback(
    (next: PermissionMode): void => {
      // 提权到「完全」要过风险确认；其余档位（含降级）直接生效
      if (next === 'full' && mode !== 'full') {
        setConfirming(true)
        setAcked(false)
        return
      }
      void apply(next)
    },
    [apply, mode]
  )

  const currentLabel = MODE_ITEMS.find((item) => item.mode === mode)?.label ?? 'agent.permission.full'

  return (
    <div className="dsh-composer-picker" ref={ref}>
      <button
        type="button"
        className="dsh-composer-chip dsh-composer-chip-button"
        data-testid="digital-permission-menu"
        title={t('agent.permission.menuTitle')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) close()
          else setOpen(true)
        }}
      >
        <span className="dsh-composer-chip-label">
          {t('agent.permission.chip', { mode: t(currentLabel) })}
        </span>
        <LucideIcon name="chevron-down" size={12} />
      </button>
      {open && (
        <div
          className="dsh-composer-menu dsh-composer-menu-wide"
          role={confirming ? 'dialog' : 'menu'}
          aria-label={confirming ? t('agent.permission.riskTitle') : undefined}
          data-testid="digital-permission-list"
          data-confirming={confirming ? 'true' : 'false'}
        >
          {confirming ? (
            <div className="dsh-permission-risk" data-testid="digital-permission-risk">
              <p className="dsh-permission-risk-title">{t('agent.permission.riskTitle')}</p>
              <p className="dsh-permission-risk-body">{t('agent.permission.riskBody')}</p>
              <label className="dsh-permission-risk-ack">
                <input
                  type="checkbox"
                  checked={acked}
                  data-testid="digital-permission-ack"
                  onChange={(event) => setAcked(event.target.checked)}
                />
                <span>{t('agent.permission.riskAck')}</span>
              </label>
              <div className="dsh-permission-risk-actions">
                <button
                  type="button"
                  className="dsh-permission-risk-cancel"
                  data-testid="digital-permission-cancel"
                  onClick={close}
                >
                  {t('agent.permission.riskCancel')}
                </button>
                <button
                  type="button"
                  className="dsh-permission-risk-confirm"
                  data-testid="digital-permission-confirm"
                  disabled={!acked}
                  onClick={() => {
                    void apply('full')
                  }}
                >
                  {t('agent.permission.riskConfirm')}
                </button>
              </div>
            </div>
          ) : (
            MODE_ITEMS.map((item) => (
              <button
                key={item.mode}
                type="button"
                role="menuitem"
                className="dsh-composer-menu-item dsh-composer-menu-item-wide"
                data-testid="digital-permission-item"
                data-mode={item.mode}
                data-selected={item.mode === mode ? 'true' : 'false'}
                onClick={() => choose(item.mode)}
              >
                <span className="dsh-composer-menu-check">
                  {item.mode === mode && <LucideIcon name="check" size={14} />}
                </span>
                <span className="dsh-composer-menu-item-body">
                  <span className="dsh-composer-menu-item-label">{t(item.label)}</span>
                  <span className="dsh-composer-menu-item-desc">{t(item.desc)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
