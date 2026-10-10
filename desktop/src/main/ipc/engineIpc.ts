import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { engineExportInputSchema } from '../../shared/schemas'
import { exportEngineData } from '../engineExport/exporter'

export function registerEngineIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { dataService, typeSchemaStore } = deps
  // 引擎代码导出（P0：Lua）：取全量数据快照 + 当前 schema，渲染并原子落盘
  handle('engine:exportData', engineExportInputSchema, (req) =>
    exportEngineData(dataService.listAllItems(), typeSchemaStore.getTypes(), {
      engine: req.engine,
      targetPath: req.path
    })
  )
}
