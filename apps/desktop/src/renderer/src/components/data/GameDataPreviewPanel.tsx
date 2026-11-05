import { useEffect, useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { buildGameDataPreview } from '@mobai/shared/domain/ceshu/gameDataPreview'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'
import { toErrorMessage } from '@mobai/shared/util/system'

import { PanelShell, StateView } from '../common'

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
  const t = useT()
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
    const sizeText =
      mb >= 1
        ? t('gameData.sizeMb', { mb: mb.toFixed(2) })
        : t('gameData.sizeChars', { chars: state.totalChars.toLocaleString('en-US') })
    return {
      sizeText,
      fullText: state.totalChars > 50_000 ? t('gameData.fullRendered') : ''
    }
  }, [state, t])

  return (
    <PanelShell
      testId="game-data-preview-panel"
      toolbar={
        <span className="item-meta">
          {scale === null
            ? t('gameData.loading')
            : t('gameData.scaleSummary', {
                buckets: state.status === 'ready' ? state.bucketCount : 0,
                items: state.status === 'ready' ? state.itemCount : 0,
                size: scale.sizeText,
                full: scale.fullText
              }).trim()}
        </span>
      }
    >
        {state.status === 'loading' && <StateView kind="loading" title={t('gameData.loading')} />}
        {state.status === 'error' && (
          <StateView kind="error" testId="game-data-preview-error" description={state.message} />
        )}
        {state.status === 'ready' &&
          (state.itemCount === 0 ? (
            <StateView kind="empty" testId="game-data-preview-empty" title={t('gameData.empty')} />
          ) : (
            <pre className="game-data-preview-text" data-testid="game-data-preview-text">
              {state.text}
            </pre>
          ))}
    </PanelShell>
  )
}
