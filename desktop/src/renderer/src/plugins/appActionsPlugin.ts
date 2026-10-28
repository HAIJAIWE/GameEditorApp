import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import { notify } from './hostBridge'

/** 右侧数字员工 dock 的输入框：`aiPanel` 命令把焦点送过去（不新开对话） */
const DIGITAL_INPUT = '[data-testid="digital-input"]'

function focusDigitalInput(): void {
  const input = document.querySelector<HTMLInputElement>(DIGITAL_INPUT)
  if (input !== null && !input.disabled) {
    input.scrollIntoView({ block: 'nearest' })
    input.focus()
    return
  }
  notify('AI 助手在右侧常驻；当前对话运行中，输入框暂不可用')
}

/**
 * 应用级动作插件（B 方案 Slice 8c 第一批）。
 *
 * 这 7 个动作**不依赖 App 的 state**（不碰 types / 撤销栈 / 文件 I/O），只调窗口能力或 DOM，
 * 所以能整体搬出 App：菜单从 `host.commands()` 找到它们，App 不再持有这些动作。
 *
 * 剩下 8 个（打开/保存/批量导入导出/引擎导出/快照导出 = `useDataTransfer`，
 * 撤销/重做 = `useUndoRedo`）住在 App 的 hook 里，要先抽出一层服务才能搬——见 docs §9.4。
 */
export function defineAppActionsPlugin(_host: PluginHost): PluginManifest {
  const viewAction = (action: 'zoomIn' | 'zoomOut' | 'zoomReset' | 'reload' | 'toggleDevTools') => () => {
    void window.mbApi.app.viewAction({ action })
  }

  return {
    id: 'app-actions',
    name: 'app-actions',
    version: '0.1.0',
    description: '应用级动作（窗口缩放 / 重载 / 开发者工具 / AI 面板焦点 / 退出）',
    meta: {
      label: '应用动作',
      icon: '⌘',
      description: '不依赖 App 状态的菜单动作，纯 command 能力'
    },
    capabilities: [
      { kind: 'command', id: 'app.zoomIn', label: '放大', run: viewAction('zoomIn') },
      { kind: 'command', id: 'app.zoomOut', label: '缩小', run: viewAction('zoomOut') },
      { kind: 'command', id: 'app.zoomReset', label: '实际大小', run: viewAction('zoomReset') },
      { kind: 'command', id: 'app.reload', label: '重新加载', run: viewAction('reload') },
      {
        kind: 'command',
        id: 'app.toggleDevTools',
        label: '开发者工具',
        run: viewAction('toggleDevTools')
      },
      { kind: 'command', id: 'app.focusAi', label: 'AI 助手', run: focusDigitalInput },
      {
        kind: 'command',
        id: 'app.quit',
        label: '退出',
        run: () => {
          try {
            window.close()
          } catch {
            /* 忽略：无主窗口上下文时静默（原 App.handleQuit 的同一处理） */
          }
        }
      }
    ]
  }
}
