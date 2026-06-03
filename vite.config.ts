import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // ELK is intentionally lazy-loaded for architecture layout; keep the
    // warning budget aligned with that isolated vendor chunk.
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
