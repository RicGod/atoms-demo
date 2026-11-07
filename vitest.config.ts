import { defineConfig } from 'vitest/config'

/**
 * 服务端 seam 测试：Node 环境 + 仅匹配 server 下 *.test.ts
 * E2E 走 Playwright，不经本配置
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
    // 单测串行，避免内存 tasks 互相污染
    fileParallelism: false,
    // Vitest 4：池选项顶层化
    pool: 'threads',
    maxWorkers: 1,
  },
})
