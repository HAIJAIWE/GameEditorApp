import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { BackupPanel } from '../../components/backup'
import { ClearAllPanel } from '../../components/backup'
import { useAppContext } from '../host'
import { registerReactBinding, type PanelBindingProps } from '../host'

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
    description: 'Maintenance panels (backup & restore / clear data); actions come from appContext',
    meta: {
      label: 'Data maintenance',
      labelKey: 'plugin.maintenance.label',
      icon: '🧹',
      description: 'Two action-driven panels, host-rendered + appContext-supplied',
      descriptionKey: 'plugin.maintenance.desc'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'backup.open',
        label: 'Backup & restore',
        labelKey: 'plugin.maintenance.backupLabel',
        run: () => host.openPanel('backup.panel')
      },
      {
        kind: 'panel',
        id: 'backup.panel',
        title: 'Backup & restore',
        titleKey: 'plugin.maintenance.backupLabel',
        ui: { type: 'text', text: 'Export a backup / restore from backup' }
      },
      {
        kind: 'command',
        id: 'clearAll.open',
        label: 'Clear data',
        labelKey: 'plugin.maintenance.clearLabel',
        run: () => host.openPanel('clearAll.panel')
      },
      {
        kind: 'panel',
        id: 'clearAll.panel',
        title: 'Clear data',
        titleKey: 'plugin.maintenance.clearLabel',
        ui: { type: 'text', text: 'Clear all data in this library (undoable)' }
      }
    ]
  }
}
