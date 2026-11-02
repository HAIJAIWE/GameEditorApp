import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { translate, type MessageKey } from '@mobai/shared/i18n'
import { getLocalePreference } from '../../localePreference'
import { notify } from '../host'
import {
  engineExport,
  exportCsv,
  exportExcel,
  exportJson,
  exportSnapshot,
  importCsv,
  importExcel,
  importJson,
  redo,
  undo
} from '../context'

/** 右侧数字员工 dock 的输入框：`aiPanel` 命令把焦点送过去（不新开对话） */
const DIGITAL_INPUT = '[data-testid="digital-input"]'

function focusDigitalInput(): void {
  const input = document.querySelector<HTMLInputElement>(DIGITAL_INPUT)
  if (input !== null && !input.disabled) {
    input.scrollIntoView({ block: 'nearest' })
    input.focus()
    return
  }
  notify(translate(getLocalePreference(), 'agent.digitalUnavailable'))
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
/** 引擎导出的目标（与 `engineTargetSchema` 一致；一个引擎一条命令） */
const ENGINE_COMMANDS: Array<{
  engine: 'lua' | 'unity' | 'unreal' | 'godot' | 'cocos2d'
  label: string
  labelKey: MessageKey
}> = [
  { engine: 'lua', label: 'Lua', labelKey: 'app.cmd.io.engineExport.lua' },
  { engine: 'unity', label: 'Unity', labelKey: 'app.cmd.io.engineExport.unity' },
  { engine: 'unreal', label: 'Unreal', labelKey: 'app.cmd.io.engineExport.unreal' },
  { engine: 'godot', label: 'Godot', labelKey: 'app.cmd.io.engineExport.godot' },
  { engine: 'cocos2d', label: 'Cocos2d', labelKey: 'app.cmd.io.engineExport.cocos2d' }
]

export function defineAppActionsPlugin(_host: PluginHost): PluginManifest {
  const viewAction = (action: 'zoomIn' | 'zoomOut' | 'zoomReset' | 'reload' | 'toggleDevTools') => () => {
    void window.mbApi.app.viewAction({ action })
  }

  return {
    id: 'app-actions',
    name: 'app-actions',
    version: '0.1.0',
    description: 'App-level actions (window zoom / reload / devtools / AI focus / quit / file I/O / undo-redo)',
    meta: {
      labelKey: 'app.actions.metaLabel',
      icon: '⌘',
      descriptionKey: 'app.actions.metaDescription'
    },
    capabilities: [
      { kind: 'command', id: 'app.zoomIn', label: 'Zoom in', labelKey: 'app.cmd.zoomIn', run: viewAction('zoomIn') },
      { kind: 'command', id: 'app.zoomOut', label: 'Zoom out', labelKey: 'app.cmd.zoomOut', run: viewAction('zoomOut') },
      {
        kind: 'command',
        id: 'app.zoomReset',
        label: 'Actual size',
        labelKey: 'app.cmd.zoomReset',
        run: viewAction('zoomReset')
      },
      { kind: 'command', id: 'app.reload', label: 'Reload', labelKey: 'app.cmd.reload', run: viewAction('reload') },
      {
        kind: 'command',
        id: 'app.toggleDevTools',
        label: 'Developer tools',
        labelKey: 'app.cmd.toggleDevTools',
        run: viewAction('toggleDevTools')
      },
      { kind: 'command', id: 'app.focusAi', label: 'Agent', labelKey: 'app.cmd.focusAi', run: focusDigitalInput },
      {
        kind: 'command',
        id: 'app.quit',
        label: 'Quit',
        labelKey: 'app.cmd.quit',
        run: () => {
          try {
            window.close()
          } catch {
            /* 忽略：无主窗口上下文时静默（原 App.handleQuit 的同一处理） */
          }
        }
      },

      // —— 文件 I/O（Slice 8e）：实现住在 `appActionsIo.ts`，只依赖注入的端口 ——
      // 注：「打开/保存」与「批量导入/导出」历史上共用同一对 handler（见 MenuBar 注释），
      // 这里保持同样的映射，不趁机改语义。
      { kind: 'command', id: 'app.io.open', label: 'Open', labelKey: 'app.cmd.io.open', run: () => void importJson() },
      { kind: 'command', id: 'app.io.save', label: 'Save', labelKey: 'app.cmd.io.save', run: () => void exportJson() },
      {
        kind: 'command',
        id: 'app.io.batchImport',
        label: 'Batch import',
        labelKey: 'app.cmd.io.batchImport',
        run: () => void importJson()
      },
      {
        kind: 'command',
        id: 'app.io.batchExport',
        label: 'Batch export',
        labelKey: 'app.cmd.io.batchExport',
        run: () => void exportJson()
      },
      {
        kind: 'command',
        id: 'app.io.importCsv',
        label: 'Import CSV',
        labelKey: 'app.cmd.io.importCsv',
        run: () => void importCsv()
      },
      {
        kind: 'command',
        id: 'app.io.exportCsv',
        label: 'Export CSV',
        labelKey: 'app.cmd.io.exportCsv',
        run: () => void exportCsv()
      },
      {
        kind: 'command',
        id: 'app.io.importExcel',
        label: 'Import Excel',
        labelKey: 'app.cmd.io.importExcel',
        run: () => void importExcel()
      },
      {
        kind: 'command',
        id: 'app.io.exportExcel',
        label: 'Export Excel',
        labelKey: 'app.cmd.io.exportExcel',
        run: () => void exportExcel()
      },

      // 引擎导出：一个引擎一条命令（`run()` 不带参数 ⇒ 目标引擎烘进命令里）
      ...ENGINE_COMMANDS.map((entry) => ({
        kind: 'command' as const,
        id: `app.io.engineExport.${entry.engine}`,
        label: `Export as ${entry.label}`,
        labelKey: entry.labelKey,
        run: () => void engineExport(entry.engine)
      })),
      // 快照导出：json / csv 各一条
      {
        kind: 'command',
        id: 'app.io.snapshot.json',
        label: 'Export snapshot (JSON)',
        labelKey: 'app.cmd.io.snapshotJson',
        run: () => void exportSnapshot('json')
      },
      {
        kind: 'command',
        id: 'app.io.snapshot.csv',
        label: 'Export snapshot (CSV)',
        labelKey: 'app.cmd.io.snapshotCsv',
        run: () => void exportSnapshot('csv')
      },

      // —— 撤销 / 重做：撤销态是 App 的 state，实现由端口注入 ——
      { kind: 'command', id: 'app.undo', label: 'Undo', labelKey: 'app.cmd.undo', run: () => void undo() },
      { kind: 'command', id: 'app.redo', label: 'Redo', labelKey: 'app.cmd.redo', run: () => void redo() }
    ]
  }
}
