import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
import BackupPanel from '../../components/backup/BackupPanel'
import ClearAllPanel from '../../components/backup/ClearAllPanel'
import { useAppContext } from '../host/appContext'
import { registerReactBinding, type PanelBindingProps } from '../host/reactBindings'

/**
 * 破坏性/维护类面板 → 插件化第六切片（B 方案 Slice 6 的第一批）。
 *
 * 这两个面板要的是**动作**而不是数据：备份恢复完要刷撤销栈，清空完要重置整套视图。
 * 动作已放进 `appContext`（`refreshUndo` / `handleDataCleared`），绑定自取，App 不再逐个下发。
 *
 * 为什么这两个能进 context、而 `onboarding` 的动作先不进：前两个是「数据被改过 → 刷新外部状态」
 * 这一类通用收尾动作；`onboarding` 的 action 分发本质是**导航**，属于 Slice 8 的 command 范畴，
 * 现在塞进 context 只是把耦合换个地方（见 §9）。
 */
function BackupPanelBound({ onClose }: PanelBindingProps) {
  const { refreshUndo } = useAppContext()
  return <BackupPanel onRestored={() => refreshUndo()} onClose={onClose} />
}

function ClearAllPanelBound() {
  const { handleDataCleared } = useAppContext()
  return <ClearAllPanel onCleared={handleDataCleared} />
}

export function defineMaintenancePanelsPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('backup.panel', BackupPanelBound)
  registerReactBinding('clearAll.panel', ClearAllPanelBound)

  return {
    id: 'maintenance-panels',
    name: 'maintenance-panels',
    version: '0.1.0',
    description: '维护面板包（备份恢复 / 清空数据），动作经 appContext 自供给',
    meta: {
      label: '数据维护',
      icon: '🧹',
      description: '2 个依赖动作的面板，经宿主渲染 + appContext 自供给'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'backup.open',
        label: '备份与恢复',
        run: () => host.openPanel('backup.panel')
      },
      {
        kind: 'panel',
        id: 'backup.panel',
        title: '备份与恢复',
        ui: { type: 'text', text: '导出备份包 / 从备份恢复' }
      },
      {
        kind: 'command',
        id: 'clearAll.open',
        label: '清空数据',
        run: () => host.openPanel('clearAll.panel')
      },
      {
        kind: 'panel',
        id: 'clearAll.panel',
        title: '清空数据',
        ui: { type: 'text', text: '清空当前库的全部数据（可撤销）' }
      }
    ]
  }
}
