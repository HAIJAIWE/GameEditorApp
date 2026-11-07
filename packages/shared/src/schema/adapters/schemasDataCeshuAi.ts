/**
 * `schemasData` 拆分件：**策划书 AI 生成**（整章 / 单字段 / 候选数据）。
 *
 * 文档本体见 `schemasDataCeshu.ts`，报告导出见 `schemasDataCeshuReports.ts`。
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

import { FIELD_ACTIONS } from '../../ceshu/fields'

export const ceshuAiGenerateInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  onlyEmpty: z.boolean().default(false),
  /** 一键生成上下文：draft 仅合并进提示词作为上下文，不写盘 */
  fullGenerate: z
    .object({
      styleKey: z.string().max(50).default(''),
      extraPrompt: z.string().max(6000).default(''),
      draft: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
      /**
       * 本次整篇生成的章顺序（渲染层 plan.order 原样下发）。
       * 前文要点据此取「本次已生成」的前序章，而不是按章表顺序（两者并不一致，
       * 见 docs/game-audit.md P0-1）。缺省 = 回退原有章表顺序行为。
       */
      generationOrder: z.array(z.string()).max(64).optional()
    })
    .optional(),
  /**
   * 大范围调用（一键生成 / 批量）的用户确认标志（v0.5 DD-17）。
   * 主进程判定需要确认时会**拒绝并给出中文原因**，渲染层确认后**带 `confirmed: true` 重发**，
   * 与 `main/agent/dispatcher.ts` 的 `dangerConfirmed` 同一模式。
   * **刻意用 `optional` 而非 `default`**：契约类型取的是 `z.infer`（输出类型），
   * 用 `default` 会逼所有既有调用点补传该字段。
   */
  confirmed: z.boolean().optional()
})

/** 按字段 AI 生成：单字段定向生成，非整章。
 *  `action` 为局部重生成动作（停靠栏快捷操作），缺省 = 重新起草该字段 */
export const ceshuAiGenerateFieldInputSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  field: z.string().min(1),
  action: z.enum([...FIELD_ACTIONS]).optional()
})

export type CeshuAiGenerateFieldInput = z.infer<typeof ceshuAiGenerateFieldInputSchema>

/** AI 生成候选游戏数据（数值/系统章作为设定 → 候选 → 人工导入） */
export const ceshuDataGenInputSchema = z.object({
  id: z.string().min(1),
  dataTypes: z.array(z.string().max(50)).max(30).default([]),
  count: z.number().int().min(1).max(20).default(5),
  instruction: z.string().max(500).default(''),
  /** 批量超过阈值时的用户确认标志（v0.5 DD-17，同 `ceshuAiGenerateInputSchema.confirmed`） */
  confirmed: z.boolean().optional()
})

export type CeshuAiGenerateInput = z.infer<typeof ceshuAiGenerateInputSchema>
export type CeshuDataGenInput = z.infer<typeof ceshuDataGenInputSchema>
