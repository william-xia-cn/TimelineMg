import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pagesRoot = path.join(repoRoot, 'pages');

const indexHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TimeWhere Web</title>
  </head>
  <body>
    <script>
      const view = (location.hash.slice(1).split('?')[0] || 'dashboard').toLowerCase();
      const routes = {
        dashboard: '/legacy-v032/pages/focus/focus.html',
        focus: '/legacy-v032/pages/focus/focus.html',
        tasks: '/legacy-v032/pages/tasks/tasks.html',
        calendar: '/legacy-v032/pages/calendar/calendar.html',
        settings: '/legacy-v032/pages/settings/settings.html'
      };
      location.replace((routes[view] || routes.dashboard) + location.search);
    </script>
  </body>
</html>
`;

const diagnosticsHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TimeWhere WebDev Diagnostics</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

const viteConfig = `import { defineConfig } from 'vite';
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
`;

writeFileSync(path.join(pagesRoot, 'index.html'), indexHtml, 'utf8');
writeFileSync(path.join(pagesRoot, 'diagnostics.html'), diagnosticsHtml, 'utf8');
writeFileSync(path.join(pagesRoot, 'vite.config.js'), viteConfig, 'utf8');

console.log('Configured TimeWhere Web as a v0.3.2-aligned Vite multi-page app.');
