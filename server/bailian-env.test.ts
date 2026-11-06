import { afterEach, describe, expect, it } from 'vitest'
import {
  ALIQWEN_API_ENV,
  BAILIAN_API_ENV,
  getBailianApiKey,
  isBailianConfigured,
} from './lib/bailian-env.js'

/**
 * S2 seam：百炼 Key 解析
 * 优先 aliQwen-api → 回退 BAILIAN_API_KEY；测完必须还原 env
 */
describe('getBailianApiKey', () => {
  const savedAli = process.env[ALIQWEN_API_ENV]
  const savedBailian = process.env[BAILIAN_API_ENV]

  afterEach(() => {
    // 还原测试前的环境变量，避免污染其它用例 / 进程
    if (savedAli === undefined) delete process.env[ALIQWEN_API_ENV]
    else process.env[ALIQWEN_API_ENV] = savedAli
    if (savedBailian === undefined) delete process.env[BAILIAN_API_ENV]
    else process.env[BAILIAN_API_ENV] = savedBailian
  })

  it('优先读取 aliQwen-api，即使 BAILIAN_API_KEY 也存在', () => {
    process.env[ALIQWEN_API_ENV] = '  key-from-aliqwen  '
    process.env[BAILIAN_API_ENV] = 'key-from-bailian'
    expect(getBailianApiKey()).toBe('key-from-aliqwen')
    expect(isBailianConfigured()).toBe(true)
  })

  it('aliQwen-api 为空时回退 BAILIAN_API_KEY', () => {
    delete process.env[ALIQWEN_API_ENV]
    process.env[BAILIAN_API_ENV] = '  fallback-key  '
    expect(getBailianApiKey()).toBe('fallback-key')
    expect(isBailianConfigured()).toBe(true)
  })

  it('两者皆无时返回空串且未配置', () => {
    delete process.env[ALIQWEN_API_ENV]
    delete process.env[BAILIAN_API_ENV]
    expect(getBailianApiKey()).toBe('')
    expect(isBailianConfigured()).toBe(false)
  })
})
