/**
 * 快速入门（引导式主页）纯逻辑 —— 迁移自 旧版 `ui/widgets/home_widget`（604 行）。
 *
 * ## 为什么单独成模块（零 React / 零 fs，可 Node 单测）
 * 旧版 的 `HomeWidget` 把「5 步引导 + 6 张快捷操作卡 + 数据概览卡」写死在一个 QWidget 里，
 * 引导完成度存一份 JSON 配置文件。TS 侧把**常量 + 状态读写 + 派生量**抽到 `shared/`，
 * 渲染组件（`OnboardingPanel.tsx`）只负责画卡片与派发动作 —— 这样引导逻辑能被单测覆盖。
 *
 * ## 与 旧版 的一致性
 * - `ONBOARDING_STEPS` / `QUICK_ACTIONS` 逐项照搬 旧版 常量（含 emoji、顺序、id、data_type）。
 * - 持久化三个键 `{collapsed, dismissed, completed}` 对齐 旧版 `_load_state` / `_save_state`，
 *   此处经 `shared/settingsStore`（键 `mb.onboarding`）落 localStorage。
 * - `STEPS_PER_ROW` / `STATS_PER_ROW` 与 旧版 同名常量一致。
 *
 * ## 与 旧版 的一处**有意差异**（更稳，不改语义）
 * 旧版 `_load_state` 遇到坏 JSON 只记 warning 后整体回退默认；此处用 `readJsonSetting`
 * 兜底后**逐字段校验**（布尔强制、`completed` 过滤到合法下标、去重、升序），
 * 使半损坏的状态也能安全恢复，而不是整块丢弃。
 */

import { readJsonSetting, removeSetting, writeJsonSetting, type StorageLike } from './settingsStore'

/** 单张引导步骤卡 */
export interface OnboardingStep {
  readonly id: string
  readonly icon: string
  readonly title: string
  readonly desc: string
}

/** 单张快捷操作卡 */
export interface QuickAction {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly desc: string
  /** 关联的数据类型（单数 id）；无则 `null`（如「批量创建」「查看关联」） */
  readonly dataType: string | null
}

/** 引导区持久化状态 */
export interface OnboardingState {
  /** 卡片区是否折叠（仅折叠卡片，标题行始终可见） */
  collapsed: boolean
  /** 用户是否点过「✕」关闭引导区（可通过菜单重新显示） */
  dismissed: boolean
  /** 已完成的步骤下标（合法范围 `0..ONBOARDING_STEPS.length-1`） */
  completed: number[]
}

/** 5 步引导 */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'onboarding_library', icon: '📁', title: '创建游戏库', desc: '管理你的游戏项目，每个库独立配置数据结构和类型' },
  { id: 'onboarding_types', icon: '📋', title: '定义数据类型', desc: '配置角色、技能、装备等数据类型的字段结构' },
  { id: 'onboarding_data', icon: '✏️', title: '编辑游戏数据', desc: '在表格中增删改查游戏配置数据' },
  { id: 'onboarding_ceshu', icon: '📝', title: '撰写策划书', desc: '用结构化模板编写游戏设计文档' },
  { id: 'onboarding_ai', icon: '🤖', title: 'AI 辅助', desc: '使用 AI 生成数据、分析数值平衡' }
]

/** 6 张快捷操作卡 */
export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'create_role', label: '创建角色', icon: '⚔️', desc: '设计一个新的游戏角色', dataType: 'role' },
  { id: 'create_monster', label: '创建怪物', icon: '👹', desc: '设计一个新的敌人', dataType: 'monster' },
  { id: 'create_skill', label: '创建技能', icon: '✨', desc: '设计一个新的技能', dataType: 'skill' },
  { id: 'create_equip', label: '创建装备', icon: '🛡️', desc: '设计一件新装备', dataType: 'equip' },
  { id: 'batch_create', label: '批量创建', icon: '📦', desc: '使用模板批量生成数据', dataType: null },
  { id: 'view_relations', label: '查看关联', icon: '🔗', desc: '浏览数据之间的引用关系', dataType: null }
]

/** 渲染层设置键（登记在 `settingsStore.SETTINGS_KEYS` 里，纳入导出/重置可预期） */
export const ONBOARDING_STORAGE_KEY = 'mb.onboarding'

/** 引导卡片每行数量 */
export const STEPS_PER_ROW = 3

/** 数据概览卡每行数量 */
export const STATS_PER_ROW = 4

/** 默认（未开始）状态 */
export function defaultOnboardingState(): OnboardingState {
  return { collapsed: false, dismissed: false, completed: [] }
}

/**
 * 归一化完成度数组：仅保留合法下标（`0..ONBOARDING_STEPS.length-1` 的整数），
 * 去重并升序；非数组回退空数组。
 */
function normalizeCompleted(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<number>()
  for (const entry of value) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry < ONBOARDING_STEPS.length) {
      seen.add(entry)
    }
  }
  return [...seen].sort((a, b) => a - b)
}

/** 逐字段校验一个已解析对象（容错半损坏 JSON） */
function sanitizeOnboardingState(raw: unknown): OnboardingState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return defaultOnboardingState()
  }
  const candidate = raw as { collapsed?: unknown; dismissed?: unknown; completed?: unknown }
  return {
    collapsed: typeof candidate.collapsed === 'boolean' ? candidate.collapsed : false,
    dismissed: typeof candidate.dismissed === 'boolean' ? candidate.dismissed : false,
    completed: normalizeCompleted(candidate.completed)
  }
}

/** 读取状态（容错：键缺失 / 坏 JSON / 字段非法 → 逐字段回退默认） */
export function loadOnboardingState(storage?: StorageLike): OnboardingState {
  const raw = readJsonSetting<unknown>(ONBOARDING_STORAGE_KEY, null, storage)
  return sanitizeOnboardingState(raw)
}

/** 写入状态（storage 不可用则静默——不影响主流程） */
export function saveOnboardingState(state: OnboardingState, storage?: StorageLike): void {
  writeJsonSetting(ONBOARDING_STORAGE_KEY, state, storage)
}

/** 已完成的**合法**步骤数（越界/重复不计） */
function completedCount(state: OnboardingState): number {
  return normalizeCompleted(state.completed).length
}

/** 进度文案，如 `"2/5 已完成"` */
export function progressLabel(state: OnboardingState): string {
  return `${completedCount(state)}/${ONBOARDING_STEPS.length} 已完成`
}

/** 是否 5 步全部完成 */
export function isAllComplete(state: OnboardingState): boolean {
  return completedCount(state) === ONBOARDING_STEPS.length
}

/** 不可变地标记某步完成（下标越界 / 非整数 / 已存在 → 返回内容的副本，绝不改入参） */
export function withStepCompleted(state: OnboardingState, index: number): OnboardingState {
  if (!Number.isInteger(index) || index < 0 || index >= ONBOARDING_STEPS.length || state.completed.includes(index)) {
    return { ...state, completed: [...state.completed] }
  }
  return { ...state, completed: [...state.completed, index].sort((a, b) => a - b) }
}

/** 不可变地设置折叠态 */
export function withCollapsed(state: OnboardingState, value: boolean): OnboardingState {
  return { ...state, collapsed: value }
}

/** 不可变地设置关闭态 */
export function withDismissed(state: OnboardingState, value: boolean): OnboardingState {
  return { ...state, dismissed: value }
}

/** 清除持久化键并返回默认状态 */
export function resetOnboardingState(storage?: StorageLike): OnboardingState {
  removeSetting(ONBOARDING_STORAGE_KEY, storage)
  return defaultOnboardingState()
}
