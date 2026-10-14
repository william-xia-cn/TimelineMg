import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pagesRoot = path.join(repoRoot, 'pages');
const publicRoot = path.join(pagesRoot, 'public', 'legacy-v032');
const htmlRoot = path.join(pagesRoot, 'legacy-v032', 'pages');
const baseline = 'v0.3.2';

const pageFiles = {
  focus: ['focus.html', 'styles.css', 'script.js'],
  tasks: ['tasks.html', 'styles.css', 'state.js', 'board.js', 'sidebar.js', 'detail-panel.js', 'dialogs.js', 'script.js'],
  calendar: ['calendar.html', 'styles.css', 'script.js'],
  settings: ['settings.html', 'styles.css', 'script.js']
};

const sharedFiles = [
  'shared/styles/fonts.css',
  'shared/styles/icons.css',
  'shared/styles/google-sync-status.css',
  'shared/js/icons.js',
  'shared/js/appearance.js',
  'shared/js/scheduling.js',
  'shared/js/reminders.js',
  'shared/js/widget-snapshot.js',
  'shared/js/desktop-reminders.js',
  'shared/js/task-arrange-auto.js',
  'shared/js/managebac.js',
  'shared/js/external-links.js',
  'shared/js/ics.js',
  'shared/images/bg.jpg',
  'shared/images/avatar-default.png',
  'shared/images/avatar-focus.png',
  'shared/images/avatar-school.png',
  'shared/images/avatar-student.png',
  'fonts/Inter/Inter-Regular.woff2',
  'fonts/Inter/Inter-Medium.woff2',
  'fonts/Inter/Inter-SemiBold.woff2',
  'fonts/Inter/Inter-Bold.woff2',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

function readGitFile(relativePath) {
  return execFileSync('git', ['show', `${baseline}:extension/${relativePath}`], {
    cwd: repoRoot,
    encoding: relativePath.match(/\.(png|jpg|woff2)$/) ? null : 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
}

function writeSnapshot(relativePath, content) {
  const destination = path.join(publicRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function transformHtml(page, html) {
  const entry = page === 'focus' ? 'dashboard' : page;
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/>/gi, '')
    .replaceAll('../../icons/', '/legacy-v032/icons/')
    .replaceAll('../../shared/', '/legacy-v032/shared/')
    .replace('href="styles.css"', `href="/legacy-v032/pages/${page}/styles.css"`)
    .replace('</body>', `    <script type="module" src="/src/legacy-v032/entry.js" data-timewhere-page="${entry}"></script>\n</body>`);
}

rmSync(publicRoot, { recursive: true, force: true });
rmSync(path.join(pagesRoot, 'legacy-v032'), { recursive: true, force: true });

for (const [page, files] of Object.entries(pageFiles)) {
  for (const file of files) {
    const sourcePath = `pages/${page}/${file}`;
    const content = readGitFile(sourcePath);
    if (file.endsWith('.html')) {
      const destination = path.join(htmlRoot, page, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, transformHtml(page, content), 'utf8');
    } else {
      writeSnapshot(sourcePath, content);
    }
  }
}

for (const relativePath of sharedFiles) {
  writeSnapshot(relativePath, readGitFile(relativePath));
}

writeSnapshot('BASELINE.txt', [
  'TimeWhere Web legacy UI visual baseline',
  `source_tag=${baseline}`,
  'source_scope=extension/pages/focus,tasks,calendar,settings and required shared assets',
  'generated_by=scripts/webdev/freeze-legacy-v032-ui.mjs',
  'Do not edit generated snapshot files directly.'
].join('\n') + '\n');

console.log(`Frozen ${baseline} UI snapshot under pages/public/legacy-v032 and pages/legacy-v032.`);
