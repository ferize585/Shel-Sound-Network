import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      // Direct aliasing avoids the problematic 'node-stdlib-browser' proxies that cause Windows Access Denied errors
      buffer: 'buffer',
      process: 'process/browser',
      stream: 'stream-browserify',
      util: 'util',
    },
  },
  optimizeDeps: {
    include: [
      '@telegram-apps/bridge',
      '@web3auth/modal',
      '@web3auth/openlogin-adapter',
      'buffer',
      'process'
    ],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  // Global definitions to support legacy libraries
  define: {
    'global': 'window',
    'process.env': '{}',
    'process.browser': 'true',
    'process.version': '""',
    ...(isProd ? {
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
    } : {}),
  },
})
