/**
 * 凭据遮挡（对齐 dsh `ui-secret-mask`）。
 *
 * 在用户消息**发送前**对正文做一遍脱敏：识别常见密钥 / 令牌 / 私钥格式，把敏感值替换成
 * `****`，返回脱敏后的文本与脱敏条数。调用方据此把脱敏文本发往模型，并提示用户「已遮挡 N 处密钥」。
 *
 * 设计取舍：
 * - **发送前脱敏**（不是显示层遮挡）——密钥本就不该离开本机进 LLM 上下文。
 * - **只做格式识别**，不做密钥校验 / 服务端查询；命中即脱敏，宁可错杀也不漏报。
 * - 脱敏是**不可逆**的：原文不留存、不回显明文，用户气泡里也只看到 `****`。
 */

/** 脱敏结果 */
export interface MaskResult {
  /** 脱敏后的文本（密钥已替换为 `****`） */
  text: string
  /** 被脱敏的条数 */
  count: number
}

/** 赋值式敏感字段：`key=value` / `key: value`，只脱敏值、保留字段名与分隔符 */
const ASSIGN_PATTERN =
  /\b(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\s*([:=])\s*("?)([^\s"',}{]+)\3/gi

/** 带 scheme 的凭证头：`Bearer xxx` / `Basic xxx`，保留 scheme 词、脱敏后续内容 */
const PREFIX_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=,-]+/g

/** 完整密钥 / 令牌：命中即整段脱敏 */
const TOKEN_PATTERNS: RegExp[] = [
  // JWT（三段 base64url）
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // AWS 访问密钥
  /\bAKIA[0-9A-Z]{16}\b/g,
  // Google API Key
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  // GitHub 令牌（ghp_/gho_/ghu_/ghs_/ghr_）
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  // GitLab Personal Access Token
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  // Slack 令牌
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  // Stripe 受限 / 连接密钥（rk_/sk_/pk_ + live/test）
  /\b(rk|sk|pk)_(live|test)_[A-Za-z0-9_-]{20,}\b/gi,
  // OpenAI / 通用 sk-/pk- 形态密钥
  /\b[sp]k-[A-Za-z0-9_-]{20,}\b/gi,
  // Google OAuth 刷新令牌
  /\bya29\.[A-Za-z0-9_-]+/g,
  // Telegram Bot Token
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g,
  // PEM 私钥块（多行）
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
]

/**
 * 对文本做凭据脱敏。
 * @param input - 待发送的用户原文
 * @returns 脱敏后的文本与脱敏条数（无密钥时 `count` 为 0，文本原样返回）
 */
export function maskSecrets(input: string): MaskResult {
  if (input === '') return { text: input, count: 0 }
  let count = 0
  let text = input

  // 1) 赋值式敏感字段：先脱敏值，避免后续整段模式把 `sk-` 部分再算一次
  text = text.replace(ASSIGN_PATTERN, (_match, key: string, sep: string): string => {
    count += 1
    return `${key}${sep}****`
  })

  // 2) 完整密钥 / 令牌：整段替换
  for (const pattern of TOKEN_PATTERNS) {
    text = text.replace(pattern, (): string => {
      count += 1
      return '****'
    })
  }

  // 3) 带 scheme 的凭证头：保留 scheme 词
  text = text.replace(PREFIX_PATTERN, (match, scheme: string): string => {
    count += 1
    void match
    return `${scheme} ****`
  })

  return { text, count }
}
