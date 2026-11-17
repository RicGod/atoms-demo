/**
 * 内置百炼兼容端点与模型
 * 四模型共用同一兼容口与 Key（优先 aliQwen-api，回退 BAILIAN_API_KEY）
 * deepseek-v4.1-flash 亦走此端点（模型名切换即可；无需独立 DeepSeek baseURL）
 */
export const BAILIAN_BASE_URL =
  'https://maas.qianwenaiapi.com/compatible-mode/v1'

export const BUILTIN_MODELS = [
  'qwen3.8-omni-flash',
  'qwen3.8-max',
  'qwen3.8-flash',
  'deepseek-v4.1-flash',
] as const

export type BuiltinModel = (typeof BUILTIN_MODELS)[number]

/** 流式超时：首包 / 空闲 / 保底（毫秒） */
export const FIRST_BYTE_TIMEOUT_MS = 30_000
export const IDLE_TIMEOUT_MS = 60_000
export const HARD_CAP_TIMEOUT_MS = 10 * 60_000

/**
 * 生成质量模式（用户可选）
 * - simple / 简约：关思考、限长、快交付（默认）
 * - polished / 精美：开思考 + 改前 ui-ux-pro-max，耗时更长
 */
export const QUALITY_STYLES = ['simple', 'polished'] as const
export type QualityStyle = (typeof QUALITY_STYLES)[number]
export const DEFAULT_QUALITY_STYLE: QualityStyle = 'simple'

/** 简约模式：关闭思考链 */
export const ENABLE_THINKING_SIMPLE = false
/** 精美模式：恢复改前默认可思考（由模型返回 reasoning_content） */
export const ENABLE_THINKING_POLISHED = true

/**
 * 简约生成上限：仍限长以控耗时，略抬高避免脚本被截断导致语法残缺
 * （截断比「多写一点正确逻辑」更容易出 bug）
 */
export const GENERATION_MAX_TOKENS_SIMPLE = 12_288
/** 精美不硬掐过短；给足空间做打磨（仍设上限防僵尸） */
export const GENERATION_MAX_TOKENS_POLISHED = 24_000

/** @deprecated 兼容旧引用：等同简约默认 */
export const ENABLE_THINKING = ENABLE_THINKING_SIMPLE
/** @deprecated 兼容旧引用：等同简约默认 */
export const GENERATION_MAX_TOKENS = GENERATION_MAX_TOKENS_SIMPLE

export type GenerationMode = 'builtin' | 'byok' | 'mock'

export type TaskSource = 'single' | 'horse-race'

/** 规范化前端/请求体里的质量模式，非法则回落默认简约 */
export function parseQualityStyle(raw: unknown): QualityStyle {
  const v = String(raw ?? '').trim()
  if ((QUALITY_STYLES as readonly string[]).includes(v)) {
    return v as QualityStyle
  }
  return DEFAULT_QUALITY_STYLE
}

/** 该质量模式是否开启模型思考链 */
export function enableThinkingFor(style: QualityStyle): boolean {
  return style === 'polished'
    ? ENABLE_THINKING_POLISHED
    : ENABLE_THINKING_SIMPLE
}

/** 该质量模式的 max_tokens */
export function maxTokensFor(style: QualityStyle): number {
  return style === 'polished'
    ? GENERATION_MAX_TOKENS_POLISHED
    : GENERATION_MAX_TOKENS_SIMPLE
}
