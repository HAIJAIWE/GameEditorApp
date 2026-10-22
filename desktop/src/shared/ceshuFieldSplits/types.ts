/**
 * 字段**结构拆分配置**的按章分文件存放处（P1：2026-10-23 拆解第二批 textarea）。
 *
 * ## 拆的是什么
 * 体检时 59% 的字段是开放式 textarea——AI 按格生成容易「又长又空」，人按格审
 * 也难以逐条核对。已跑通的模式（`core_loop` / `damage_formula`）是**三件套**：
 * 本体保留概述，另加 `xxx_points`（stringList，可逐条核对的要点）与
 * `xxx_notes`（textarea，补充说明）。
 *
 * 拆分配置只列「要拆的字段 key」，配套字段由 `ceshuFields.ts` 导出时自动插入——
 * 和 hints 一样的思路：纯数据改动按章分文件，结构生成逻辑只有一份。
 *
 * ## 不拆什么（守卫测试锁定）
 * - 必填字段：拆分后本体/要点谁是必填会改变校验语义，风险大于收益
 * - 人定字段（aiDraftable=false）：AI 不起草，人自己写长文不需要拆
 * - `xxx_notes`：它本身已是拆分产物，再拆会出 `xxx_notes_points` 这种荒谬键
 * - 点路径字段（如 `user_personas.primary`）：配套键会落进嵌套对象，容易误判
 */

/** 单章的结构拆分清单：要拆成「本体 + 要点 + 补充」三件套的字段 key */
export type ChapterFieldSplits = readonly string[]
