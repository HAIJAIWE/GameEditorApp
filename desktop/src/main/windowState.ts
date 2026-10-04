import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 窗口状态持久化（迁移 Python `ui/window_state.py::WindowStateManager` 的
 * `save_ui_state` / `restore_ui_state` 几何部分）。
 *
 * ## 迁了什么 / 没迁什么（逐字段对照，勿按名字臆测）
 * Python `save_ui_state` 落盘的字段：
 *
 * | Python 字段 | TS 处理 | 原因 |
 * |---|---|---|
 * | `window_x/y/w/h`        | ✅ 迁 | Electron `BrowserWindow.getBounds/setBounds` |
 * | `is_maximized`          | ✅ 迁 | `isMaximized()` / `maximize()` |
 * | `last_tab_index`        | ✅ 迁 | TS 有模式态（data/ceshu/digital），记最后模式 |
 * | `theme`                 | ⛔ 不迁 | TS 无多主题（见审计 E24：`themes.py` 1,097 行 86% 是 Qt QSS，判定不迁） |
 * | `layout_mode`           | ⛔ 不迁 | Python 硬编码 `"three_column"`，**常量无信息** |
 * | `splitter_ratio`        | ⛔ 不迁 | TS 侧栏是 CSS Grid，**无 QSplitter 等价物**，无处存 |
 * | `auto_save_enabled/interval` | ⛔ 不迁 | Python 特有语义；TS 的自动保存是**条目级即时落库**（`DataService`），无此机制 |
 *
 * `has_unsaved_changes` / `compute_data_hash` / `check_data_changed` **不迁**：
 * 读源码确认 Python 用 `data_manager._data_version` 与 `_saved_version` 比对判脏，
 * 而 TS 侧每次保存都直接落 SQLite（`main/data/service.ts` 串行写队列），
 * **不存在内存脏状态**，这套机制在 TS 是无源之水。
 *
 * 有意偏离：
 * - Python 直接 `write_text`；这里用**原子写**（tmp + rename），与本仓其它落盘一致。
 * - 恢复时**校验尺寸合法性**（下界 480×360），避免坏文件把窗口缩成不可用大小。
 */

/** 窗口几何 + 末态模式 */
export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
  /** 最后停留的模式：`data` / `ceshu` / `digital`；缺省 `data` */
  lastMode: string
}

/** 文件格式版本（将来加字段时用于迁移） */
export const WINDOW_STATE_VERSION = 1

export const WINDOW_STATE_FILENAME = 'window-state.json'

/** 默认几何（对齐 Python restore 的默认值：1200×800，位置 100/50） */
export const DEFAULT_WINDOW_STATE: WindowState = {
  x: 100,
  y: 50,
  width: 1200,
  height: 800,
  maximized: false,
  lastMode: 'data'
}

/** 最小可用尺寸（低于此值视为坏数据，回落默认；与 BrowserWindow 的 minWidth/minHeight 同量级） */
const MIN_WIDTH = 480
const MIN_HEIGHT = 360

/** 屏幕上界保护：超过此值视为坏数据（多显示器拔掉后留下的旧坐标） */
const MAX_DIMENSION = 10000

function toFiniteInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.round(value)
}

function clampDim(value: unknown, fallback: number, min: number): number {
  const n = toFiniteInt(value, fallback)
  if (n < min || n > MAX_DIMENSION) {
    return fallback
  }
  return n
}

function clampCoord(value: unknown, fallback: number): number {
  const n = toFiniteInt(value, fallback)
  if (n < -MAX_DIMENSION || n > MAX_DIMENSION) {
    return fallback
  }
  return n
}

/**
 * 把任意 JSON 解析为合法 `WindowState`（逐字段校验 + 回落默认，**不抛**）。
 * 尺寸/坐标缺失、类型不对、越界、JSON 损坏 → 逐项回落，不整体丢弃。
 */
export function normalizeWindowState(value: unknown): WindowState {
  if (typeof value !== 'object' || value === null) {
    return { ...DEFAULT_WINDOW_STATE }
  }
  const raw = value as Record<string, unknown>
  return {
    x: clampCoord(raw.x, DEFAULT_WINDOW_STATE.x),
    y: clampCoord(raw.y, DEFAULT_WINDOW_STATE.y),
    width: clampDim(raw.width, DEFAULT_WINDOW_STATE.width, MIN_WIDTH),
    height: clampDim(raw.height, DEFAULT_WINDOW_STATE.height, MIN_HEIGHT),
    maximized: raw.maximized === true,
    lastMode: typeof raw.lastMode === 'string' && raw.lastMode !== '' ? raw.lastMode : DEFAULT_WINDOW_STATE.lastMode
  }
}

/** 状态文件绝对路径 */
export function windowStatePath(userDataDir: string): string {
  return join(userDataDir, WINDOW_STATE_FILENAME)
}

/**
 * 读状态；文件不存在/JSON 损坏 → 返回 null（调用方用默认几何创建窗口）。
 * 与 Python `if not self._state_file.exists(): return` 的语义一致。
 */
export function readWindowState(userDataDir: string): WindowState | null {
  const file = windowStatePath(userDataDir)
  if (!existsSync(file)) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    return normalizeWindowState(parsed)
  } catch {
    // 损坏 → 当作没有状态（Python 是记 warning 后用默认值，等价）
    return null
  }
}

/**
 * 写状态（**原子写**：tmp + rename，避免崩溃留半截 JSON）。
 * @returns 是否成功（失败不抛，仅返回 false 供调用方记日志）
 */
export function writeWindowState(userDataDir: string, state: WindowState): boolean {
  const file = windowStatePath(userDataDir)
  const temp = `${file}.tmp`
  const payload = JSON.stringify({ version: WINDOW_STATE_VERSION, ...normalizeWindowState(state) }, null, 2)
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(temp, payload, 'utf-8')
    renameSync(temp, file) // 原子替换（同盘 rename）
    return true
  } catch {
    try {
      rmSync(temp, { force: true })
    } catch {
      // 清理失败不影响主流程
    }
    return false
  }
}
