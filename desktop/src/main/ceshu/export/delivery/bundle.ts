/**
 * 双轨导出·机读轨的 main 侧入口。
 *
 * 纯逻辑（类型、组装、序列化）已移至 `shared/ceshuBundle.ts` —— 它的消费者有两端
 * （主进程落盘 + shared 的消费提示词生成），放 shared 才能共用同一份结构定义。
 * 本文件只保留转发，让 `main/ceshu/export/*` 的既有导入路径继续可用。
 */
export {
  CESHU_BUNDLE_SCHEMA,
  buildCeshuBundle,
  renderCeshuBundleJson,
  type BuildBundleOptions,
  type CeshuBundle,
  type CeshuBundleChapter,
  type CeshuBundleField
} from '../../../../shared/ceshu/workflow/ceshuBundle'
