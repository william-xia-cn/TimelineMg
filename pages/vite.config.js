import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        index: path.resolve(root, 'index.html'),
        diagnostics: path.resolve(root, 'diagnostics.html'),
        dashboard: path.resolve(root, 'legacy-v032/pages/focus/focus.html'),
        tasks: path.resolve(root, 'legacy-v032/pages/tasks/tasks.html'),
        calendar: path.resolve(root, 'legacy-v032/pages/calendar/calendar.html'),
        settings: path.resolve(root, 'legacy-v032/pages/settings/settings.html')
      }
    }
  },
  server: {
    port: 4173,
    strictPort: true,
    proxy: {
      '/health': 'http://127.0.0.1:8787',
      '/auth': 'http://127.0.0.1:8787',
      '/account': 'http://127.0.0.1:8787',
      '/tasks': 'http://127.0.0.1:8787',
      '/calendar': 'http://127.0.0.1:8787',
      '/plans': 'http://127.0.0.1:8787',
      '/buckets': 'http://127.0.0.1:8787',
      '/labels': 'http://127.0.0.1:8787',
      '/containers': 'http://127.0.0.1:8787',
      '/settings': 'http://127.0.0.1:8787',
      '/migration': 'http://127.0.0.1:8787',
      '/sync': 'http://127.0.0.1:8787'
    }
  }
});
