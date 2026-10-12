import { bucketize } from './util/dataBuckets'
import type { DataTypeDef, ItemRecord } from './types'

/**
 * 策划书「游戏数据预览」—— 把全库数据摊成 JSON 文本（对齐 Python
 * `src/features/engine_export.py::show_game_data_preview`）。
 *
 * PyQt 侧那份是：只读 `QTextEdit` + `json.dumps(raw, ensure_ascii=False, indent=2, default=str)`，
 * 超 50000 字符截断并追加「…(数据过长，仅显示前 50000 字符，共 N 字符)」。
 *
 * 与 PyQt 的两处差异（都写明理由）：
 * - **不做 50000 字符截断**：那是 Qt 单个 `QTextEdit` 的现实约束；TS 侧是 `<pre>`，
 *   浏览器渲染几十万字没问题。截断反而让用户看不到自己数据的全貌。仍保留 `totalChars`
 *   供 UI 显示规模，**超长时在 UI 上明确告知已渲染全量**。
 * - **键序 = 有数据的类型按字典序**：PyQt 直接倾倒 `data_manager.data`（插入序，不稳定）。
 *   预览是给人看的，稳定顺序更可读；且**空桶不出现**（PyQt 会留一堆空数组）。
 */

/** 预览文本的统计信息（给 UI 展示规模用） */
export interface GameDataPreview {
  /** 摊平后的 JSON 文本（缩进 2、不转义非 ASCII —— 与 `json.dumps(ensure_ascii=False, indent=2)` 对齐） */
  text: string
  /** 出现的类型桶数（有数据的） */
  bucketCount: number
  /** 条目总条数 */
  itemCount: number
  /** 文本字符数（中文按 1 字符计，与 Python `len(str)` 一致） */
  totalChars: number
}

export function buildGameDataPreview(records: ItemRecord[], types: DataTypeDef[]): GameDataPreview {
  const buckets = bucketize(records, types)
  // 字典序输出 + 丢空桶：预览是给人看的，稳定顺序更可读
  const payload: Record<string, Record<string, unknown>[]> = {}
  for (const key of [...buckets.keys()].sort()) {
    const rows = buckets.get(key) ?? []
    if (rows.length > 0) payload[key] = rows
  }
  const text = JSON.stringify(payload, null, 2)
  return {
    text,
    bucketCount: Object.keys(payload).length,
    itemCount: records.length,
    totalChars: text.length
  }
}
