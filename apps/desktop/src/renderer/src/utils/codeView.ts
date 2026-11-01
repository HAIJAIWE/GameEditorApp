/**
 * 代码视图纯工具（高亮/过滤/排序/格式化）——零 React 零 fs，可单测。
 *
 * 刻意用**正则分词**而不是引第三方高亮库：本面板的定位是「看得清」
 * 而不是「IDE 级体验」（编辑、LSP、折叠都明确不做），为一个只读查看器引入
 * 百 KB 级依赖不划算。分词规则对齐各语言的注释/字符串/数字/关键字四类，
 * 认不出的原样输出——高亮是增强，不是正确性依赖。
 */

/** 代码面板可见的扩展名（白名单：目录树只列这些 + 常见配置文件） */
export const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'json', 'jsonc',
  'md', 'txt',
  'html', 'css', 'scss', 'less', 'svg',
  'py', 'lua', 'sh', 'bat', 'ps1',
  'yaml', 'yml', 'toml', 'xml', 'sql'
])

/** 目录树里常见的「值得展开」的目录（其余默认折叠由用户点开；不隐藏任何目录） */
export function isCodeFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return false
  return CODE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** 字节数的人读格式（1024 基准） */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 路径取文件名（兼容 / 与 \） */
export function baseNameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/** 路径取父目录（保留原路径的分隔符风格：正斜杠进、正斜杠出） */
export function dirNameOf(path: string): string {
  const separator = path.includes('/') && !path.includes('\\') ? '/' : '\\'
  const parts = path.split(/[\\/]/)
  parts.pop()
  return parts.join(separator) || parts[0] || ''
}

/** 目录条目排序：目录在前，其余按名称（本地化比较，大小写不敏感） */
export function sortEntries<T extends { name: string; isDir: boolean }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })
  })
}

/** 按扩展名猜语言族（只影响关键字表选择） */
function keywordFamily(ext: string): 'ts' | 'py' | 'web' | 'other' {
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'ts'
  if (ext === 'py') return 'py'
  if (ext === 'html' || ext === 'css' || ext === 'scss' || ext === 'less' || ext === 'svg' || ext === 'xml') return 'web'
  return 'other'
}

/**
 * `#` 是否为注释前缀的语言（py/sh/bat/ps1/yaml/toml）。
 * TS/JS 的 `#` 是私有字段（`#count`），当成注释会把字段名吞进注释色——
 * 故正则按语言族二选一，不是一条正则打天下。
 */
function hashCommentLangs(ext: string): boolean {
  return ext === 'py' || ext === 'sh' || ext === 'bat' || ext === 'ps1' || ext === 'yaml' || ext === 'yml' || ext === 'toml'
}

const KEYWORDS: Record<'ts' | 'py' | 'web' | 'other', ReadonlySet<string>> = {
  ts: new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
    'class', 'extends', 'new', 'await', 'async', 'type', 'interface', 'enum', 'implements', 'public',
    'private', 'protected', 'readonly', 'static', 'as', 'in', 'of', 'typeof', 'instanceof', 'null',
    'undefined', 'true', 'false', 'this', 'super', 'void', 'never', 'unknown', 'string', 'number', 'boolean'
  ]),
  py: new Set([
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'with',
    'try', 'except', 'finally', 'raise', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'in',
    'is', 'pass', 'break', 'continue', 'yield', 'async', 'await', 'self'
  ]),
  web: new Set([
    'div', 'span', 'class', 'id', 'style', 'href', 'src', 'width', 'height', 'viewBox', 'fill',
    'stroke', 'xmlns', 'color', 'background', 'margin', 'padding', 'display', 'flex', 'none'
  ]),
  other: new Set()
}

export type TokenKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword'

export interface CodeToken {
  text: string
  kind: TokenKind
}

/*
 * 单一组合正则，按「注释 → 字符串 → 数字 → 标识符」优先级匹配。
 * 顺序即优先级：注释里的字符串、字符串里的数字都不会被二次切分。
 * `#` 注释只在 py/sh/yaml 等语言生效（见 hashCommentLangs），故按扩展名二选一。
 */
function tokenReFor(ext: string): RegExp {
  const comment = hashCommentLangs(ext)
    ? '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#[^\\n]*)'
    : '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)'
  return new RegExp(
    comment +
      '|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)' +
      '|(\\d+(?:\\.\\d+)?)' +
      '|([A-Za-z_$][\\w$]*)',
    'g'
  )
}

/** 代码 → 分词（高亮用）。任何输入都产出确定性的 token 流，不抛异常 */
export function tokenizeCode(code: string, ext: string): CodeToken[] {
  const keywords = KEYWORDS[keywordFamily(ext)]
  const tokenRe = tokenReFor(ext)
  const tokens: CodeToken[] = []
  let lastIndex = 0
  for (;;) {
    const match = tokenRe.exec(code)
    if (match === null) break
    const [text, comment, str, num, ident] = match
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), kind: 'plain' })
    }
    if (comment !== undefined) tokens.push({ text, kind: 'comment' })
    else if (str !== undefined) tokens.push({ text, kind: 'string' })
    else if (num !== undefined) tokens.push({ text, kind: 'number' })
    else if (keywords.has(ident as string)) tokens.push({ text, kind: 'keyword' })
    else tokens.push({ text, kind: 'plain' })
    lastIndex = match.index + text.length
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), kind: 'plain' })
  }
  return tokens
}
