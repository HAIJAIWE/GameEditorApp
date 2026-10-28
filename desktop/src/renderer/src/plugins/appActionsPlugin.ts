import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import { notify } from './hostBridge'
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
} from './appActionsIo'

/** 右侧数字员工 dock 的输入框：`aiPanel` 命令把焦点送过去（不新开对话） */
const DIGITAL_INPUT = '[data-testid="digital-input"]'

function focusDigitalInput(): void {
  const input = document.querySelector<HTMLInputElement>(DIGITAL_INPUT)
  if (input !== null && !input.disabled) {
    input.scrollIntoView({ block: 'nearest' })
    input.focus()
    return
  }
  notify('智能体在右侧常驻；当前对话运行中，输入框暂不可用')
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
const ENGINE_COMMANDS: Array<{ engine: 'lua' | 'unity' | 'unreal' | 'godot' | 'cocos2d'; label: string }> = [
  { engine: 'lua', label: 'Lua' },
  { engine: 'unity', label: 'Unity' },
  { engine: 'unreal', label: 'Unreal' },
  { engine: 'godot', label: 'Godot' },
  { engine: 'cocos2d', label: 'Cocos2d' }
]

export function defineAppActionsPlugin(_host: PluginHost): PluginManifest {
  const viewAction = (action: 'zoomIn' | 'zoomOut' | 'zoomReset' | 'reload' | 'toggleDevTools') => () => {
    void window.mbApi.app.viewAction({ action })
  }

  return {
    id: 'app-actions',
    name: 'app-actions',
    version: '0.1.0',
    description: '应用级动作（窗口缩放 / 重载 / 开发者工具 / AI 焦点 / 退出 / 文件 I/O / 撤销重做）',
    meta: {
      label: '应用动作',
      icon: '⌘',
      description: '菜单里的非导航动作：窗口、文件 I/O、撤销重做（实现住在 appActionsIo / useUndoRedo）'
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
      { kind: 'command', id: 'app.focusAi', label: '智能体', run: focusDigitalInput },
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
      },

      // —— 文件 I/O（Slice 8e）：实现住在 `appActionsIo.ts`，只依赖注入的端口 ——
      // 注：「打开/保存」与「批量导入/导出」历史上共用同一对 handler（见 MenuBar 注释），
      // 这里保持同样的映射，不趁机改语义。
      { kind: 'command', id: 'app.io.open', label: '打开', run: () => void importJson() },
      { kind: 'command', id: 'app.io.save', label: '保存', run: () => void exportJson() },
      { kind: 'command', id: 'app.io.batchImport', label: '批量导入', run: () => void importJson() },
      { kind: 'command', id: 'app.io.batchExport', label: '批量导出', run: () => void exportJson() },
      { kind: 'command', id: 'app.io.importCsv', label: '导入 CSV', run: () => void importCsv() },
      { kind: 'command', id: 'app.io.exportCsv', label: '导出 CSV', run: () => void exportCsv() },
      { kind: 'command', id: 'app.io.importExcel', label: '导入 Excel', run: () => void importExcel() },
      { kind: 'command', id: 'app.io.exportExcel', label: '导出 Excel', run: () => void exportExcel() },

      // 引擎导出：一个引擎一条命令（`run()` 不带参数 ⇒ 目标引擎烘进命令里）
      ...ENGINE_COMMANDS.map((entry) => ({
        kind: 'command' as const,
        id: `app.io.engineExport.${entry.engine}`,
        label: `导出为 ${entry.label} 格式`,
        run: () => void engineExport(entry.engine)
      })),
      // 快照导出：json / csv 各一条
      { kind: 'command', id: 'app.io.snapshot.json', label: '导出数据快照（JSON）', run: () => void exportSnapshot('json') },
      { kind: 'command', id: 'app.io.snapshot.csv', label: '导出数据快照（CSV）', run: () => void exportSnapshot('csv') },

      // —— 撤销 / 重做：撤销态是 App 的 state，实现由端口注入 ——
      { kind: 'command', id: 'app.undo', label: '撤销', run: () => void undo() },
      { kind: 'command', id: 'app.redo', label: '重做', run: () => void redo() }
    ]
  }
}
