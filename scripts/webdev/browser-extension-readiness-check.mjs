import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'extension/manifest.json',
  'extension/background.js',
  'extension/shared/js/platform.js',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md',
  'docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md',
  'docs/WEBDEV_INTERFACE_CONTRACTS.md',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md',
  'DECISIONS.md',
  'package.json'
];

let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(description, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${description}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${description}`);
}

function manifestHostPermissions(manifest) {
  return Array.isArray(manifest.host_permissions) ? manifest.host_permissions.join('\n') : '';
}

console.log('WebDev Browser Extension readiness static check');
console.log('===============================================');

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const manifest = exists('extension/manifest.json') ? JSON.parse(read('extension/manifest.json')) : {};
const background = exists('extension/background.js') ? read('extension/background.js') : '';
const platform = exists('extension/shared/js/platform.js') ? read('extension/shared/js/platform.js') : '';
const completionChecklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md') ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md') : '';
const parityChecklist = exists('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md') ? read('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md') : '';
const targetArchitecture = exists('docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md') ? read('docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md') : '';
const interfaceContracts = exists('docs/WEBDEV_INTERFACE_CONTRACTS.md') ? read('docs/WEBDEV_INTERFACE_CONTRACTS.md') : '';
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const decisions = exists('DECISIONS.md') ? read('DECISIONS.md') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };
const hostPermissions = manifestHostPermissions(manifest);
const extensionRuntimeText = [JSON.stringify(manifest), background, platform].join('\n');

assert('root package exposes Browser Extension readiness script',
  packageJson.scripts?.['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs');

assert('Browser Extension remains explicitly deferred under Gate D',
  completionChecklist.includes('| Phase 8 | Browser Extension 生态化 | Deferred |')
    && completionChecklist.includes('| D | 定义并实现 Browser Extension 第一阶段范围或 replay。')
    && completionChecklist.includes('Browser Extension replay')
    && parityChecklist.includes('Browser Extension ecosystem')
    && parityChecklist.includes('Gate D required before defining first phase')
    && projectMaster.includes('Browser Extension scope deferred')
    && taskBoard.includes('deferred Browser Extension scope'));

assert('architecture docs position Extension as ecosystem component, not primary product',
  decisions.includes('Browser Extension becomes an ecosystem component')
    && decisions.includes('Browser Extension first-phase scope is deferred')
    && targetArchitecture.includes('Browser Extension')
    && targetArchitecture.includes('生态增强')
    && interfaceContracts.includes('Extension: 第一阶段暂不设计'));

assert('current extension manifest remains legacy MV3 shell without Cloudflare WebDev endpoint permissions',
  manifest.manifest_version === 3
    && manifest.background?.service_worker === 'background.js'
    && manifest.side_panel?.default_path === 'popup/sidepanel.html'
    && !/workers\.dev|timewhere-preview|timewhere-api|timewhere-web/i.test(hostPermissions));

assert('current Extension runtime has no WebDev replay endpoint integration',
  !extensionRuntimeText.includes('/sync/mutations')
    && !extensionRuntimeText.includes('webdev:extension')
    && !/timewhere-preview|workers\.dev|VITE_WORKER_API_BASE_URL/i.test(extensionRuntimeText));

assert('Browser Extension readiness stays non-release and non-CWS',
  !packageJson.scripts?.['webdev:extension:deploy']
    && !packageJson.scripts?.['webdev:extension:replay']
    && !packageJson.scripts?.['webdev:cws']
    && !packageJson.scripts?.['webdev:release']);

if (failed > 0) {
  console.error(`\n${failed} WebDev Browser Extension readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('===============================================');
console.log(`All ${passed} WebDev Browser Extension readiness checks passed.`);
console.log('This is readiness evidence only. No Extension replay, CWS submission, release, or deployment was performed.');
