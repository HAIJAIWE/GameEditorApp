import { useCallback, useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { toErrorMessage } from '../appUtils'


/**
 * 撤销 / 重做。
 *
 * 从 `App.tsx` 原样抽出：撤销态（`undoUi`）只服务于菜单项的 disabled 与 tooltip 标签，
 * 以及三个动作（`performUndo` / `performRedo` / `refreshUndo`）。它们构成一个内聚单元，
 * 与 App 的其余编排（面板浮层、策划书导航）无关，独立成 hook 让 App 回到「编排」角色。
 *
 * ⚠️ 撤销/重做的文案与计数语义（applied / failed / skipped）逐字保留 —— 既有 E2E 与
 * 用户可见反馈都依赖它，重构不改行为。
 */

export interface UndoUiState {
  canUndo: boolean
  canRedo: boolean
  nextUndo: string | null
  nextRedo: string | null
}

export interface UseUndoRedo {
  /** 撤销/重做状态（菜单项 disabled 与 tooltip 标签用） */
  undoUi: UndoUiState
  /** 刷新增撤/重做状态（数据变更后调用，保证菜单项 disabled 与标签正确） */
  refreshUndo: () => void
  /** 执行撤销并用 notice 反馈（对齐 AI 回滚风格） */
  performUndo: () => Promise<void>
  /** 执行重做并对称反馈 */
  performRedo: () => Promise<void>
}

export function useUndoRedo(setNotice: (msg: string | null) => void, setError: (msg: string | null) => void): UseUndoRedo {
  const t = useT()
  const [undoUi, setUndoUi] = useState<UndoUiState>({
    canUndo: false,
    canRedo: false,
    nextUndo: null,
    nextRedo: null
  })

  // 初始化撤销/重做状态（启动时填充菜单项 disabled 与标签）
  useEffect(() => {
    void window.mbApi.data.undoState().then(setUndoUi).catch(() => undefined)
  }, [])

  /** 刷新增撤/重做状态（数据变更后调用，保证菜单项 disabled 与标签正确） */
  const refreshUndo = useCallback((): void => {
    void window.mbApi.data
      .undoState()
      .then(setUndoUi)
      .catch(() => undefined)
  }, [])

  /** 撤销：执行后刷新状态与按钮，并用 notice 反馈（对齐 AI 回滚风格） */
  const performUndo = useCallback(async (): Promise<void> => {
    try {
      const result = await window.mbApi.data.undo()
      const state = await window.mbApi.data.undoState()
      setUndoUi(state)
      const parts: string[] = []
      if (result.applied > 0) parts.push(t('undo.applied', { n: result.applied }))
      else if (result.failed.length === 0 && result.skipped.length === 0) parts.push(t('undo.nothing'))
      if (result.failed.length > 0)
        parts.push(
          t('undo.failed', {
            n: result.failed.length,
            names: result.failed.map((f) => f.name).join(t('undo.listSeparator'))
          })
        )
      if (result.skipped.length > 0)
        parts.push(
          t('undo.skipped', {
            n: result.skipped.length,
            items: result.skipped
              .map((s) => t('undo.skippedItem', { name: s.name, reason: s.reason }))
              .join(t('undo.listSeparator'))
          })
        )
      setNotice(parts.join(t('undo.partSeparator')) || t('undo.done'))
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [setNotice, setError, t])

  /** 重做：对称于撤销 */
  const performRedo = useCallback(async (): Promise<void> => {
    try {
      const result = await window.mbApi.data.redo()
      const state = await window.mbApi.data.undoState()
      setUndoUi(state)
      const parts: string[] = []
      if (result.applied > 0) parts.push(t('redo.applied', { n: result.applied }))
      else if (result.failed.length === 0 && result.skipped.length === 0) parts.push(t('redo.nothing'))
      if (result.failed.length > 0)
        parts.push(
          t('undo.failed', {
            n: result.failed.length,
            names: result.failed.map((f) => f.name).join(t('undo.listSeparator'))
          })
        )
      if (result.skipped.length > 0)
        parts.push(
          t('undo.skipped', {
            n: result.skipped.length,
            items: result.skipped
              .map((s) => t('undo.skippedItem', { name: s.name, reason: s.reason }))
              .join(t('undo.listSeparator'))
          })
        )
      setNotice(parts.join(t('undo.partSeparator')) || t('redo.done'))
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [setNotice, setError, t])

  return { undoUi, refreshUndo, performUndo, performRedo }
}

/*
 * 注：本文件原先还导出 `useDataTransfer`（打开/保存/批量导入导出/引擎导出/快照导出）。
 * Slice 8e 把它的实现搬到 `renderer/src/plugins/appActionsIo.ts` 并注册为 `app.io.*` 命令，
 * hook 版本已删除——避免「同一套逻辑两份实现」。
 */
