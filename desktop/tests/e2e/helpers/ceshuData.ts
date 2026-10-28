import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Locator, type Page } from '@playwright/test'

/**
 * 「进入数据编辑器」共享工具（新 IA）。
 *
 * 背景：顶层数据表视图已下线，数据编辑内嵌在策划书编辑器右半的预览面板
 * （`CeshuDataPreview` + `DataEditorTab`）。预览面板的标签**不是**内置数据类型列表，
 * 而是「已启用游戏系统」列表：`computeEnabledEditors(doc)` 由 `doc.systems` 派生。
 * 而 `createDefaultChapters()` 生成的 13 个系统默认全部 `enabled:false`，故新策划书
 * 打开后预览区是空态、一个标签都没有。
 *
 * 另一个关键事实（决定了本 helper 的存在）：`systems[k].data_type` 缺省时**回退为系统 key**
 * （`ceshuModel.computeEnabledEditors` / `main/ceshu/dataSync.ts::collectEnabledTypes`），
 * 而系统 key（character/equipment/quest…）与内置类型 id（role/equip/task…）**仅 skill / item 重合**。
 * 若只启用「角色」系统，会得到一个 `data_type='character'` 的**全新空类型**，而不是既有的 `role`。
 * 因此本 helper 的播种 API 一律**显式指定 `dataType`**，把任意内置类型挂到预览标签上。
 *
 * 实现策略：在启动应用**之前**，直接往初始库的 ceshu 目录落盘一份策划书 JSON
 * （`systems` 已按需启用并绑定 `data_type`）。启动后该文档即出现在首页卡片中，
 * 点击卡片进入编辑器，预览面板便出现对应标签。走磁盘播种而非 IPC，是因为
 * 「当前打开的策划书」是渲染层 state（`activeCeshuId` + `ceshuHomeVisible`），
 * 纯 IPC 建文档不会让 UI 切过去；而磁盘播种 + 首页点卡片是纯 UI 路径，最稳。
 *
 * 只依赖 `@playwright/test` 与 `node:*`，不 import `src/main` / `src/preload`。
 */

/**
 * 初始库名。与 `src/main/library/store.ts::INITIAL_LIBRARY_NAME` 对齐；
 * 因 helper 不得 import src/main，此处内联常量（若主进程改名需同步）。
 */
export const INITIAL_LIBRARY_NAME = '初始库'

/** 一个「系统 → 数据类型」播种项 */
export interface SeedSystem {
  /** systems 字典键（策划书内部 key，任意合法标识符；仅作标识，与标签/类型解耦） */
  key: string
  /** 预览面板标签文字（= 系统显示名，对应 `SYSTEM_LABELS`） */
  label: string
  /** 目标数据类型 id（内置类型，如 role / job / monster / equip / skill / talent） */
  dataType: string
  /** 是否启用；默认 true */
  enabled?: boolean
  /**
   * 系统 `config`（可选，默认 `{}`）。
   * 数量约束 spec 用它写上限字段（`count` / `<dataType>_count` / `max_count` / `total_count`）——
   * 见 `src/shared/dataCountConstraint.ts::countLimitFieldNames`。
   */
  config?: Record<string, unknown>
}

export interface SeedCeshuOptions {
  /** 首页卡片标题（写入 `meta.game_name`） */
  title: string
  /** 需要启用的系统及其绑定的数据类型 */
  systems: SeedSystem[]
  /** 策划书 id；默认固定值，便于多次播种互不冲突 */
  id?: string
  /** 术语风格 id（可选，写入 doc.style） */
  style?: string
  /**
   * `meta.system_confirmed`（可选，默认 **true**）。
   * 传 `false` 才会让打开该策划书时自动弹出「确认游戏系统」对话框
   * 。
   */
  systemConfirmed?: boolean
}

/** 策划书磁盘目录：`<userData>/libraries/<初始库>/ceshu`（与 `stores.ts` 的构造一致） */
export function ceshuStorageDir(userDataDir: string): string {
  return join(userDataDir, 'libraries', INITIAL_LIBRARY_NAME, 'ceshu')
}

/**
 * 落盘一份已启用指定系统的策划书 JSON，返回其 id。
 * 必须在 `launchApp` **之前**调用（应用启动时读取）。
 */
