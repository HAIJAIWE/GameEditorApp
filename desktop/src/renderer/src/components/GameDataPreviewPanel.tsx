import { useEffect, useMemo, useState } from 'react'

import { buildGameDataPreview } from '../../../shared/domain/ceshu/gameDataPreview'
import type { DataTypeDef, ItemRecord } from '../../../shared/types'
import { toErrorMessage } from '../../../shared/util/system/errors'

/**
 * 游戏数据预览面板（对齐 旧版 `src/features/engine_export::show_game_data_preview`，
 * 菜单入口 `ui/menus:69`「文件 → 导出 → 游戏数据预览」）。
 *
 * 旧版 是一段「把 `data_manager.data` 整个 `json.dumps` 出来放进只读 QTextEdit」的代码；
 * TS 侧改成：主进程出数据（`data.listAll` 已在数据编辑器里用过，同一份来源），
 * 渲染层用 `buildGameDataPreview` 摊成 JSON 文本塞进 `<pre>`。
 *
 * **与 旧版 的差异（都写明理由）**：
 * - 不做 50000 字符截断（那是 Qt 单控件的现实约束，`<pre>` 扛得住；截断会让用户看不到全貌），
 *   改为在标题里显示规模（类型数 / 条目数 / 字符数），超长时也明确告知「已渲染全量」。
 * - 键序按字典序稳定输出、空桶不出现。
 */
type PreviewState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; text: string; bucketCount: number; itemCount: number; totalChars: number }

export default function GameDataPreviewPanel() {
  const [state, setState] = useState<PreviewState>({ status: 'loading' })

  // 面板每次打开都重新拉全量数据（用户可能刚在数据编辑器里改过）
  useEffect(() => {
    let alive = true
    const api = window.mbApi as unknown as {
      data: { listAll: () => Promise<ItemRecord[]> }
      schema: { list: () => Promise<DataTypeDef[]> }
    }
    void Promise.all([api.data.listAll(), api.schema.list()])
      .then(([records, types]) => {
        if (!alive) return
        const preview = buildGameDataPreview(records, types)
        setState({ status: 'ready', ...preview })
      })
      .catch((error: unknown) => {
        if (!alive) return
        setState({ status: 'error', message: toErrorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [])

  // 规模摘要（字符数超 5 万时提示「已渲染全量」，对齐不做截断的说明）
  const scale = useMemo(() => {
    if (state.status !== 'ready') return null
    const mb = state.totalChars / 1024 / 1024
    const sizeText = mb >= 1 ? `${mb.toFixed(2)} MB 字符` : `${state.totalChars.toLocaleString('en-US')} 字符`
    return {
      sizeText,
      fullText: state.totalChars > 50_000 ? '（已渲染全量，未截断）' : ''
    }
  }, [state])

  return (
    <div className="editor" data-testid="game-data-preview-panel">
      <div className="editor-header">
        <div className="editor-title">
          游戏数据预览
          <small>
            {scale === null
              ? '正在读取全库数据…'
              : `${state.status === 'ready' ? state.bucketCount : 0} 个类型 · ${
                  state.status === 'ready' ? state.itemCount : 0
                } 条条目 · ${scale.sizeText} ${scale.fullText}`.trim()}
          </small>
        </div>
      </div>

      <div className="editor-body">
        {state.status === 'loading' && <div className="empty">正在读取全库数据…</div>}
        {state.status === 'error' && (
          <div className="form-error" data-testid="game-data-preview-error">
            {state.message}
          </div>
        )}
        {state.status === 'ready' &&
          (state.itemCount === 0 ? (
            <div className="empty" data-testid="game-data-preview-empty">
              当前库没有数据，先在数据编辑器里新建条目。
            </div>
          ) : (
            <pre className="game-data-preview-text" data-testid="game-data-preview-text">
              {state.text}
            </pre>
          ))}
      </div>
    </div>
  )
}
