import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    dedupe: [
      'react',
      'react-dom',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/dsh-typert-registry',
    ],
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', ws: true },
      '/connect': 'http://127.0.0.1:3100',
    },
  },
  build: { target: 'es2022', sourcemap: true },
})
