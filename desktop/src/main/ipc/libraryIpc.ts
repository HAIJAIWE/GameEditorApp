import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  libraryCreateInputSchema,
  libraryRenameInputSchema,
  libraryNameInputSchema,
  libraryRemoveInputSchema
} from '../../shared/schema/core/schemas'

export function registerLibraryIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { libraryManager, onSwitchLibrary } = deps
  // 库管理（A2-1）：切换由 onSwitchLibrary 负责重建 store 并广播 library:changed
  // 活跃库指针随列表一起返回：渲染层切换后会整页重载，拿不到组件内状态
  handle('library:list', undefined, () => ({
    libraries: libraryManager.list(),
    active: libraryManager.active()
  }))
  handle('library:create', libraryCreateInputSchema, (req) =>
    libraryManager.create(req.name, req.description ?? '')
  )
  handle('library:rename', libraryRenameInputSchema, async (req) => {
    await libraryManager.rename(req.from, req.to)
    return { ok: true }
  })
  // 整库删除是本应用最破坏性的动作（rmSync 递归抹掉该库全部策划书/数据/图片，且**不走撤销**）
  // ⇒ 契约层 confirm 必填 + 主进程再挡一次，渲染层的确认可被绕过（对齐 data:clearAll / ceshu:delete）
  handle('library:remove', libraryRemoveInputSchema, (req) => {
    if (req.confirm !== true) throw new Error('删除游戏库需要确认')
    return libraryManager.remove(req.name)
  })
  handle('library:switch', libraryNameInputSchema, async (req) => {
    await onSwitchLibrary(req.name)
    return { ok: true }
  })
}
