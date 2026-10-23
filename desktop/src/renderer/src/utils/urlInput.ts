/**
 * 浏览器面板地址栏输入归一化（纯函数，可单测）。
 *
 * 四种输入形态：
 * 1. 带协议（`http://`/`https://`/`file://`）→ 原样；
 * 2. `localhost:端口` / `127.0.0.1:端口` → 补 `http://`（本地 dev 服务场景）；
 * 3. 盘符路径（`C:\...`）或 POSIX 路径（`/...`）→ 转 `file:///`（本地 HTML Demo）；
 * 4. 其余（裸域名，如 `example.com`）→ 补 `https://`。
 *
 * 刻意不做「猜你是不是想搜索」——地址栏就是地址栏，搜索请去浏览器标签页之外的世界。
 */

const HOME_HINT = 'about:blank'

export function normalizeUrlInput(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '') return HOME_HINT
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed
  if (/^localhost[:/]|^127\.0\.0\.1[:/]/i.test(trimmed)) return `http://${trimmed}`
  if (/^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    const normalizedPath = trimmed.replace(/\\/g, '/')
    // 盘符路径要 file:///C:/...（三斜杠）；POSIX 路径的前导斜杠已在路径里
    return normalizedPath.startsWith('/') ? `file://${normalizedPath}` : `file:///${normalizedPath}`
  }
  return `https://${trimmed}`
}
