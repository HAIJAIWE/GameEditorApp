import { ECONOMY_SCHEMA } from '../ceshuSchema/economy'
import { toFieldHints } from '../ceshuSchema/types'

/**
 * 第六章·经济系统设计的字段契约（档 4 合并兼容层，2026-10-24）。
 *
 * 真实数据已迁入 `ceshuSchema/economy.ts`（契约内联在字段 def 上），此处仅做
 * re-export，保证 `ceshuFields.ts` 的合并点零改动。全部章节迁完后本文件会被删除。
 */
export const ECONOMY_FIELD_HINTS = toFieldHints(ECONOMY_SCHEMA)
