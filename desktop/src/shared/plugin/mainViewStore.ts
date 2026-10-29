/**
 * 主区页签激活态的根级 store（`mainView.state`）。
 *
 * 为什么把激活态从 `MainViewMount` 的 `useState` 搬出来：页签条自己切页只需要局部状态，
 * 但「从别处切页」是真实需求——命令面板 ⌘K 里点「数据编辑」就该跳过去。
 * 组件内部 state 没有对外写入口，于是激活态落到宿主根级 store，
 * 宿主再暴露 `openMainView(id)` 给插件（命令面板 / 未来快捷键 / 教程引导都用同一个入口）。
 *
 * **只存 `activeId`**：页签清单由 `host.mainViews()` + App 下发的内联页签决定，
 * 是「按需派生」的读，不该复制进 store（否则插件禁用后 store 里会留脏 id）。
 * 无效 id 的兜底仍由 `MainViewMount` 做（它知道当下有哪些页签）。
 */

import type { SlotStoreDecl } from './types'

/** 主区页签状态（当前只有一个字段，保持对象形状以便日后扩展） */
export interface MainViewState {
  /** 当前激活页签 id；空串表示「还没定过，交给挂载器按持久化/首个页签初始化」 */
  activeId: string
}

/** 根级 store 的 key（宿主与消费方共用，避免各处硬编码） */
export const MAIN_VIEW_STORE_KEY = 'mainView.state'

/** 初始态：空 id 表示「未初始化」，由 `MainViewMount` 首帧按 localStorage 补齐 */
export function initialMainViewState(): MainViewState {
  return { activeId: '' }
}

/** 主区页签 store 声明：`activate` 是唯一写入口（幂等：同 id 再激活返回新对象，渲染无害） */
export function createMainViewStoreDecl(): SlotStoreDecl<MainViewState> {
  return {
    init: initialMainViewState,
    actions: {
      activate: (state, id) => {
        const next = typeof id === 'string' ? id : ''
        return next === (state as MainViewState).activeId ? undefined : { activeId: next }
      },
      reset: () => initialMainViewState()
    }
  }
}
