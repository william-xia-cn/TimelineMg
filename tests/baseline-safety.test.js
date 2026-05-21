/**
 * Phase 2A baseline safety static checks.
 * Run: node tests/baseline-safety.test.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const extensionDir = path.join(root, 'extension');

let passed = 0;
let failed = 0;

function read(relPath) {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function listFiles(dir, suffixes) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listFiles(full, suffixes));
        } else if (suffixes.some(suffix => entry.name.endsWith(suffix))) {
            out.push(full);
        }
    }
    return out;
}

function assert(desc, condition) {
    if (condition) {
        passed++;
        console.log(`  PASS ${desc}`);
    } else {
        failed++;
        console.log(`  FAIL ${desc}`);
    }
}

console.log('\nTimeWhere Phase 2A baseline safety checks\n' + '='.repeat(48));

const htmlFiles = listFiles(extensionDir, ['.html']);
assert(
    'extension HTML has no Google Fonts network references',
    htmlFiles.every(file => !/fonts\.googleapis|fonts\.gstatic/.test(fs.readFileSync(file, 'utf8')))
);

const dbJs = read('extension/shared/js/db.js');
assert('getPendingSyncLogs does not query unindexed sync_log.synced', !/where\(['"]synced['"]\)/.test(dbJs));
assert('getPendingSyncLogs scan-filters synced === false', /filter\(log => log\.synced === false\)/.test(dbJs));

const extensionJs = listFiles(extensionDir, ['.js'])
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');
assert('destructive clearAndReseed helper is not exposed in extension JS', !/clearAndReseed/.test(extensionJs));
assert('Task Board seedDemoData helper is not present in extension JS', !/seedDemoData/.test(extensionJs));
assert('old duplicate createDefaultContainers functions are absent', !/async function createDefaultContainers/.test(extensionJs));
assert('old duplicate createDefaultHabits function is absent', !/async function createDefaultHabits/.test(extensionJs));

assert('extension/shared/js/test-events.html removed from package tree',
    !fs.existsSync(path.join(root, 'extension/shared/js/test-events.html')));
assert('manual DB event test utility lives under tests/manual',
    fs.existsSync(path.join(root, 'tests/manual/test-events.html')));

const iconJs = read('extension/shared/js/icons.js');
const iconObjectMatch = iconJs.match(/const ICONS = \{([\s\S]*?)\n\};/);
const iconNames = new Set();
if (iconObjectMatch) {
    for (const match of iconObjectMatch[1].matchAll(/['"]([a-z0-9_]+)['"]\s*:/g)) {
        iconNames.add(match[1]);
    }
}

const materialIconFiles = listFiles(extensionDir, ['.html', '.js']);
const missingIconRefs = [];
for (const file of materialIconFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/<(?:span|i)\b[^>]*class=["'][^"']*\bmaterial-symbols-outlined\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|i)>/g)) {
        const iconName = match[1].replace(/<[^>]+>/g, '').trim();
        if (!iconName || iconName.includes('$') || iconName.includes('{')) continue;
        if (!iconNames.has(iconName)) {
            missingIconRefs.push(`${path.relative(root, file)}:${iconName}`);
        }
    }
}
assert('all static material-symbols-outlined icon names have local SVG mappings', missingIconRefs.length === 0);

const iconCss = read('extension/shared/styles/icons.css');
assert('material icon placeholders hide raw ligature text before SVG replacement',
    /\.material-symbols-outlined\s*\{[\s\S]*color:\s*transparent;/.test(iconCss)
    && /\.material-symbols-outlined\s*\{[\s\S]*width:\s*1em;/.test(iconCss)
    && /\.material-symbols-outlined\s*\{[\s\S]*overflow:\s*hidden;/.test(iconCss));

const brandedHtmlPages = [
    'extension/popup/popup.html',
    'extension/popup/sidepanel.html',
    'extension/pages/focus/focus.html',
    'extension/pages/calendar/calendar.html',
    'extension/pages/tasks/tasks.html',
    'extension/pages/settings/settings.html',
    'extension/pages/settings/matrixview.html',
    'extension/pages/settings/managebac-sync.html',
    'extension/pages/settings/task-arrange.html'
];
assert('internal TimeWhere logo uses PNG app icon instead of change_history ligature',
    brandedHtmlPages.every(file => {
        const html = read(file);
        return /class=["']logo-icon["'][^>]*>\s*<img\b(?=[^>]+class=["']logo-mark["'])(?=[^>]+alt=["']TimeWhere["'])[^>]+>/.test(html)
            && !/class=["']logo-icon["'][^>]*>\s*<span\b[^>]+material-symbols-outlined[^>]*>\s*change_history\s*<\/span>/.test(html);
    }));
assert('branded TimeWhere pages expose a local favicon',
    brandedHtmlPages.every(file => /<link rel="icon" type="image\/png" href="(?:\.\.\/icons|\.\.\/\.\.\/icons)\/icon48\.png">/.test(read(file))));

const brandCssFiles = [
    'extension/popup/popup.css',
    'extension/pages/focus/styles.css',
    'extension/pages/calendar/styles.css',
    'extension/pages/tasks/styles.css',
    'extension/pages/settings/styles.css'
];
assert('default brand theme uses deep blue sidebar and bright blue accent',
    brandCssFiles.every(file => {
        const css = read(file);
        return /--color-sidebar:\s*#0b2a66;/.test(css)
            && /--accent:\s*#1d8cf8;/.test(css)
            && !/--accent:\s*#6366f1;/.test(css)
            && !/rgba\(99,\s*102,\s*241/.test(css);
    }));
const taskStylesCss = read('extension/pages/tasks/styles.css');
const createPlanButtonBlock = taskStylesCss.match(/\.btn-create-plan\s*\{([\s\S]*?)\}/)?.[1] || '';
assert('Planner primary create button follows blue brand accent, not purple',
    createPlanButtonBlock.includes('background: var(--accent);')
    && !createPlanButtonBlock.includes('background: var(--color-purple);')
    && !/rgba\(124,\s*77,\s*255/.test(createPlanButtonBlock));

const requiredAppearanceAssets = [
    'bg.jpg',
    'bg-calm.jpg',
    'bg-focus.jpg',
    'bg-morning.jpg',
    'bg-evening.jpg',
    'managebac-icon.png',
    'avatar-default.png',
    'avatar-student.png',
    'avatar-school.png',
    'avatar-focus.png'
];
assert('appearance image asset set exists locally',
    requiredAppearanceAssets.every(name => fs.existsSync(path.join(root, 'extension/shared/images', name))));

const appearanceJs = read('extension/shared/js/appearance.js');
assert('appearance preferences read and write persisted settings',
    appearanceJs.includes("SETTINGS_BACKGROUND_KEY: 'appearance_background'")
    && appearanceJs.includes("SETTINGS_AVATAR_KEY: 'appearance_avatar'")
    && appearanceJs.includes('TimeWhereDB.getSetting')
    && appearanceJs.includes('TimeWhereDB.setSetting'));

const appearancePages = [
    'extension/pages/focus/focus.html',
    'extension/pages/calendar/calendar.html',
    'extension/pages/tasks/tasks.html',
    'extension/pages/settings/settings.html',
    'extension/pages/settings/matrixview.html',
    'extension/pages/settings/managebac-sync.html'
];
assert('main extension pages load shared appearance preferences',
    appearancePages.every(file => read(file).includes('../../shared/js/appearance.js')));

console.log('\n' + '='.repeat(48));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
