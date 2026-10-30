/**
 * 纯工具：把任意值安全转成字符串（非字符串 → ''）。
 *
 * 分层归属：`shared/util/` —— 不依赖任何业务域，main / renderer / 任意 domain 均可 import。
 * 收敛自各业务域内重复的本地 `readText` 定义（共 7 处，实现完全一致）。
 */
export function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
