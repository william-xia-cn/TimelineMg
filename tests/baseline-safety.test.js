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

console.log('\n' + '='.repeat(48));
console.log(`Total: ${passed + failed} checks   PASS ${passed}   ${failed > 0 ? 'FAIL' : 'PASS'} ${failed}`);
if (failed > 0) process.exit(1);
