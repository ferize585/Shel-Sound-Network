import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  plugins: [
    react(),
  ],
  optimizeDeps: {
    include: [
      '@telegram-apps/bridge',
      '@web3auth/modal',
      '@web3auth/openlogin-adapter'
    ],
  },
  // In production: replace console.* with a no-op object so all calls are silenced.
  // In dev: left untouched so console works normally.
  define: isProd ? {
    'console.log': '(()=>{})',
    'console.warn': '(()=>{})',
    'console.error': '(()=>{})',
    'console.info': '(()=>{})',
    'console.debug': '(()=>{})',
    'console.table': '(()=>{})',
    'console.group': '(()=>{})',
    'console.groupEnd': '(()=>{})',
    'console.time': '(()=>{})',
    'console.timeEnd': '(()=>{})',
  } : {},
})
