/**
 * IPC 请求 schema（仅主进程导入，用于入口运行时校验）。
 * 注意：本文件包含 zod 运行时依赖，不要被 preload 直接导入。
 *
 * 纯定义层（zod schema 与类型别名）已拆分至 `schemasData.ts`。
 * 本文件仅作再导出桶，所有现有 `import { ... } from './schemas'` 站点保持不变。
 */

export * from '../adapters/schemasData'
