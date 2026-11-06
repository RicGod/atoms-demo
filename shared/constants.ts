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

export type GenerationMode = 'builtin' | 'byok' | 'mock'

export type TaskSource = 'single' | 'horse-race'
