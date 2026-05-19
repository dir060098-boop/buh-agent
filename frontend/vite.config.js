import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build timestamp: 20260519131841
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Новые имена файлов при каждом билде — сбрасывает CDN кеш
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
