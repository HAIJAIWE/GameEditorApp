/**
 * 菜单禁用态通道：`disabledWhen` 的判定由宿主（App）注入。
 *
 * 为什么不让插件自己算：`undo/redo` 是否可用取决于撤销栈状态（App 的 `useUndoRedo`），
 * 而 manifest 必须可序列化、宿主无关——所以契约里只写**判定键**（`disabledWhen: 'undo'`），
 * 具体状态由宿主在这里提供。
 */
export interface MenuState {
  /** 撤销当前可用 */
  undo: boolean
  /** 重做当前可用 */
  redo: boolean
}

let provider: (() => MenuState) | null = null

export function setMenuStateProvider(next: (() => MenuState) | null): void {
  provider = next
}

/** 某个判定键当前是否禁用；未知键 = 不禁用（宁可点一下报错，也别把入口锁死） */
export function isMenuDisabled(key: string | undefined): boolean {
  if (key === undefined) return false
  const state = provider?.()
  if (state === undefined) return false
  if (key === 'undo') return !state.undo
  if (key === 'redo') return !state.redo
  return false
}
