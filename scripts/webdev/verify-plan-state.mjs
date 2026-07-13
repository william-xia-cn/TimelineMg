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
const targetArchitecturePath = 'docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md';
assert('target architecture status baseline exists', exists(targetArchitecturePath));
const previewRunbookPath = 'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md';
assert('preview acceptance runbook exists', exists(previewRunbookPath));
const prodReadinessPath = 'docs/WEBDEV_PROD_READINESS_CHECKLIST.md';
assert('prod readiness checklist exists', exists(prodReadinessPath));
const observabilityRunbookPath = 'docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md';
assert('observability backup runbook exists', exists(observabilityRunbookPath));
const taskReplayGateBPath = 'docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md';
assert('Task replay Gate B readiness packet exists', exists(taskReplayGateBPath));
const nonTaskReplayGateCPath = 'docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md';
assert('non-Task replay Gate C readiness packet exists', exists(nonTaskReplayGateCPath));
const browserExtensionGateDPath = 'docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md';
assert('Browser Extension Gate D readiness packet exists', exists(browserExtensionGateDPath));
const desktopRuntimeGateEPath = 'docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md';
assert('Desktop Runtime Gate E readiness packet exists', exists(desktopRuntimeGateEPath));

const checklist = exists(checklistPath) ? read(checklistPath) : '';
const parityChecklist = exists(parityPath) ? read(parityPath) : '';
const targetArchitecture = exists(targetArchitecturePath) ? read(targetArchitecturePath) : '';
const previewRunbook = exists(previewRunbookPath) ? read(previewRunbookPath) : '';
const prodReadiness = exists(prodReadinessPath) ? read(prodReadinessPath) : '';
const observabilityRunbook = exists(observabilityRunbookPath) ? read(observabilityRunbookPath) : '';
const taskReplayGateB = exists(taskReplayGateBPath) ? read(taskReplayGateBPath) : '';
const nonTaskReplayGateC = exists(nonTaskReplayGateCPath) ? read(nonTaskReplayGateCPath) : '';
const browserExtensionGateD = exists(browserExtensionGateDPath) ? read(browserExtensionGateDPath) : '';
const desktopRuntimeGateE = exists(desktopRuntimeGateEPath) ? read(desktopRuntimeGateEPath) : '';
for (const phase of ['Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7', 'Phase 8', 'Phase 9', 'Phase 10']) {
  assert(`${phase} is represented in completion checklist`, checklist.includes(phase));
}
for (const gate of ['Gate A', 'Gate B', 'Gate C', 'Gate D', 'Gate E', 'Gate R']) {
  assert(`${gate} boundary is represented in completion checklist`, checklist.includes(gate));
}
assert('completion checklist records remaining approval gate register',
  checklist.includes('Remaining Approval Gate Register')
    && checklist.includes('Task replay 写 Cloud')
    && checklist.includes('Calendar / Container / Settings replay')
    && checklist.includes('Browser Extension 第一阶段范围')
    && checklist.includes('Desktop Runtime 内部包')
    && checklist.includes('prod Cloudflare resources')
    && checklist.includes('Not approved')
    && checklist.includes('readiness_complete_pending_approval_gates')
    && checklist.includes('separate Product Owner decision'));
for (const capability of ['Tasks CRUD', 'Calendar Events CRUD', 'Daily Settle projection', 'Automatic migration', 'Desktop Runtime']) {
  assert(`${capability} is represented in business parity checklist`, parityChecklist.includes(capability));
}
assert('target architecture records current implementation status and remaining gates',
  targetArchitecture.includes('Active architecture baseline with implementation status')
    && targetArchitecture.includes('D-048 initial scaffold is complete')
    && targetArchitecture.includes('D-049 Phase 2-9 is complete')
    && targetArchitecture.includes('Gate A dev / preview resources and preview smoke are complete')
    && targetArchitecture.includes('Gate B')
    && targetArchitecture.includes('Gate C')
    && targetArchitecture.includes('Gate D')
    && targetArchitecture.includes('Gate E')
    && targetArchitecture.includes('Gate R'));
assert('preview runbook records Gate A evidence boundary',
  previewRunbook.includes('Gate A')
    && previewRunbook.includes('Preview Acceptance Evidence')
    && previewRunbook.includes('Desktop Runtime Preview Smoke')
    && previewRunbook.includes('Stop Conditions'));
assert('prod readiness checklist records Gate R non-release boundary',
  prodReadiness.includes('Gate R')
    && prodReadiness.includes('Prod Readiness Package')
    && prodReadiness.includes('WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md')
    && prodReadiness.includes('Security / Privacy Readiness')
    && prodReadiness.includes('不等于发布'));
assert('observability backup runbook records readiness-only boundary',
  observabilityRunbook.includes('Gate R readiness runbook')
    && observabilityRunbook.includes('D1 schema-only export rehearsal')
    && observabilityRunbook.includes('R2 migration snapshot')
    && observabilityRunbook.includes('npm run webdev:observability:readiness'));
assert('Task replay Gate B packet records readiness-only boundary',
  taskReplayGateB.includes('Gate B readiness packet')
    && taskReplayGateB.includes('不批准、不开启、不发布')
    && taskReplayGateB.includes('Task delete 继续保持用户侧阻断')
    && taskReplayGateB.includes('Calendar / Container / Settings replay 不包含在 Gate B')
    && taskReplayGateB.includes('npm.cmd run webdev:gate-b:readiness'));
