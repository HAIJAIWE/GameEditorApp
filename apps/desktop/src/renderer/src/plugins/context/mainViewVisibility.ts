/**
 * 主区页签的「按文档档位隐藏」规则 + 跨 slot 可见性通道。
 *
 * 为什么需要通道：页签条（`MainViewMount`）有 `MainViewContext`，能直接由
 * `ceshuList` / `activeCeshuId` 读出当前文档档位；但命令面板挂在 `app.overlay`
 * slot，拿不到那个 context，却会自动枚举 `host.mainViews()`。若两边不共享同一份
 * 「隐藏清单」，应用档（不启用游戏数据编辑）就会在 ⌘K 里留下一条点了跳不过去的
 * 假入口 —— 与 `docs/window-map.md` P1-2 是同一类问题。
 *
 * 分工：
 * - **规则归 `DocumentSpec` 所有**（`hiddenMainViewIdsForKind`），本模块只转发；
 * - App 把结果写进本模块；命令面板用 `useSyncExternalStore` 订阅；
 * - 页签条不订阅（它自己有 context，直接算，避免首帧 Effect 时序导致页签闪现）。
 *
 * 快照用同一个 `ReadonlySet` 引用（无变化时不换对象），满足 uSES 对稳定快照的要求。
 */

import type { DocKind } from '@mobai/shared/ceshu/model'
import { hiddenMainViewIdsForKind } from '@mobai/shared/documentSpec'

/** 游戏数据编辑页签（角色/怪物/技能等，纯应用档不适用；规格层也用这个 id） */
export const GAME_DATA_VIEW_ID = 'data.mainView'

/**
 * 档位 → 需要隐藏的主区页签 id。**委托规格层**，避免规则在两处各写一套。
 * 只有显式 `application` 才隐藏；`undefined`（首页 / 无激活文档）回落游戏档，零变化。
 */
export function hiddenMainViewIdsForDocKind(docKind: DocKind | undefined): readonly string[] {
  return hiddenMainViewIdsForKind(docKind)
}

let snapshot: ReadonlySet<string> = new Set<string>()
const listeners = new Set<() => void>()

/** uSES 的 getSnapshot：返回稳定引用 */
export function getHiddenMainViewIds(): ReadonlySet<string> {
  return snapshot
}

/** 写入隐藏清单（内容相同则不通知，避免无谓重渲染） */
export function setHiddenMainViewIds(ids: readonly string[]): void {
  const next = new Set<string>(ids)
  if (next.size === snapshot.size && [...next].every((id) => snapshot.has(id))) return
  snapshot = next
  for (const listener of listeners) listener()
}

export function subscribeHiddenMainViewIds(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
