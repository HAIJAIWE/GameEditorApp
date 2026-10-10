import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { libraryCreateInputSchema, libraryRenameInputSchema, libraryNameInputSchema } from '../../shared/schemas'

export function registerLibraryIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { libraryManager, onSwitchLibrary } = deps
  // 库管理（A2-1）：切换由 onSwitchLibrary 负责重建 store 并广播 library:changed
  handle('library:list', undefined, () => libraryManager.list())
  handle('library:create', libraryCreateInputSchema, (req) =>
    libraryManager.create(req.name, req.description ?? '')
  )
  handle('library:rename', libraryRenameInputSchema, async (req) => {
    await libraryManager.rename(req.from, req.to)
    return { ok: true }
  })
  handle('library:remove', libraryNameInputSchema, (req) => libraryManager.remove(req.name))
  handle('library:switch', libraryNameInputSchema, async (req) => {
    await onSwitchLibrary(req.name)
    return { ok: true }
  })
}