assert('non-Task replay Gate C packet records readiness-only boundary',
  nonTaskReplayGateC.includes('Gate C readiness packet')
    && nonTaskReplayGateC.includes('不批准、不开启、不实现 Calendar / Container / Settings replay')
    && nonTaskReplayGateC.includes('C1 Calendar')
    && nonTaskReplayGateC.includes('C2 Structure')
    && nonTaskReplayGateC.includes('C3 Settings')
    && nonTaskReplayGateC.includes('npm.cmd run webdev:gate-c:readiness'));
assert('Browser Extension Gate D packet records readiness-only boundary',
  browserExtensionGateD.includes('Gate D readiness packet')
    && browserExtensionGateD.includes('不批准、不开启、不实现 Browser Extension WebDev replay')
    && browserExtensionGateD.includes('不提交 CWS')
    && browserExtensionGateD.includes('Extension IndexedDB 不作为 canonical data source')
    && browserExtensionGateD.includes('npm.cmd run webdev:extension:readiness'));
assert('Desktop Runtime Gate E packet records readiness-only boundary',
  desktopRuntimeGateE.includes('Gate E readiness packet')
    && desktopRuntimeGateE.includes('不批准、不开启、不执行 Desktop internal package')
    && desktopRuntimeGateE.includes('不签名、不公证、不 staple')
    && desktopRuntimeGateE.includes('Desktop preload 不暴露 Task / Calendar / Migration 业务 API')
    && desktopRuntimeGateE.includes('npm.cmd run webdev:desktop:readiness'));

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
assert('root package exposes Gate R internal prod verification commands',
  packageJson.scripts?.['webdev:prod:readiness'] === 'node scripts/webdev/prod-readiness-check.mjs'
    && packageJson.scripts?.['webdev:prod:provision'] === 'node scripts/webdev/provision-cloudflare-prod.mjs'
    && packageJson.scripts?.['webdev:prod:deploy'] === 'node scripts/webdev/deploy-cloudflare-prod.mjs'
    && packageJson.scripts?.['webdev:prod:acceptance']?.includes('npm run webdev:prod:data-hygiene-smoke')
    && packageJson.scripts?.['webdev:prod:package'] === 'node scripts/webdev/prod-readiness-package.mjs'
    && packageJson.scripts?.['webdev:prod:evidence'] === 'node scripts/webdev/prod-evidence-runner.mjs'
    && packageJson.scripts?.['webdev:prod:evidence:check'] === 'node scripts/webdev/prod-evidence-summary-check.mjs'
    && prodReadiness.includes('webdev:prod:package')
    && prodReadiness.includes('webdev:prod:provision')
    && prodReadiness.includes('webdev:prod:deploy')
    && prodReadiness.includes('webdev:prod:acceptance')
    && prodReadiness.includes('webdev:prod:evidence')
    && prodReadiness.includes('webdev:prod:evidence:check')
    && checklist.includes('webdev:prod:package')
    && checklist.includes('webdev:prod:evidence')
    && checklist.includes('webdev:prod:evidence:check'));
assert('root package exposes WebDev completion audit',
  packageJson.scripts?.['webdev:completion:audit'] === 'node scripts/webdev/completion-audit.mjs'
    && checklist.includes('webdev:completion:audit'));
assert('root package exposes Gate D Browser Extension readiness-only check',
  packageJson.scripts?.['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs'
    && checklist.includes('webdev:extension:readiness')
    && checklist.includes('WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md')
    && browserExtensionGateD.includes('webdev:extension:readiness')
    && prodReadiness.includes('webdev:extension:readiness')
    && taskBoard.includes('webdev:extension:readiness'));
assert('root package exposes observability backup readiness-only check',
  packageJson.scripts?.['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs'
    && checklist.includes('webdev:observability:readiness')
    && prodReadiness.includes('webdev:observability:readiness')
    && observabilityRunbook.includes('webdev:observability:readiness'));
assert('root package exposes Task replay Gate B readiness-only check',
  packageJson.scripts?.['webdev:gate-b:readiness'] === 'node scripts/webdev/task-replay-gate-b-readiness-check.mjs'
    && checklist.includes('webdev:gate-b:readiness')
    && taskReplayGateB.includes('webdev:gate-b:readiness')
    && taskBoard.includes('webdev:gate-b:readiness'));
assert('root package exposes non-Task replay Gate C readiness-only check',
  packageJson.scripts?.['webdev:gate-c:readiness'] === 'node scripts/webdev/non-task-replay-gate-c-readiness-check.mjs'
    && checklist.includes('webdev:gate-c:readiness')
    && nonTaskReplayGateC.includes('webdev:gate-c:readiness')
    && taskBoard.includes('webdev:gate-c:readiness'));
assert('webdev:verify runs plan-state check',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:plan:check'));
assert('webdev:verify runs preview preflight',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:preview:preflight'));
assert('webdev:verify runs Task replay Gate B readiness',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:gate-b:readiness'));
assert('webdev:verify runs non-Task replay Gate C readiness',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:gate-c:readiness'));
assert('root package exposes local WebDev Desktop Runtime smoke',
  packageJson.scripts?.['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs'
    && packageJson.scripts?.['webdev:desktop:smoke'] === 'node scripts/webdev/desktop-runtime-smoke.mjs'
    && checklist.includes('webdev:desktop:readiness')
    && checklist.includes('WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md')
    && desktopRuntimeGateE.includes('webdev:desktop:readiness')
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
  observabilityRunbook,
  taskReplayGateB,
  nonTaskReplayGateC,
  browserExtensionGateD,
  desktopRuntimeGateE,
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
