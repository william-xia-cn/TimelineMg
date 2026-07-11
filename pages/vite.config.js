import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/auth': 'http://127.0.0.1:8787',
      '/account': 'http://127.0.0.1:8787',
      '/tasks': 'http://127.0.0.1:8787',
      '/calendar': 'http://127.0.0.1:8787',
      '/containers': 'http://127.0.0.1:8787',
      '/settings': 'http://127.0.0.1:8787',
      '/migration': 'http://127.0.0.1:8787',
      '/sync': 'http://127.0.0.1:8787'
    }
  }
});
