import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  plugins: [
    react(),
    // Required for Web3/Aptos libs that need Buffer, global, process in browser
    nodePolyfills({
      include: ['buffer', 'process', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  optimizeDeps: {
    include: [
      '@telegram-apps/bridge',
      '@web3auth/modal',
      '@web3auth/openlogin-adapter'
    ],
  },
  build: {
    // Suppress expected large-chunk warning for Web3 bundles
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  // In production: replace console.* with no-ops so the browser console is clean.
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
