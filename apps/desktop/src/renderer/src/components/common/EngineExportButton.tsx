import { useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'

/**
 * 引擎代码导出入口（E2）：数据视图工具条上的按钮。
 * 流程：选保存路径（主进程 SaveDialog）→ 主进程渲染 Lua 数据模块并原子落盘 → 回报路径与字节数。
 *
 * 状态自带而不依赖 App 的通知状态 —— 与 `LibraryBar` 同一写法，改动面最小。
 * 用户取消保存对话框时**静默返回**（不报错、不提示），与「取消不是失败」的交互常识一致。
 */

interface EngineApi {
  dialog: {
    chooseEngineExportFile: (req: { defaultName: string }) => Promise<{ path: string | null }>
  }
  engine: {
    exportData: (req: {
      engine: 'lua'
      path: string
    }) => Promise<{ filePath: string; engine: string; bytes: number }>
  }
}

export default function EngineExportButton() {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const api = useMemo(() => window.mbApi as unknown as EngineApi, [])

  const handleExport = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const picked = await api.dialog.chooseEngineExportFile({ defaultName: 'GameData' })
      if (picked.path === null) return
      const result = await api.engine.exportData({ engine: 'lua', path: picked.path })
      setMessage(t('engine.export.done', { path: result.filePath, bytes: result.bytes }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        data-testid="export-engine"
        disabled={busy}
        onClick={() => void handleExport()}
      >
        {t('engine.export.lua')}
      </button>
      {message !== null && (
        <span className="item-meta" data-testid="export-engine-message">
          {message}
        </span>
      )}
      {error !== null && (
        <span className="form-error" data-testid="export-engine-error">
          {error}
        </span>
      )}
    </>
  )
}
