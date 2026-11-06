import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端开发服务器：把 /api 代理到本地 Express，便于同仓联调
export default defineConfig({
  plugins: [react()],
  server: {
    // 固定 IPv4，避免仅绑 ::1 导致 Playwright 127.0.0.1 探测超时
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
})
