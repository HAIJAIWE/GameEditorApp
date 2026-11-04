/**
 * 策划书首页「开始」引导屏的动作注册表 —— 纯数据，零 React / 零 IPC / 零宿主依赖。
 *
 * 对齐 dsh `packages/client/ui-sidebar-right/src/client/tabs/guide/GuideBody.tsx`
 * 的两层结构（这是「结构对齐」而不是像素对齐的部分）：
 * - 胶囊内容来自**注册表**（dsh 是各插件贡献的 `useGuideEntries` observable），
 *   渲染层只负责 map 与绑定回调，新增/隐藏一个门不再改 JSX；
 * - `MAX_DESCRIBED_ENTRIES = 4`（dsh GuideBody.tsx:62）：可见门 ≤4 时每张带
 *   一行 11px 描述，超过就全部收起描述以保持引导页轻量。
 *
 * 「全部策划书」是**滚动锚点**而非创建门，不参与描述阈值——类比 dsh
 * `guide-pins.ts` 的 `FIXED_GUIDE_KIND = 'files'`（固定卡不进定制列表）。
 *
 * 与 dsh 未对齐的一层（诚实）：dsh 用 `renderSlotChain('sidebar.right.tab.guide')`
 * 让插件整体替换引导体；墨白此处仍是内置 fallback，未接 chain。原因见当日日志：
 * 首页组件直连 `plugins/context` 单例会与 `coreViewsPlugin` 形成模块环。
 */
import type { MessageKey } from '../i18n'
import type { LucideIconName } from '../util/ui'

/** dsh GuideBody.tsx:62 —— 超过这个门数就收起所有描述。 */
export const MAX_DESCRIBED_HOME_ACTIONS = 4

export type CeshuHomeActionId = 'blank' | 'copy' | 'clone' | 'folder' | 'library'
export type CeshuHomeActionKind = 'guide' | 'anchor'

/** 一枚动作胶囊的静态契约；回调、禁用态、展开态由渲染层按 id 绑定。 */
export interface CeshuHomeActionDef {
  readonly id: CeshuHomeActionId
  readonly kind: CeshuHomeActionKind
  readonly labelKey: MessageKey
  /** 仅当 `showHomeActionDescriptions()` 为真时渲染（11px 次级墨副行） */
  readonly descriptionKey?: MessageKey
  /** 原生 tooltip 文案（可选） */
  readonly titleKey?: MessageKey
  readonly icon: LucideIconName
  readonly testId: string
  /** 全局 busy 期间是否禁用；滚动锚点始终可点 */
  readonly busySensitive: boolean
}

/** 内置门与锚点；顺序即渲染顺序。 */
export const CESHU_HOME_ACTIONS: readonly CeshuHomeActionDef[] = [
  {
    id: 'blank',
    kind: 'guide',
    labelKey: 'home.newBlank',
    descriptionKey: 'home.descNewBlank',
    icon: 'plus',
    testId: 'home-new-blank',
    busySensitive: true
  },
  {
    id: 'copy',
    kind: 'guide',
    labelKey: 'home.copyFromExisting',
    descriptionKey: 'home.descCopy',
    icon: 'file-text',
    testId: 'home-new-copy',
    busySensitive: true
  },
  {
    id: 'clone',
    kind: 'guide',
    labelKey: 'home.cloneOpen',
    descriptionKey: 'home.descClone',
    titleKey: 'home.cloneOpenTitle',
    icon: 'sparkles',
    testId: 'home-clone-open',
    busySensitive: true
  },
  {
    id: 'folder',
    kind: 'guide',
    labelKey: 'home.openFolder',
    descriptionKey: 'home.descOpenFolder',
    titleKey: 'home.openFolderTitle',
    icon: 'folder',
    testId: 'home-open-folder',
    busySensitive: true
  },
  {
    id: 'library',
    kind: 'anchor',
    labelKey: 'home.all',
    icon: 'book-open',
    testId: 'home-browse-library',
    busySensitive: false
  }
]

/** 参与描述阈值的「门」；锚点不计入（dsh 的 files 固定卡同理）。 */
export function homeGuideActions(
  registry: readonly CeshuHomeActionDef[] = CESHU_HOME_ACTIONS
): readonly CeshuHomeActionDef[] {
  return registry.filter((action) => action.kind === 'guide')
}

/** dsh `visibleEntries.length <= MAX_DESCRIBED_ENTRIES`。 */
export function showHomeActionDescriptions(
  guideCount: number,
  max: number = MAX_DESCRIBED_HOME_ACTIONS
): boolean {
  return guideCount <= max
}
