/**
 * 百炼 API Key 环境变量读取
 * 本地优先系统/用户变量 `aliQwen-api`（含连字符，须用括号取值）；
 * 若无则回退 `BAILIAN_API_KEY`（兼容 .env.example / Render 等平台命名）。
 * 切勿把真实 Key 写入仓库或打印到日志。
 */

/** 本地系统环境变量名（含连字符） */
export const ALIQWEN_API_ENV = 'aliQwen-api'

/** 文档与 Render（及可选 Vercel）推荐的兼容变量名（无连字符） */
export const BAILIAN_API_ENV = 'BAILIAN_API_KEY'

/**
 * 读取百炼 Key：优先 aliQwen-api，其次 BAILIAN_API_KEY
 * @returns trim 后的 Key；均未配置则返回空串
 */
export function getBailianApiKey(): string {
  // 连字符变量名不能用点语法，必须用括号访问
  const fromAliQwen = process.env[ALIQWEN_API_ENV]?.trim() ?? ''
  if (fromAliQwen) return fromAliQwen
  return process.env[BAILIAN_API_ENV]?.trim() ?? ''
}

/** 是否已配置任一 Key 来源（仅布尔，不暴露内容） */
export function isBailianConfigured(): boolean {
  return Boolean(getBailianApiKey())
}

/**
 * 启动日志用状态字：present / missing
 * 严禁拼接或打印 Key 本体
 */
export function bailianKeyPresenceLabel(): 'present' | 'missing' {
  return isBailianConfigured() ? 'present' : 'missing'
}
