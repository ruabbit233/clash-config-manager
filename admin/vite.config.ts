import { defineConfig } from 'vite'

const sharedPath = new URL('../shared', import.meta.url).pathname

export default defineConfig({
  root: 'admin',
  base: '/',
  resolve: {
    alias: {
      '@shared': sharedPath,
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/download': 'http://localhost:8787',
    },
  },
})
