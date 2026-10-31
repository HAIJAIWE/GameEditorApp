/**
 * `schemasData` 拆分件：**图像**——AI 生图（云图像 API 客户端）+ 图片库扫描/清理/按路径读图。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/* ---- AI 生图（features/_ai_image 能力缺口补齐：云图像 API 客户端） ---- */

/** 生图 provider 配置 */
export const imageGenConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['openai', 'qwen', 'doubao', 'generic']),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  modelOverrides: z
    .object({
      image: z
        .object({
          model: z.string().optional(),
          apiKey: z.string().optional(),
          baseUrl: z.string().optional()
        })
        .optional()
    })
    .optional()
})

/** 生图请求：配置 + 提示词 + 落盘目录（+ 可选文件名） */
export const imageGenInputSchema = z.object({
  config: imageGenConfigSchema,
  prompt: z.string().min(1),
  saveDir: z.string().min(1),
  filename: z.string().optional()
})

export type ImageGenInput = z.infer<typeof imageGenInputSchema>

/**
 * 按路径读取图片（供「已保存的图片路径」回显预览）。
 * **刻意不收任意绝对路径**：主进程只允许读「当前库 images 目录」内的文件，
 * 越界一律拒绝 —— 渲染层永远不该有能力指定任意本地文件被读进内存。
 */
export const imageReadByPathInputSchema = z.object({
  path: z.string().min(1).max(1000)
})

export type ImageReadByPathInput = z.infer<typeof imageReadByPathInputSchema>

/* ---- 图片库扫描 / 清理（迁移 `features/advanced::cleanup_unused_images`） ---- */

/**
 * 物理删除图片。**破坏性操作**：`confirm` 必须为 `true`。
 *
 * 主进程会**再跑一次差集复核**才动手 —— 不只信渲染层传来的 `paths`。
 * 理由：渲染层算的是「扫描那一刻」的未引用集合，用户可能在此期间改了数据。
 */
export const deleteImagesInputSchema = z.object({
  paths: z.array(z.string().min(1)),
  /** 破坏性操作的显式确认位；缺失或 false 时主进程直接拒绝 */
  confirm: z.literal(true)
})

export type DeleteImagesInput = z.infer<typeof deleteImagesInputSchema>
