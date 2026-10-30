/**
 * 纯工具：本地时间戳格式化。
 *
 * 分层归属：`shared/util/` —— 不依赖任何业务域，main / renderer / 任意 domain 均可 import。
 *
 * 历史说明：本函数原定义在 `shared/ceshu/model/ceshuModel.ts`（ceshu 业务域），导致
 *   - `shared/agent/session.ts` → `ceshuModel`（agent → ceshu 跨业务域违规）
 * 为消除该跨域边而迁至此处。`ceshuModel` 保留 re-export 以兼容既有 40+ 处调用方。
 */

/** 本地时间字符串（与 早期版本 ceshu_model 一致：YYYY-MM-DD HH:mm:ss，非 ISO） */
export function formatLocalTimestamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
