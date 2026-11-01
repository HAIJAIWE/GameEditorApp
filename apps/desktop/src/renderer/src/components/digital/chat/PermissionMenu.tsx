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

  const close = useCallback((): void => setOpen(false), [])

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

  const choose = useCallback(async (next: PermissionMode): Promise<void> => {
    setMode(next)
    setOpen(false)
    try {
      await window.mbApi.agent.setPermissionMode({ mode: next })
    } catch {
      /* IPC 失败保留 UI 态；下次打开会重新拉取主进程真实值 */
    }
  }, [])

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
        onClick={() => setOpen((value) => !value)}
      >
        <span className="dsh-composer-chip-label">
          {t('agent.permission.chip', { mode: t(currentLabel) })}
        </span>
        <LucideIcon name="chevron-down" size={12} />
      </button>
      {open && (
        <div className="dsh-composer-menu dsh-composer-menu-wide" role="menu" data-testid="digital-permission-list">
          {MODE_ITEMS.map((item) => (
            <button
              key={item.mode}
              type="button"
              role="menuitem"
              className="dsh-composer-menu-item dsh-composer-menu-item-wide"
              data-testid="digital-permission-item"
              data-mode={item.mode}
              data-selected={item.mode === mode ? 'true' : 'false'}
              onClick={() => {
                void choose(item.mode)
              }}
            >
              <span className="dsh-composer-menu-check">
                {item.mode === mode && <LucideIcon name="check" size={14} />}
              </span>
              <span className="dsh-composer-menu-item-body">
                <span className="dsh-composer-menu-item-label">{t(item.label)}</span>
                <span className="dsh-composer-menu-item-desc">{t(item.desc)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
