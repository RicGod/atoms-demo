/**
 * 额度/鉴权失败启发式：匹配 HTTP 状态与错误文案关键词
 * 用于引导用户自配模型，不把密钥写回服务端
 */
export function isQuotaOrAuthFailure(
  status: number,
  message: string,
): boolean {
  if ([401, 403, 402, 429].includes(status)) return true
  const lower = message.toLowerCase()
  const needles = [
    'quota',
    'insufficient',
    'billing',
    'rate',
    'rate_limit',
    'rate limit',
    'exceeded',
    '余额',
    '额度',
    '欠费',
  ]
  return needles.some((n) => lower.includes(n))
}