export function seedCeshu(userDataDir: string, options: SeedCeshuOptions): string {
  const id = options.id ?? 'e2e00001'
  const systems: Record<string, unknown> = {}
  for (const system of options.systems) {
    systems[system.key] = {
      enabled: system.enabled !== false,
      name: system.label,
      data_type: system.dataType,
      config: system.config ?? {}
    }
  }
  const now = '2026-01-01 00:00:00'
  const doc = {
    version: '5.0',
    ceshu_id: id,
    created_at: now,
    updated_at: now,
    parent_id: '',
    version_label: 'v1.0',
    is_active: true,
    style: options.style ?? '',
    meta: {
      game_name: options.title,
      game_type: '',
      gdd_scope: 'full',
      status: 'draft',
      /**
       * 默认 `true`：播种文档视为「已确认过游戏系统」，打开时**不**自动弹确认对话框
       * 。
       * 17 个既有 spec 都靠播种进入编辑器，默认 true 才不会被弹窗打断；
       * 需要测自动弹窗的 spec 显式传 `systemConfirmed: false`。
       */
      system_confirmed: options.systemConfirmed !== false
    },
    systems
  }
  mkdirSync(ceshuStorageDir(userDataDir), { recursive: true })
  writeFileSync(join(ceshuStorageDir(userDataDir), `${id}.json`), JSON.stringify(doc, null, 2), 'utf-8')
  return id
}

/** 预览面板中某个系统的数据编辑器标签 locator */
export function previewTab(window: Page, label: string): Locator {
  return window.getByTestId('ceshu-preview-tab').filter({ hasText: label })
}

/** 当前预览面板里的条目行 locator（对应 `DataEditorTab` 的 `ceshu-data-item-row`） */
export function dataRows(window: Page): Locator {
  return window.getByTestId('ceshu-data-item-row')
}

/**
 * 在首页点开某份策划书卡片，进入编辑器，并等到工具栏返回按钮出现（编辑器就绪锚点）。
 */
export async function openCeshuFromHome(window: Page, title: string): Promise<void> {
  const card = window.getByTestId('home-card').filter({ hasText: title })
  await expect(card, `首页未找到标题为「${title}」的策划书卡片（seedCeshu 是否在启动前写入？）`).toBeVisible()
  await card.getByTestId('home-card-open').click()
  await expect(window.getByTestId('ceshu-back'), `打开策划书「${title}」后编辑器未就绪`).toBeVisible()
}

/**
 * 打开某个系统对应的数据编辑器标签（点击预览面板标签）。
 * 标签文字 = 播种时的 `label`。
 */
export async function openDataEditor(window: Page, label: string): Promise<void> {
  /*
   * 数据栏**默认收起**（工作流以「AI 生成 → 人扫一遍」为主，审阅时数据栏只是噪音）。
   * 需要数据编辑器时先把它展开 —— 收敛在这一处，避免每个规格各写一遍。
   *
   * ⚠️ 全量跑时出现过偶发失败：上一步刚关闭浮层，工具栏按钮可能还没就位就查了
   * `aria-pressed`，于是「以为已展开」而跳过点击。改成先等按钮可见、点完再等面板出现，
   * 每一步都有确定的前置条件，不依赖「点完大概就绪了」。
   */
  const toggle = window.getByTestId('ceshu-preview-toggle')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-pressed')) === 'false') {
    await toggle.click()
    await expect(window.getByTestId('ceshu-preview')).toBeVisible()
  }
  const tab = previewTab(window, label)
  await expect(tab, `预览面板未出现系统「${label}」的数据编辑器标签（该系统是否已启用？）`).toBeVisible()
  await tab.click()
}

/**
 * 在当前数据编辑器里「新建」一条条目（对应 `DataEditorTab` 的新建按钮），
 * 新建后该条目会被自动选中，右侧条目表单即渲染出来。
 */
export async function createDataItem(window: Page): Promise<void> {
  await window.getByTestId('ceshu-data-create').click()
}

/** 顶部菜单栏的 5 个菜单名（与 `MenuBar.tsx::MENU_TITLE_TESTIDS` 同序同义） */
export type MenuName = 'file' | 'edit' | 'tools' | 'settings' | 'help'

/**
 * 展开顶部菜单 → 点击菜单项。
 *
 * `MenuBar.tsx` 的事实：菜单项**只在对应下拉展开时才存在于 DOM**
 * （`{openIndex === idx && <div className="menu-dropdown">…}`），且 `run()` 点击后立即
 * `setOpenIndex(null)` 收起并重新挂载——故每次动作都必须先点菜单标题展开一次。
 * 子菜单（导入/导出/数据分析）的条目在父菜单展开时是**内联渲染**的，无需额外 hover 展开。
 *
 * @param action 菜单项的 action 名（`menuitem-<menu>-<action>` 的后半段），如 `advancedSearch`
 */
export async function openMenuItem(window: Page, menu: MenuName, action: string): Promise<void> {
  await window.getByTestId(`menu-title-${menu}`).click()
  await window.getByTestId(`menuitem-${menu}-${action}`).click()
}

/** 通过渲染层 IPC 读取某类型的全部条目（批量/统计等 spec 回读数据层用） */
export async function readItems(
  window: Page,
  type: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  return window.evaluate(
    async (targetType: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              listItems: (req: { type: string }) => Promise<Array<{ id: string; data: Record<string, unknown> }>>
            }
          }
        }
      ).mbApi
      return api.data.listItems({ type: targetType })
    },
    type
  )
}
