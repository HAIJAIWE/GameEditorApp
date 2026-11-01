import { useCallback, useRef, useState } from 'react'

import { LLM_PROVIDER_PRESETS, loadLlmConfig, saveLlmConfig } from '@mobai/shared/config/llm'
import type { LlmProvider } from '@mobai/shared/config/llm'

/**
 * 输入框的「模型」下拉：**真下拉**。当前模型来自 localStorage 的 LLM 配置，
 * 选项来自 `LLM_PROVIDER_PRESETS[provider].models`；Ollama 再叠加 `llm:status`
 * 探到的本机已装模型。选中即写回 localStorage + 推主进程镜像（与设置面板同一链路），
 * 后续 agent 调用会读到新模型。权限「完全权限」则无后端开关，保持静态展示。
 *
 * 只管模型清单与选择；菜单的「点击外部 / Esc 关闭」由面板统一调度（见主组件的
 * 单一 document 监听），故这里只暴露 `close` 与 ref。
 */
export interface DigitalPanelModelMenu {
  open: boolean
  menuRef: React.RefObject<HTMLDivElement | null>
  availableModels: string[]
  currentModel: string
  currentProvider: LlmProvider
  loadModels: () => Promise<void>
  chooseModel: (model: string) => Promise<void>
  close: () => void
  /** 触发器点击：未展开时先拉清单再展开 */
  onTriggerClick: () => Promise<void>
}

export function useDigitalPanelModelMenu(): DigitalPanelModelMenu {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [currentModel, setCurrentModel] = useState<string>(() => {
    try { return loadLlmConfig().model } catch { return '' }
  })
  const [currentProvider, setCurrentProvider] = useState<LlmProvider>(() => {
    try { return loadLlmConfig().provider } catch { return 'ollama' }
  })

  /**
   * 打开模型下拉时拉取可选项：预设清单（离线安全）打底，Ollama 再叠加本机已装模型。
   * 当前已选模型若不在清单里也补到首位，避免「选了但列表里看不见」。
   */
  const loadModels = useCallback(async (): Promise<void> => {
    const cfg = loadLlmConfig()
    setCurrentProvider(cfg.provider)
    setCurrentModel(cfg.model)
    let models = [...(LLM_PROVIDER_PRESETS[cfg.provider]?.models ?? [])]
    if (cfg.provider === 'ollama') {
      try {
        const status = await window.mbApi.llm.status()
        if (status.models.length > 0) models = status.models
      } catch {
        /* 离线安全：用预设清单兜底 */
      }
    }
    if (cfg.model !== '' && !models.includes(cfg.model)) models = [cfg.model, ...models]
    setAvailableModels(models)
  }, [])

  /** 选中模型：写回 localStorage + 推主进程镜像（与设置面板同一链路），后续调用即生效 */
  const chooseModel = useCallback(async (model: string): Promise<void> => {
    const cfg = loadLlmConfig()
    const next = { ...cfg, model }
    saveLlmConfig(next)
    try {
      await window.mbApi.llm.configure({ config: next })
    } catch {
      /* 镜像推送尽力而为；本地配置已落盘 */
    }
    setCurrentModel(model)
    setOpen(false)
  }, [])

  const close = useCallback((): void => {
    setOpen(false)
  }, [])

  const onTriggerClick = useCallback(async (): Promise<void> => {
    if (!open) await loadModels()
    setOpen((value) => !value)
  }, [open, loadModels])

  return {
    open,
    menuRef,
    availableModels,
    currentModel,
    currentProvider,
    loadModels,
    chooseModel,
    close,
    onTriggerClick
  }
}
