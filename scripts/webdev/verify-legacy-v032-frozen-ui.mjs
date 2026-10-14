import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseline = 'v0.3.2';
const publicRoot = path.join(repoRoot, 'pages', 'public', 'legacy-v032');
const htmlRoot = path.join(repoRoot, 'pages', 'legacy-v032', 'pages');
const bridgeRoot = path.join(repoRoot, 'pages', 'src', 'legacy-v032');

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

function gitFile(relativePath) {
  return execFileSync('git', ['show', `${baseline}:extension/${relativePath}`], {
    cwd: repoRoot,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
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

function openingControlTags(html) {
  return html.match(/<(?:button|a|input|select|textarea)\b[^>]*>/gi) || [];
}

for (const [page, files] of Object.entries(pageFiles)) {
  for (const file of files) {
    const relativePath = `pages/${page}/${file}`;
    const original = gitFile(relativePath);
    if (file.endsWith('.html')) {
      const originalText = original.toString('utf8');
      const generated = readFileSync(path.join(htmlRoot, page, file), 'utf8');
      assert(generated === transformHtml(page, originalText), `${page}/${file} only has approved MPA path/script transformation`);
      assert(
        JSON.stringify(openingControlTags(generated)) === JSON.stringify(openingControlTags(originalText)),
        `${page}/${file} preserves every static control opening tag`
      );
    } else {
      const frozen = readFileSync(path.join(publicRoot, relativePath));
      assert(Buffer.compare(frozen, original) === 0, `${relativePath} is byte-identical to ${baseline}`);
    }
  }
}

for (const relativePath of sharedFiles) {
  const frozen = readFileSync(path.join(publicRoot, relativePath));
  assert(Buffer.compare(frozen, gitFile(relativePath)) === 0, `${relativePath} is byte-identical to ${baseline}`);
}

const adapterFiles = ['cloudRuntime.js', 'idBridge.js', 'platformFacade.js', 'settingsCloudUi.js'];
const adapterSource = adapterFiles.map(file => readFileSync(path.join(bridgeRoot, file), 'utf8')).join('\n');
assert(!/\bindexedDB\b/i.test(adapterSource), 'Web legacy adapter does not access IndexedDB');
assert(!/\bchrome\s*\./i.test(adapterSource), 'Web legacy adapter does not access chrome.*');
assert(!/https:\/\/www\.googleapis\.com\/drive|drive\/v3|appDataFolder/i.test(adapterSource), 'Web legacy adapter does not access Google Drive');
assert(/createTaskRepository/.test(adapterSource) && /createCalendarRepository/.test(adapterSource), 'Web legacy adapter uses Cloud repositories');

const focusCss = readFileSync(path.join(publicRoot, 'pages', 'focus', 'styles.css'), 'utf8');
assert(/\.board-column\.column-calendar\s*\{[^}]*flex:\s*1\s+1\s+40%/s.test(focusCss), 'Dashboard frozen CSS keeps the v0.3.2 calendar column ratio');
assert(/\.board-column\.column-week,\s*\.board-column\.column-feed\s*\{[^}]*flex:\s*1\s+1\s+10%/s.test(focusCss), 'Dashboard frozen CSS keeps both narrow columns visible');

console.log('All v0.3.2 frozen UI verification checks passed.');
