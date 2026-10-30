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

export function modelSupportsVision(model: string): boolean {
  const value = model.trim()
  if (value === '') return false
  return VISION_PATTERNS.some((pattern) => pattern.test(value))
}

/** 去掉 data URL 前缀（`data:image/png;base64,xxx` → `xxx`）；Ollama `images` 要裸 base64 */
export function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}
