import { ECONOMY_SCHEMA } from '../ceshuSchema/economy'

/**
 * 第六章·经济系统设计的结构拆分清单（档 4 合并兼容层，2026-10-24）。
 *
 * 真实数据已迁入 `ceshuSchema/economy.ts`，此处仅做 re-export。全部章节迁完后删除。
 */
export const ECONOMY_FIELD_SPLITS = ECONOMY_SCHEMA.splits
