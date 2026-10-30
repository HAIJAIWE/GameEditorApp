import { createContext, useContext, type ReactNode } from 'react'

import type { CeshuDocument, ChapterKey } from '../../../shared/ceshu/reference/ceshuConstants'
import type { CeshuChangelog } from '../../../shared/ceshu/workflow/ceshuDiff'
import type { FieldReviewStatus } from '../../../shared/ceshu/fields/ceshuFieldStatus'
import type { CeshuPatchItem } from '../../../shared/ceshu/data/ceshuImportPatch'
import type { CeshuReadinessReport } from '../../../shared/ceshu/readiness/ceshuReadiness'
import type { DataTypeDef } from '../../../shared/types'

/**
 * 编辑器（CeshuView）向**内部视图**下发的上下文。
 *
 * 为什么需要它：挂载在编辑器上的 view（开发路线 / 体检 / 影响面 / 版本对比 / 时间线 / 各报告面板…）
 * 需要**当前文档**与编辑器级能力（类型列表、切换版本、报告数据、应用回调、导出、跳转），
 * 而这些都是 CeshuView 的 state / props，不在宿主里。view 又不能走 `panel` 的打开参数
 * （`doc` 是活对象、每次编辑都变），故由 `ViewMount` 把上下文放进 context，
 * 绑定组件用 `useCeshuView()` 取——与 `useAppContext()` 同一思路，只是作用域在编辑器内。
 */
export const CESHU_VIEW_MOUNT = 'ceshu.overlay'
export const CESHU_CONTENT_MOUNT = 'ceshu.content'
/** 工具栏下的内联弹层（派生新版本）挂载点 */
export const CESHU_TOOLBAR_MOUNT = 'ceshu.toolbar'
/** 章节列表旁的内联气泡（系统模块勾选）挂载点 */
export const CESHU_CHAPTERNAV_MOUNT = 'ceshu.chapterNav'
/** 左栏「产出物」页签（原型/数据/任务）的内容挂载点 */
export const CESHU_ARTIFACT_MOUNT = 'ceshu.artifact'

export interface CeshuViewContextValue {
  /** 当前文档（活对象，随编辑更新） */
  doc: CeshuDocument
  /** 全部数据类型定义（数据引用等视图需要） */
  types: readonly DataTypeDef[]
  /** 切换当前策划书（版本时间线「切到某版本」用；来自 App 的 handleOpenCeshu） */
  onSelect: (id: string) => void
  /** 书名（AI 审阅 / 模板编辑器需要） */
  gameName: string
  /** 当前章节（模板编辑器需要） */
  currentChapter: ChapterKey

  /** 报告数据：由菜单命令先取好，再打开对应视图 */
  changelog: CeshuChangelog | null
  validateErrors: string[]
  readiness: CeshuReadinessReport | null

  /** 编辑器是否忙（浮层按钮据此禁用） */
  busy: boolean
  /** 执行字段迁移（迁移预览浮层的「执行迁移」） */
  onRunMigration: () => void
  /** 批量接受所有待审字段（审阅队列的「全部接受」） */
  onApproveAllPending: () => void
  /** 标记某字段的审阅状态（审阅队列的「接受」） */
  onFieldStatus: (chapter: ChapterKey, updates: Record<string, FieldReviewStatus>) => void
  /** 应用导入补丁（导入浮层的「应用」）；返回是否成功 */
  onApplyImport: (changed: CeshuPatchItem[]) => Promise<boolean>
  /** 派生新版本（工具栏弹层的「确认派生」） */
  onDerive: (note: string) => void
  /** 勾选/取消系统模块（章节列表旁气泡） */
  onToggleModule: (module: ChapterKey, enabled: boolean) => void
  /** 产出物面板回传改后的文档（原型 / 岗位任务） */
  onDocUpdated: (next: CeshuDocument) => void
  /** 数据面板新建/改动类型（刷新宿主类型列表） */
  onTypesChanged: (types: DataTypeDef[]) => void
  /** 数据面板「AI 生成缺失数据」：带上目标打开 AI 数据生成视图 */
  onGenerateData: (target: { typeId: string | null; count?: number; instruction?: string }) => void

  /** 子面板把「应用后」的文档回传给编辑器（AI 生成 / 模板 / 预设 / 系统确认） */
  onAiApplied: (updated: CeshuDocument, chapters: readonly ChapterKey[]) => void
  onTemplateApplied: (updated: CeshuDocument, chapter: ChapterKey) => void
  onPresetApplied: (updated: CeshuDocument, enabledCount: number, presetLabel: string) => void
  onSystemConfirmed: (updated: CeshuDocument, enabledCount: number, addedCustom: number) => void

  /** 导出动作（报告面板头部按钮） */
  onExportChangelog: (format: 'md' | 'html' | 'text') => void
  onExportValidation: () => void
  onExportReadiness: () => void

  /** 跳转（校验 / 完备度面板里的「去修」） */
  onJumpChapter: (chapter: ChapterKey) => void
  onJumpField: (chapter: ChapterKey, field: string) => void
}

const CeshuViewContext = createContext<CeshuViewContextValue | null>(null)

export function CeshuViewProvider({
  value,
  children
}: {
  value: CeshuViewContextValue
  children: ReactNode
}) {
  return <CeshuViewContext.Provider value={value}>{children}</CeshuViewContext.Provider>
}

export function useCeshuView(): CeshuViewContextValue {
  const ctx = useContext(CeshuViewContext)
  if (ctx === null) {
    throw new Error('useCeshuView 必须在 ViewMount 子树内使用')
  }
  return ctx
}
