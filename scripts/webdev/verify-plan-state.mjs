import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let passed = 0;
let failed = 0;

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(description, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${description}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${description}`);
  }
}

console.log('WebDev plan-state verification');

const checklistPath = 'docs/WEBDEV_COMPLETION_CHECKLIST.md';
assert('completion checklist exists', exists(checklistPath));
const parityPath = 'docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md';
assert('business parity checklist exists', exists(parityPath));
const previewRunbookPath = 'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md';
assert('preview acceptance runbook exists', exists(previewRunbookPath));
const prodReadinessPath = 'docs/WEBDEV_PROD_READINESS_CHECKLIST.md';
assert('prod readiness checklist exists', exists(prodReadinessPath));

const checklist = exists(checklistPath) ? read(checklistPath) : '';
const parityChecklist = exists(parityPath) ? read(parityPath) : '';
const previewRunbook = exists(previewRunbookPath) ? read(previewRunbookPath) : '';
const prodReadiness = exists(prodReadinessPath) ? read(prodReadinessPath) : '';
for (const phase of ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7', 'Phase 8', 'Phase 9', 'Phase 10']) {
  assert(`${phase} is represented in completion checklist`, checklist.includes(phase));
}
for (const gate of ['Gate A', 'Gate B', 'Gate C', 'Gate D', 'Gate E', 'Gate R']) {
  assert(`${gate} boundary is represented in completion checklist`, checklist.includes(gate));
}
for (const capability of ['Tasks CRUD', 'Calendar Events CRUD', 'Daily Settle projection', 'Automatic migration', 'Desktop Runtime']) {
  assert(`${capability} is represented in business parity checklist`, parityChecklist.includes(capability));
}
assert('preview runbook records Gate A evidence boundary',
  previewRunbook.includes('Gate A')
    && previewRunbook.includes('Preview Acceptance Evidence')
    && previewRunbook.includes('Desktop Runtime Preview Smoke')
    && previewRunbook.includes('Stop Conditions'));
assert('prod readiness checklist records Gate R non-release boundary',
  prodReadiness.includes('Gate R')
    && prodReadiness.includes('Prod Readiness Package')
    && prodReadiness.includes('Security / Privacy Readiness')
    && prodReadiness.includes('不等于发布'));

const wrangler = read('workers/wrangler.toml');
assert('wrangler declares dev preview and prod names',
  wrangler.includes('name = "timewhere-dev-api"')
    && wrangler.includes('name = "timewhere-preview-api"')
    && wrangler.includes('name = "timewhere-api"'));
assert('wrangler keeps real Cloudflare D1 ids out of repo',
  !/database_id\s*=\s*"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/i.test(wrangler));
assert('wrangler keeps replay writes disabled by default',
  (wrangler.match(/TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"/g) || []).length >= 3
    && (wrangler.match(/TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"/g) || []).length >= 3);

const workerEnvExample = read('workers/.dev.vars.example');
assert('worker env example uses placeholders only',
  workerEnvExample.includes('GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && !/client_secret|token|cookie/i.test(workerEnvExample));

const pagesEnvExample = read('pages/.env.example');
assert('pages env example uses public client id and local API placeholder',
  pagesEnvExample.includes('VITE_GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && pagesEnvExample.includes('VITE_WORKER_API_BASE_URL=http://127.0.0.1:8787')
    && !/client_secret|token|cookie/i.test(pagesEnvExample));

const taskBoard = read('TASK_BOARD.md');
assert('TASK_BOARD marks D-049 Phase 2-9 batch complete',
  taskBoard.includes('[x] D-049 Phase 2-9 batch is complete'));

const packageJson = JSON.parse(read('package.json'));
assert('root package exposes webdev:plan:check',
  packageJson.scripts?.['webdev:plan:check'] === 'node scripts/webdev/verify-plan-state.mjs');
assert('root package exposes webdev:preview:preflight',
  packageJson.scripts?.['webdev:preview:preflight'] === 'node scripts/webdev/preview-preflight.mjs');
assert('root package exposes Gate A Cloudflare provision/deploy commands',
  packageJson.scripts?.['webdev:cloudflare:provision'] === 'node scripts/webdev/provision-cloudflare.mjs'
    && packageJson.scripts?.['webdev:preview:deploy'] === 'node scripts/webdev/deploy-cloudflare-preview.mjs');
assert('root package exposes Gate A preview smoke commands',
  packageJson.scripts?.['webdev:preview:smoke'] === 'node scripts/webdev/preview-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:core-smoke'] === 'node scripts/webdev/preview-core-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:ui-smoke'] === 'node scripts/webdev/preview-ui-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:ui-smoke'));
assert('root package exposes Gate R readiness-only check',
  packageJson.scripts?.['webdev:prod:readiness'] === 'node scripts/webdev/prod-readiness-check.mjs'
    && packageJson.scripts?.['webdev:prod:package'] === 'node scripts/webdev/prod-readiness-package.mjs'
    && prodReadiness.includes('webdev:prod:package')
    && checklist.includes('webdev:prod:package'));
assert('root package exposes Gate D Browser Extension readiness-only check',
  packageJson.scripts?.['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs'
    && checklist.includes('webdev:extension:readiness')
    && prodReadiness.includes('webdev:extension:readiness')
    && taskBoard.includes('webdev:extension:readiness'));
assert('webdev:verify runs plan-state check',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:plan:check'));
assert('webdev:verify runs preview preflight',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:preview:preflight'));
assert('root package exposes local WebDev Desktop Runtime smoke',
  packageJson.scripts?.['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs'
    && packageJson.scripts?.['webdev:desktop:smoke'] === 'node scripts/webdev/desktop-runtime-smoke.mjs'
    && checklist.includes('webdev:desktop:readiness')
    && checklist.includes('webdev:desktop:smoke')
    && parityChecklist.includes('webdev:desktop:smoke')
    && previewRunbook.includes('webdev:desktop:smoke')
    && previewRunbook.includes('Gate E'));
assert('root package exposes local WebDev acceptance command',
  packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:verify')
    && packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:ui:walkthrough')
    && packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:extension:readiness')
    && packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:desktop:readiness')
    && packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:desktop:smoke')
    && checklist.includes('webdev:acceptance:local'));

const forbiddenPatterns = [
  /AIza[0-9A-Za-z_-]{20,}/,
  /ya29\.[0-9A-Za-z_-]+/,
  new RegExp('GOC' + 'SPX-[0-9A-Za-z_-]+'),
  /database_id\s*=\s*"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/i
];
const scanned = [
  checklist,
  parityChecklist,
  previewRunbook,
  prodReadiness,
  workerEnvExample,
  pagesEnvExample,
  wrangler
].join('\n');
assert('plan-state files do not contain obvious secrets or real ids',
  forbiddenPatterns.every(pattern => !pattern.test(scanned)));

if (failed > 0) {
  console.error(`\n${failed} WebDev plan-state checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nAll ${passed} WebDev plan-state checks passed.`);
