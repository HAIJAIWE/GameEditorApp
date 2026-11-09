import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { toErrorMessage } from '@mobai/shared/util/system'

import { editorStartAiDevFor } from '../../plugins/ceshu'

type Board = Awaited<ReturnType<typeof window.mbApi.ceshu.workOrderProgress>>
type BoardEntry = Board['entries'][number]

/**
 * 施工看板（内容槽视图）：这几十份交接文档现在做到哪了、下一份做谁。
 *
 * 一张表回答三件事：
 * 1. **逐份工序状态**——已完成 / 需返工 / 未开工 / 门禁未就绪 / 不适用；
 * 2. **逐份机判结论**——pass / fail / skip / unverified（未过的可展开看举证）；
 * 3. **成绩单回写**——一次把机判快照贴进工作区根的 `进度.md`（不动施工记录行）。
 *
 * 口径全部在主进程算（`buildHandoffProgressBoard`），本组件只呈现，不新增判定。
 *
 * 派活（每份一行「派这一份」）：走 `editorStartAiDevFor(path)` 编辑器桥 —— 不重选导出目录，
 * 交接包不在时由主进程就地导出。派工单仍然**只预填、不发送**（用户看过再按发送）。
 * 之所以逐份给按钮而不是只留「派下一份」：看板里 20 份排着，人常常要先做有阻塞的那份，
 * 或返工机判没过的那份——自动选择器只会永远挑第一份就绪的。
 * ⚠️ **机判不替人盖章**：状态里的「已完成」只认 `进度.md` 的施工记录（智能体/人自己写的一行），
 * 机器只能**否决**（机判有 fail ⇒ 降级成「需返工」）。否则就退回「AI 自述完成」的老路。
 */
export default function WorkBoardPanel({ ceshuId, onClose }: { ceshuId: string; onClose: () => void }) {
  const t = useT()
  const [board, setBoard] = useState<Board | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // 挂载即算一次：看板的价值就在「打开就知道现状」，不该再让用户手点一下。
  // 走 .then 而不是在 effect 体内同步 setState（否则触发级联渲染，lint 也拦）。
  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .workOrderProgress({ id: ceshuId })
      .then((result) => {
        if (!cancelled) setBoard(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  const refresh = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setBoard(await window.mbApi.ceshu.workOrderProgress({ id: ceshuId }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (path: string): void => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const stateLabel = (entry: BoardEntry): string => {
    switch (entry.state) {
      case 'done':
        return t('workBoard.stateDone')
      case 'rework':
        return t('workBoard.stateRework')
      case 'blocked':
        return t('workBoard.stateBlocked')
      case 'skip':
        return t('workBoard.stateSkip')
      default:
        return t('workBoard.stateTodo')
    }
  }

  return (
    <div className="changelog-panel" data-testid="workboard-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t('workBoard.title')}</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn"
            data-testid="workboard-refresh"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? t('workBoard.refreshing') : t('workBoard.refresh')}
          </button>
          <button type="button" className="btn" data-testid="workboard-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      {error !== null && (
        <div className="empty" data-testid="workboard-error">
          {t('workBoard.error', { message: error })}
        </div>
      )}

      {board !== null && (
        <>
          <div className="item-meta" data-testid="workboard-summary">
            {t('workBoard.summary', {
              total: board.counts.total,
              done: board.counts.done,
              rework: board.counts.rework,
              todo: board.counts.todo,
              blocked: board.counts.blocked
            })}
          </div>
          <div className="item-meta" data-testid="workboard-next">
            {board.next === null ? t('workBoard.nextNone') : t('workBoard.next', { path: board.next })}
          </div>
          <div className="item-meta" data-testid="workboard-written">
            {board.written
              ? t('workBoard.written', { path: board.progressPath })
              : t('workBoard.writeFailed', { path: board.progressPath })}
          </div>
          <div className="item-meta">
            {t('workBoard.machine', {
              fail: board.counts.machineFail,
              unverified: board.counts.unverified
            })}
          </div>

          <div className="changelog-entry">
            {board.entries.length === 0 && <div className="empty">{t('workBoard.empty')}</div>}
            {board.entries.map((entry) => (
              <div
                key={entry.path}
                className="validate-line"
                data-testid="workboard-entry"
                data-state={entry.state}
                data-path={entry.path}
              >
                <div>
                  <strong>{stateLabel(entry)}</strong> <code>{entry.path}</code>
                  {' · '}
                  {t('workBoard.acceptance', {
                    pass: entry.summary.pass,
                    fail: entry.summary.fail,
                    unverified: entry.summary.unverified
                  })}
                </div>
                <div>{entry.note}</div>
                <div>
                  {/* 「不适用」的文档不给按钮：派了也会被改派，只会多绕一圈。 */}
                  {entry.state !== 'skip' && (
                    <button
                      type="button"
                      className="btn slim"
                      data-testid="workboard-dispatch"
                      data-path={entry.path}
                      onClick={() => editorStartAiDevFor(entry.path)}
                    >
                      {t('workBoard.dispatch')}
                    </button>
                  )}
                </div>
                {entry.failures.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="btn slim"
                      data-testid="workboard-toggle"
                      data-path={entry.path}
                      onClick={() => toggle(entry.path)}
                    >
                      {expanded.has(entry.path)
                        ? t('workBoard.hideFailures', { count: entry.failures.length })
                        : t('workBoard.showFailures', { count: entry.failures.length })}
                    </button>
                    {expanded.has(entry.path) && (
                      <ul className="impact-list" data-testid="workboard-failures" data-path={entry.path}>
                        {entry.failures.map((failure) => (
                          <li key={failure.id}>
                            <code>{failure.id}</code> {failure.text} —— {failure.evidence}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}