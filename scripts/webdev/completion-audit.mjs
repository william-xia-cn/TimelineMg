import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function git(args, fallback = '') {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) return fallback;
  return String(result.stdout || '').trim();
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

function hasAll(text, fragments) {
  return fragments.every(fragment => text.includes(fragment));
}

function hasAny(text, fragments) {
  return fragments.some(fragment => text.includes(fragment));
}

console.log('WebDev completion audit');
console.log('=======================');

const requiredFiles = [
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md',
  'docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md',
  'docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md',
  'docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md',
  'docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md',
  'docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md',
  'scripts/webdev/prod-evidence-runner.mjs',
  'scripts/webdev/prod-evidence-summary-check.mjs',
  'workers/wrangler.toml',
  'workers/migrations/0001_initial.sql',
  'workers/src/index.ts',
  'workers/src/migration.ts',
  'pages/src/App.jsx',
  'pages/src/repositories/taskRepository.js',
  'pages/src/repositories/calendarRepository.js',
  'pages/src/repositories/structureRepository.js',
  'pages/src/repositories/settingsRepository.js',
  'package.json',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md'
];

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const checklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md') ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md') : '';
const targetArchitecture = exists('docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md') ? read('docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md') : '';
const parity = exists('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md') ? read('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md') : '';
const preview = exists('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md') ? read('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md') : '';
const prod = exists('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') ? read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') : '';
const observability = exists('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') ? read('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') : '';
const gateB = exists('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md') ? read('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md') : '';
const gateC = exists('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md') ? read('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md') : '';
const gateD = exists('docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md') ? read('docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md') : '';
const gateE = exists('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md') ? read('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md') : '';
const prodEvidenceSummaryCheck = exists('scripts/webdev/prod-evidence-summary-check.mjs') ? read('scripts/webdev/prod-evidence-summary-check.mjs') : '';
const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const workerIndex = exists('workers/src/index.ts') ? read('workers/src/index.ts') : '';
const migration = exists('workers/src/migration.ts') ? read('workers/src/migration.ts') : '';
const app = exists('pages/src/App.jsx') ? read('pages/src/App.jsx') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const statusShort = git(['status', '--short']);
const branch = git(['branch', '--show-current'], 'unknown');
const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], 'unknown');
const headCommit = git(['rev-parse', 'HEAD'], 'unknown');
const upstreamCommit = git(['rev-parse', '@{u}'], 'unknown');

for (const phase of ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7', 'Phase 8', 'Phase 9', 'Phase 10']) {
  assert(`${phase} has a checklist row`, checklist.includes(`| ${phase} |`));
}

assert('Cloud canonical D1 target is represented',
  hasAll(checklist, ['Cloudflare D1 是 canonical data source', 'Cloud canonical schema'])
    && hasAll(wrangler, ['timewhere-dev-api', 'timewhere-preview-api', 'timewhere-api'])
    && hasAll(workerIndex, ['handleListTasks', 'handleSyncBootstrap', 'handleListSyncChanges']));

assert('Target architecture status baseline is current',
  hasAll(targetArchitecture, [
    'Active architecture baseline with implementation status',
    'D-048 initial scaffold is complete',
    'D-049 Phase 2-9 is complete',
    'Gate A dev / preview resources and preview smoke are complete',
    'Gate B',
    'Gate C',
    'Gate D',
    'Gate E',
    'Gate R'
  ]));

assert('Web App full business coverage is represented',
  hasAll(checklist, ['Dashboard / Tasks / Calendar / Settings', 'Daily Settle', 'Reminder'])
    && hasAll(parity, ['Tasks CRUD', 'Calendar Events CRUD', 'Daily Settle projection', 'Automatic migration'])
    && hasAll(app, ['Dashboard', 'Tasks', 'Calendar', 'Settings']));

assert('Google is scoped to SSO/OIDC in WebDev docs and examples',
  hasAll(checklist, ['Google 仅作为 SSO / OIDC 身份提供方'])
    && hasAll(workerIndex, ['handleGoogleAuth'])
    && hasAll(workerIndex, ['google_tokens_stored_by_worker: false'])
    && !/client_secret|GOOGLE_DESKTOP_CLIENT_SECRET|Drive appDataFolder/i.test(wrangler));

assert('Automatic migration path is represented and idempotent',
  hasAll(checklist, ['旧 IndexedDB 数据可在 Google SSO 后自动迁移到 Cloud'])
    && hasAll(migration, ['SNAPSHOTS.put', 'snapshot_hash = ?', 'detectMigrationConflicts'])
    && hasAll(workerIndex, ['handleCreateMigrationRun', 'handleListMigrationConflicts']));

assert('Offline v1 is retained as read cache with gated replay',
  hasAll(checklist, ['read cache', '真正 replay 写 Cloud', 'Gate B/C'])
    && hasAll(gateB, ['Gate B readiness packet', '不批准、不开启、不发布'])
    && hasAll(gateC, ['Gate C readiness packet', '不批准、不开启、不实现 Calendar / Container / Settings replay']));

