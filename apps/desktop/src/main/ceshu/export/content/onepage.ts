/**
 * 一页摘要导出（main 侧入口）。
 *
 * 2026-11-07：实现已下沉到 `@mobai/shared/ceshu/export/onePage`（纯逻辑，渲染层也要用）。
 * 这里保留同名 re-export，`exporter.ts` / `markdown.ts` 的既有 import 路径零改动。
 */
export { renderOnePageSummary, renderCeshuOnePageMarkdown } from '@mobai/shared/ceshu/export/onePage'
