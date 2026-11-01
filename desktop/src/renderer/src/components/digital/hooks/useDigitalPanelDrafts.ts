import { useRef, useState } from 'react'

import type { DraftSummary } from '../../../../../shared/agent/conversation'
import type { ConversationAction } from '../../../../../shared/agent/conversation'
import { toErrorMessage } from '../../../../../shared/util/system'
import type { ChatApi } from '../api/digitalPanelApi'

/**
 * 「草稿管理」下拉簇：保存当前对话为草稿 / 从最近草稿恢复（上限 5 条）。
 *
 * 列表**按需拉取**（打开下拉时才请求，不常驻轮询），保存/恢复成功后给一条轻提示。
 * 恢复只灌历史，不动主进程活跃会话——用户点「恢复上次会话」才落盘，这条语义在面板侧，
 * 故 `loadDraft` 只把消息交给调用方的 `dispatch`。
 */
export interface DigitalPanelDrafts {
  open: boolean
  menuRef: React.RefObject<HTMLDivElement | null>
  drafts: DraftSummary[]
  draftName: string
  setDraftName: (name: string) => void
  /** 保存进行中（避免重复点击；与「发送中」互不干扰） */
  busy: boolean
  loadDrafts: () => Promise<void>
  saveDraft: () => Promise<void>
  loadDraft: (path: string) => Promise<void>
  /** 工具栏按钮：切换展开并（展开时）拉列表 */
  toggleMenu: () => void
  /** 斜杠命令入口：直接展开并拉列表 */
  openMenu: () => void
  closeMenu: () => void
}

export function useDigitalPanelDrafts({
  api,
  dispatch,
  setLocalError,
  setNotice
}: {
  api: ChatApi
  dispatch: (action: ConversationAction) => void
  setLocalError: (message: string | null) => void
  setNotice: (message: string | null) => void
}): DigitalPanelDrafts {
  /** 「草稿管理」下拉展开状态 */
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  /** 草稿列表（打开下拉时按需拉取，不常驻轮询） */
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  /** 草稿名输入框（空串由主进程回落成默认名 `对话草稿_MMDD_HHMM`） */
  const [draftName, setDraftName] = useState('')
  /** 草稿保存进行中（避免重复点击；与「发送中」互不干扰） */
  const [busy, setBusy] = useState(false)

  /** 拉草稿列表（打开下拉时触发；失败只提示不打断面板） */
  const loadDrafts = async (): Promise<void> => {
    try {
      setDrafts(await api.draftList())
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    }
  }

  /** 保存当前对话为草稿（主进程从落盘的活跃会话取数据，渲染层不传消息） */
  const saveDraft = async (): Promise<void> => {
    setLocalError(null)
    setBusy(true)
    try {
      const saved = await api.draftSave({ name: draftName.trim() })
      setDraftName('')
      setDrafts(await api.draftList())
      setNotice(`草稿已保存：${saved.name}`)
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  /** 从草稿恢复：只灌历史，不动主进程活跃会话（用户点「恢复上次会话」才落盘） */
  const loadDraft = async (path: string): Promise<void> => {
    setLocalError(null)
    setOpen(false)
    try {
      const draft = await api.draftLoad({ path })
      dispatch({ kind: 'hydrate', history: draft.messages })
      setNotice(`已恢复草稿：${draft.name}`)
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    }
  }

  const toggleMenu = (): void => {
    setOpen((value) => !value)
    setNotice(null)
    if (!open) void loadDrafts()
  }

  const openMenu = (): void => {
    setOpen(true)
    void loadDrafts()
  }

  const closeMenu = (): void => {
    setOpen(false)
  }

  return {
    open,
    menuRef,
    drafts,
    draftName,
    setDraftName,
    busy,
    loadDrafts,
    saveDraft,
    loadDraft,
    toggleMenu,
    openMenu,
    closeMenu
  }
}