assert('Desktop Runtime remains native shell only until Gate E',
  hasAll(checklist, ['Desktop 退化为 Runtime', 'Gate E Desktop Runtime'])
    && hasAll(gateE, ['Gate E readiness packet', 'Desktop preload 不暴露 Task / Calendar / Migration 业务 API'])
    && packageJson.scripts?.['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs');

assert('Browser Extension remains deferred ecosystem component until Gate D',
  hasAll(checklist, ['Browser Extension 退化为生态组件', 'Gate D Browser Extension'])
    && hasAll(gateD, ['Gate D readiness packet', '不批准、不开启、不实现 Browser Extension WebDev replay'])
    && packageJson.scripts?.['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs');

assert('Preview acceptance evidence is represented for Gate A',
  hasAll(preview, ['Preview Acceptance Evidence', 'webdev:preview:acceptance', 'Preview Rollback / Cleanup Plan'])
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('webdev:preview:data-hygiene-smoke')
    && projectMaster.includes('preview:data-hygiene-smoke'));

assert('Prod verification is explicitly non-release and Gate R internal verification only',
  hasAll(prod, ['Gate R internal prod verification checklist', '不等于发布', 'Stop Conditions'])
    && hasAll(observability, ['Gate R readiness runbook', 'Stop Conditions'])
    && packageJson.scripts?.['webdev:prod:evidence'] === 'node scripts/webdev/prod-evidence-runner.mjs'
    && packageJson.scripts?.['webdev:prod:evidence:check'] === 'node scripts/webdev/prod-evidence-summary-check.mjs'
    && packageJson.scripts?.['webdev:prod:acceptance']?.includes('webdev:prod:data-hygiene-smoke')
    && prod.includes('webdev:prod:evidence')
    && prod.includes('webdev:prod:evidence:check')
    && prodEvidenceSummaryCheck.includes('Gate R evidence summary matches current WebDev HEAD')
    && projectMaster.includes('Gate R internal prod verification is approved'));

assert('All approval gates remain explicit',
  hasAll(checklist, ['| B |', '| C |', '| D |', '| E |', '| R |'])
    && hasAll(projectMaster, ['Task replay', 'non-Task replay remain gated', 'Gate D', 'Gate E'])
    && taskBoard.includes('Await separate Product Owner approval'));

assert('Completion checklist has a durable remaining approval gate register',
  hasAll(checklist, [
    'Remaining Approval Gate Register',
    'Task replay 写 Cloud',
    'Calendar / Container / Settings replay',
    'Browser Extension 第一阶段范围',
    'Desktop Runtime 内部包',
    'prod Cloudflare resources',
    'Not approved',
    'readiness_complete_pending_approval_gates',
    'separate Product Owner decision'
  ]));

assert('Completion audit is registered as a first-class script',
  packageJson.scripts?.['webdev:completion:audit'] === 'node scripts/webdev/completion-audit.mjs'
    && checklist.includes('webdev:completion:audit'));

assert('Git working tree status is readable', typeof statusShort === 'string');
assert('Audit is running on WebDev branch', branch === 'WebDev');
assert('WebDev branch tracks origin/WebDev', upstream === 'origin/WebDev');
assert('WebDev HEAD matches origin/WebDev', headCommit !== 'unknown' && headCommit === upstreamCommit);

const forbiddenPatterns = [
  new RegExp('GOC' + 'SPX-'),
  new RegExp('ya' + '29\\.'),
  new RegExp('BEGIN (RSA |EC |OPENSSH |)PRIVATE ' + 'KEY', 'i'),
  /database_id\s*=\s*"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/i,
  new RegExp('[A-Za-z0-9._%+-]+' + '@' + '[A-Za-z0-9.-]+\\.[A-Za-z]{2,}')
];
const scanned = [
  checklist,
  targetArchitecture,
  parity,
  preview,
  prod,
  observability,
  gateB,
  gateC,
  gateD,
  gateE,
  wrangler
].join('\n');

assert('Audit-scanned docs/config contain no obvious secrets or private identifiers',
  forbiddenPatterns.every(pattern => !pattern.test(scanned)));

console.log('=======================');
const completionReady = statusShort.length === 0 && headCommit !== 'unknown' && headCommit === upstreamCommit;
console.log(`Completion classification: ${completionReady ? 'readiness_complete_pending_approval_gates' : 'readiness_pending_local_changes_or_unpushed_commits'}`);
console.log(`Branch: ${branch}`);
console.log(`Upstream: ${upstream}`);
console.log(`Working tree clean: ${statusShort.length === 0 ? 'yes' : 'no'}`);
console.log(`Upstream synced: ${headCommit !== 'unknown' && headCommit === upstreamCommit ? 'yes' : 'no'}`);
console.log(`Checks passed: ${passed}`);

if (failed > 0) {
  console.error(`\n${failed} WebDev completion audit checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('This audit proves current WebDev readiness state and remaining approval gates; it does not approve prod, replay, desktop distribution, CWS, tag, merge, or release.');
