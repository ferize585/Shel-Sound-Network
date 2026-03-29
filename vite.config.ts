import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
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
    sourcemap: true, // Enable sourcemaps for production debugging
  },
  define: {
    // Better global/process shims for production
    'global': 'globalThis',
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
})
