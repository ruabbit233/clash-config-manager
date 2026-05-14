import { defineConfig } from 'vite';

export default defineConfig({
  root: 'admin',
  base: '/',
  build: {
    outDir: 'dist'
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/download': 'http://localhost:8787'
    }
  }
});
