/**
 * 模型是否**可能**支持视觉输入（图片）。
 *
 * dsh 会把图片发给模型（真 vision）；我们没有模型能力元数据，只能按**已知视觉模型家族**
 * 保守判断——**宁可不发（只给路径），也不把图片发给文本模型**（那会让请求 400 或静默失效）。
 * 未命中一律视为不支持；需要支持新模型时在此加一条 pattern。
 */
const VISION_PATTERNS: readonly RegExp[] = [
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-4-turbo/i,
  /gpt-4-vision/i,
  /claude-3/i,
  /claude-4/i,
  /claude-sonnet/i,
  /claude-opus/i,
  /gemini/i,
  /qwen[\w.-]*vl/i,
  /qwen2[\w.-]*vl/i,
  /llava/i,
  /bakllava/i,
  /minicpm-v/i,
  /moondream/i,
  /llama3\.2[\w.-]*vision/i,
  /pixtral/i,
  /internvl/i,
  /glm-4v/i
]

/**
 * 用户对「视觉输入」的显式设定（设置面板可改，落在 `StoredLlmConfig.vision`）。
 *
 * - `auto`（默认）：按已知视觉模型家族判断（保守：未知一律不发图）；
 * - `on`：强制发图——用于 allowlist 未收录的视觉模型（自建 / 新发布的模型）；
 * - `off`：强制不发图——用于「模型自称支持但实际会 400」的情况，或省流量。
 */
export type VisionMode = 'auto' | 'on' | 'off'

/** 合法取值（供 zod / UI 共用，避免两处各写一份） */
export const VISION_MODES: readonly VisionMode[] = ['auto', 'on', 'off']

/** 是否合法取值（用于解析外部输入时的兜底） */
export function isVisionMode(value: unknown): value is VisionMode {
  return typeof value === 'string' && (VISION_MODES as readonly string[]).includes(value)
}

/** 按 allowlist 判断模型是否**可能**支持视觉输入（不含用户覆盖） */
export function modelSupportsVision(model: string): boolean {
  const value = model.trim()
  if (value === '') return false
  return VISION_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * 生效的视觉判定：用户显式设定优先，`auto` 才回落到 allowlist。
 *
 * **单点真源**：service（是否读图 / 是否提示）与两条传输层（是否下发图片）都走这里，
 * 避免「service 判定发了图、传输层又把它丢掉」这类两侧不一致。
 */
export function resolveVisionSupport(model: string, mode: VisionMode | undefined): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return modelSupportsVision(model)
}

/** 去掉 data URL 前缀（`data:image/png;base64,xxx` → `xxx`）；Ollama `images` 要裸 base64 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}
