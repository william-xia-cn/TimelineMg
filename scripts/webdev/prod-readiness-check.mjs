import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md',
  'docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md',
  'docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md',
  'docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md',
  'docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md',
  'workers/wrangler.toml',
  'workers/.dev.vars.example',
  'pages/.env.example',
  'pages/public/_headers',
  'scripts/webdev/browser-extension-readiness-check.mjs',
  'scripts/webdev/desktop-runtime-readiness-check.mjs',
  'scripts/webdev/task-replay-gate-b-readiness-check.mjs',
  'scripts/webdev/non-task-replay-gate-c-readiness-check.mjs',
  'scripts/webdev/observability-backup-readiness-check.mjs',
  'scripts/webdev/prod-readiness-package.mjs',
  'scripts/webdev/prod-evidence-runner.mjs',
  'scripts/webdev/prod-evidence-summary-check.mjs',
  'scripts/webdev/provision-cloudflare-prod.mjs',
  'scripts/webdev/deploy-cloudflare-prod.mjs',
  'scripts/webdev/prod-headers-smoke.mjs',
  'scripts/webdev/prod-sso-smoke.mjs',
  'scripts/webdev/prod-smoke.mjs',
  'scripts/webdev/prod-core-smoke.mjs',
  'scripts/webdev/prod-ui-smoke.mjs',
  'scripts/webdev/prod-data-hygiene-smoke.mjs',
  'scripts/webdev/completion-audit.mjs',
  'package.json',
  '.gitignore'
];

const obviousSecretPatterns = [
  new RegExp('GOC' + 'SPX-', 'i'),
  new RegExp('ya' + '29\\.', 'i'),
  new RegExp('CLOUDFLARE_' + 'API_' + 'TOKEN\\s*=', 'i'),
  new RegExp('CF_' + 'API_' + 'TOKEN\\s*=', 'i'),
  new RegExp('BEGIN (RSA |EC |OPENSSH |)' + 'PRIVATE KEY', 'i'),
  new RegExp('client_' + 'secret\\s*[:=]\\s*["\'][^"\']+', 'i')
];

let passed = 0;
let failed = 0;

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${name}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${name}`);
}

function assertNoObviousSecrets(name, text) {
  assert(name, !obviousSecretPatterns.some(pattern => pattern.test(text)));
}

console.log('WebDev prod readiness static check');
console.log('==================================');

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const prodChecklist = exists('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') ? read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') : '';
const previewRunbook = exists('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md') ? read('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md') : '';
const completionChecklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md') ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md') : '';
const browserExtensionGateD = exists('docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md') ? read('docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md') : '';
const desktopRuntimeGateE = exists('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md') ? read('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md') : '';
const observabilityRunbook = exists('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') ? read('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') : '';
const taskReplayGateB = exists('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md') ? read('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md') : '';
const nonTaskReplayGateC = exists('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md') ? read('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md') : '';
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const workerEnvExample = exists('workers/.dev.vars.example') ? read('workers/.dev.vars.example') : '';
const pagesEnvExample = exists('pages/.env.example') ? read('pages/.env.example') : '';
const pagesHeaders = exists('pages/public/_headers') ? read('pages/public/_headers') : '';
const extensionReadinessCheck = exists('scripts/webdev/browser-extension-readiness-check.mjs') ? read('scripts/webdev/browser-extension-readiness-check.mjs') : '';
const desktopReadinessCheck = exists('scripts/webdev/desktop-runtime-readiness-check.mjs') ? read('scripts/webdev/desktop-runtime-readiness-check.mjs') : '';
const taskReplayGateBCheck = exists('scripts/webdev/task-replay-gate-b-readiness-check.mjs') ? read('scripts/webdev/task-replay-gate-b-readiness-check.mjs') : '';
const nonTaskReplayGateCCheck = exists('scripts/webdev/non-task-replay-gate-c-readiness-check.mjs') ? read('scripts/webdev/non-task-replay-gate-c-readiness-check.mjs') : '';
const observabilityReadinessCheck = exists('scripts/webdev/observability-backup-readiness-check.mjs') ? read('scripts/webdev/observability-backup-readiness-check.mjs') : '';
const prodReadinessPackage = exists('scripts/webdev/prod-readiness-package.mjs') ? read('scripts/webdev/prod-readiness-package.mjs') : '';
const prodEvidenceRunner = exists('scripts/webdev/prod-evidence-runner.mjs') ? read('scripts/webdev/prod-evidence-runner.mjs') : '';
const prodEvidenceSummaryCheck = exists('scripts/webdev/prod-evidence-summary-check.mjs') ? read('scripts/webdev/prod-evidence-summary-check.mjs') : '';
const prodProvision = exists('scripts/webdev/provision-cloudflare-prod.mjs') ? read('scripts/webdev/provision-cloudflare-prod.mjs') : '';
const prodDeploy = exists('scripts/webdev/deploy-cloudflare-prod.mjs') ? read('scripts/webdev/deploy-cloudflare-prod.mjs') : '';
const prodSsoSmoke = exists('scripts/webdev/prod-sso-smoke.mjs') ? read('scripts/webdev/prod-sso-smoke.mjs') : '';
const prodSmoke = exists('scripts/webdev/prod-smoke.mjs') ? read('scripts/webdev/prod-smoke.mjs') : '';
const prodCoreSmoke = exists('scripts/webdev/prod-core-smoke.mjs') ? read('scripts/webdev/prod-core-smoke.mjs') : '';
const prodUiSmoke = exists('scripts/webdev/prod-ui-smoke.mjs') ? read('scripts/webdev/prod-ui-smoke.mjs') : '';
const prodDataHygieneSmoke = exists('scripts/webdev/prod-data-hygiene-smoke.mjs') ? read('scripts/webdev/prod-data-hygiene-smoke.mjs') : '';
const completionAudit = exists('scripts/webdev/completion-audit.mjs') ? read('scripts/webdev/completion-audit.mjs') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };
const gitignore = exists('.gitignore') ? read('.gitignore') : '';

assert('prod readiness explicitly says it is not release',
  prodChecklist.includes('不等于发布')
    && prodChecklist.includes('已批准创建/确认 prod Cloudflare resource')
    && prodChecklist.includes('GitHub Release')
    && prodChecklist.includes('tag')
    && prodChecklist.includes('CWS'));

assert('Gate R internal prod verification is approved while public release remains gated',
  prodChecklist.includes('Gate R')
    && prodChecklist.includes('webdev:prod:provision')
    && prodChecklist.includes('webdev:prod:deploy')
    && completionChecklist.includes('| R | 内部 prod verification 已批准')
    && projectMaster.includes('Gate R internal prod verification is approved'));

assert('prod wrangler names are present but ids remain placeholders',
  wrangler.includes('[env.prod]')
    && wrangler.includes('name = "timewhere-api"')
    && wrangler.includes('database_name = "timewhere-db"')
    && wrangler.includes('bucket_name = "timewhere-snapshots"')
    && wrangler.includes('REPLACE_WITH_PROD_D1_ID')
    && wrangler.includes('REPLACE_WITH_PROD_KV_ID')
    && !/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(wrangler));

assert('prod replay write switches stay off by default',
  wrangler.includes('[env.prod.vars]')
    && wrangler.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"')
    && wrangler.includes('TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"')
    && prodChecklist.includes('user-facing replay 写 Cloud 仍需 Gate B')
    && prodChecklist.includes('Calendar / Container / Settings replay 仍需 Gate C'));

assert('preview evidence commands are represented before prod readiness',
  previewRunbook.includes('npm run webdev:preview:smoke')
    && previewRunbook.includes('npm run webdev:preview:headers-smoke')
    && previewRunbook.includes('npm run webdev:preview:core-smoke')
    && previewRunbook.includes('npm run webdev:preview:ui-smoke')
    && previewRunbook.includes('npm run webdev:preview:data-hygiene-smoke')
    && previewRunbook.includes('npm run webdev:preview:acceptance')
    && previewRunbook.includes('Migration import')
    && completionChecklist.includes('Preview acceptance hardened under Gate A')
    && completionChecklist.includes('Migration import / idempotent retry / conflict / resolution')
    && taskBoard.includes('webdev:preview:core-smoke'));

assert('risk register and rollback plan are represented before Gate R',
  previewRunbook.includes('Preview Risk Register')
    && previewRunbook.includes('Preview Rollback / Cleanup Plan')
    && prodChecklist.includes('Release Risk Register')
    && prodChecklist.includes('Re-deploy previous Worker commit')
    && prodChecklist.includes('Preserve R2 migration snapshots')
    && prodChecklist.includes('Disable replay writes / keep kill switch on'));

assert('local, preview, and internal prod verification scripts exist while release scripts stay absent',
  packageJson.scripts?.['webdev:preview:smoke'] === 'node scripts/webdev/preview-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:headers-smoke'] === 'node scripts/webdev/preview-headers-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:core-smoke'] === 'node scripts/webdev/preview-core-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:ui-smoke'] === 'node scripts/webdev/preview-ui-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:data-hygiene-smoke'] === 'node scripts/webdev/preview-data-hygiene-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:headers-smoke')
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:core-smoke')
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:data-hygiene-smoke')
    && packageJson.scripts?.['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs'
    && packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:extension:readiness')
    && packageJson.scripts?.['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs'
    && packageJson.scripts?.['webdev:acceptance:local']?.includes('npm run webdev:desktop:readiness')
    && packageJson.scripts?.['webdev:gate-b:readiness'] === 'node scripts/webdev/task-replay-gate-b-readiness-check.mjs'
    && packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:gate-b:readiness')
    && packageJson.scripts?.['webdev:gate-c:readiness'] === 'node scripts/webdev/non-task-replay-gate-c-readiness-check.mjs'
    && packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:gate-c:readiness')
    && packageJson.scripts?.['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs'
    && packageJson.scripts?.['webdev:prod:readiness'] === 'node scripts/webdev/prod-readiness-check.mjs'
    && packageJson.scripts?.['webdev:prod:provision'] === 'node scripts/webdev/provision-cloudflare-prod.mjs'
    && packageJson.scripts?.['webdev:prod:deploy'] === 'node scripts/webdev/deploy-cloudflare-prod.mjs'
    && packageJson.scripts?.['webdev:prod:headers-smoke'] === 'node scripts/webdev/prod-headers-smoke.mjs'
    && packageJson.scripts?.['webdev:prod:sso-smoke'] === 'node scripts/webdev/prod-sso-smoke.mjs'
    && packageJson.scripts?.['webdev:prod:smoke'] === 'node scripts/webdev/prod-smoke.mjs'
    && packageJson.scripts?.['webdev:prod:core-smoke'] === 'node scripts/webdev/prod-core-smoke.mjs'
    && packageJson.scripts?.['webdev:prod:ui-smoke'] === 'node scripts/webdev/prod-ui-smoke.mjs'
    && packageJson.scripts?.['webdev:prod:data-hygiene-smoke'] === 'node scripts/webdev/prod-data-hygiene-smoke.mjs'
    && packageJson.scripts?.['webdev:prod:acceptance']?.includes('npm run webdev:prod:headers-smoke')
    && packageJson.scripts?.['webdev:prod:acceptance']?.includes('npm run webdev:prod:sso-smoke')
    && packageJson.scripts?.['webdev:prod:acceptance']?.includes('npm run webdev:prod:core-smoke')
    && packageJson.scripts?.['webdev:prod:acceptance']?.includes('npm run webdev:prod:data-hygiene-smoke')
    && packageJson.scripts?.['webdev:prod:package'] === 'node scripts/webdev/prod-readiness-package.mjs'
    && packageJson.scripts?.['webdev:prod:evidence'] === 'node scripts/webdev/prod-evidence-runner.mjs'
    && packageJson.scripts?.['webdev:prod:evidence:check'] === 'node scripts/webdev/prod-evidence-summary-check.mjs'
    && packageJson.scripts?.['webdev:completion:audit'] === 'node scripts/webdev/completion-audit.mjs'
    && !packageJson.scripts?.['webdev:release']
    && !packageJson.scripts?.['webdev:release']);

assert('prod provision/deploy scripts target only internal prod resources and local ignored state',
  prodProvision.includes('timewhere-api')
    && prodProvision.includes('timewhere-web')
    && prodProvision.includes('timewhere-db')
    && prodProvision.includes('timewhere-snapshots')
    && prodProvision.includes('timewhere-cache')
    && prodProvision.includes('timewhere-prod-resources.local.json')
    && prodProvision.includes('timewhere-webdev.prod.generated.wrangler.toml')
    && prodDeploy.includes('timewhere-prod-deployment.local.json')
    && prodDeploy.includes("'--env', 'prod'")
    && prodDeploy.includes('TimeWhere-WebDev-prod-deploy')
    && !prodProvision.includes('client_secret')
    && !prodDeploy.includes('client_secret'));

assert('prod smoke scripts use synthetic prod-smoke data and redact sensitive output',
  [prodSmoke, prodCoreSmoke, prodDataHygieneSmoke].every(script =>
    script.includes('prod-smoke')
      && script.includes('timewhere-prod-resources.local.json')
      && script.includes('timewhere-webdev.prod.generated.wrangler.toml')
      && script.includes('<email>')
      && script.includes('<user-home>'))
    && prodUiSmoke.includes('prod-ui-smoke')
    && prodUiSmoke.includes('timewhere-prod-resources.local.json')
    && prodUiSmoke.includes('timewhere-webdev.prod.generated.wrangler.toml')
    && prodUiSmoke.includes('<email>')
    && prodUiSmoke.includes('<user-home>')
    && prodCoreSmoke.includes('source_runtime: \'prod-core-smoke\'')
    && prodDataHygieneSmoke.includes('prod D1 has no smoke account/entity/migration references'));

assert('prod Google SSO smoke verifies GIS button without real account data',
  prodSsoSmoke.includes('https://timewhere-web.pages.dev')
    && prodSsoSmoke.includes('window.google?.accounts?.id')
    && prodSsoSmoke.includes('accounts.google.com')
    && prodSsoSmoke.includes('without using a real Google session, token, account email, or OAuth secret'));

assert('Browser Extension readiness stays Gate D only',
  extensionReadinessCheck.includes('WebDev Browser Extension readiness static check')
    && extensionReadinessCheck.includes('Gate D')
    && browserExtensionGateD.includes('Gate D readiness packet')
    && browserExtensionGateD.includes('不提交 CWS')
    && extensionReadinessCheck.includes('Browser Extension remains explicitly deferred')
    && extensionReadinessCheck.includes('Gate D packet is approval-only')
    && extensionReadinessCheck.includes('no WebDev replay endpoint integration')
    && extensionReadinessCheck.includes('No Extension replay, CWS submission, release, or deployment was performed')
    && extensionReadinessCheck.includes("!packageJson.scripts?.['webdev:extension:deploy']"));

assert('Desktop Runtime readiness stays Gate E only',
  desktopReadinessCheck.includes('WebDev Desktop Runtime readiness static check')
    && desktopReadinessCheck.includes('Gate E')
    && desktopRuntimeGateE.includes('Gate E readiness packet')
    && desktopRuntimeGateE.includes('不批准、不开启、不执行 Desktop internal package')
    && desktopRuntimeGateE.includes('不签名、不公证、不 staple')
    && desktopReadinessCheck.includes('No desktop package was built, signed, notarized, or distributed')
    && desktopReadinessCheck.includes('Gate E packet is approval-only')
    && desktopReadinessCheck.includes('business_logic_owner')
    && desktopReadinessCheck.includes('installWebDevNavigationGuards')
    && desktopReadinessCheck.includes("!desktopSmoke.includes('electron-builder')"));

assert('Task replay Gate B readiness stays approval-only',
  taskReplayGateB.includes('Gate B readiness packet')
    && taskReplayGateB.includes('不批准、不开启、不发布')
    && taskReplayGateB.includes('Task delete 继续保持用户侧阻断')
    && taskReplayGateBCheck.includes('WebDev Task replay Gate B readiness static check')
    && taskReplayGateBCheck.includes('test-only Task replay is constrained away from preview and prod')
    && taskReplayGateBCheck.includes('No replay write path was enabled for users, preview, or prod'));

assert('non-Task replay Gate C readiness stays approval-only',
  nonTaskReplayGateC.includes('Gate C readiness packet')
    && nonTaskReplayGateC.includes('不批准、不开启、不实现 Calendar / Container / Settings replay')
    && nonTaskReplayGateC.includes('C1 Calendar')
    && nonTaskReplayGateCCheck.includes('WebDev non-Task replay Gate C readiness static check')
    && nonTaskReplayGateCCheck.includes('Worker Task replay gate continues rejecting non-Task mutations')
    && nonTaskReplayGateCCheck.includes('No Calendar, Container, or Settings replay was implemented or enabled'));

assert('observability and backup readiness is represented without prod actions',
  observabilityRunbook.includes('WebDev Observability / Backup Readiness Runbook')
    && observabilityRunbook.includes('D1 schema-only export rehearsal')
    && observabilityRunbook.includes('R2 migration snapshot')
    && observabilityRunbook.includes('Stop Conditions')
    && observabilityReadinessCheck.includes('WebDev observability / backup readiness static check')
    && observabilityReadinessCheck.includes('No D1 export, R2 read, Wrangler command, prod resource, deploy, or release was performed')
    && packageJson.scripts?.['webdev:prod:package'] === 'node scripts/webdev/prod-readiness-package.mjs');

assert('prod readiness package is evidence-only and gate-aware',
  prodReadinessPackage.includes('WebDev Prod Readiness Package Draft')
    && prodReadinessPackage.includes('internal prod verification')
    && prodReadinessPackage.includes('Gate R: approved for internal prod verification')
    && prodReadinessPackage.includes('Required Evidence Commands Available')
    && prodReadinessPackage.includes('they do not prove the command was rerun for this commit')
    && prodReadinessPackage.includes('Attach a fresh status-only evidence summary before using this as internal prod verification evidence')
    && prodReadinessPackage.includes('Fresh Local Evidence Summary')
    && prodReadinessPackage.includes('Execution Evidence Status For Internal Prod Verification')
    && prodReadinessPackage.includes('evidenceSummaryCurrent')
    && prodReadinessPackage.includes('expectedEvidenceCommands')
    && prodReadinessPackage.includes('Evidence summary stores no raw output fields')
    && prodReadinessPackage.includes('webdev:preview:acceptance')
    && prodReadinessPackage.includes('Latest preview acceptance recheck is recorded')
    && prodReadinessPackage.includes('webdev:extension:readiness')
    && prodReadinessPackage.includes('webdev:desktop:readiness')
    && prodReadinessPackage.includes('webdev:gate-b:readiness')
    && prodReadinessPackage.includes('webdev:gate-c:readiness')
    && prodReadinessPackage.includes('webdev:observability:readiness')
    && prodReadinessPackage.includes('webdev:prod:readiness')
    && prodReadinessPackage.includes('webdev:prod:acceptance')
    && prodReadinessPackage.includes('webdev:prod:evidence')
    && prodReadinessPackage.includes('webdev:prod:evidence:check')
    && prodReadinessPackage.includes('Default mode is plan-only')
    && prodReadinessPackage.includes('.wrangler/webdev-gate-r-evidence-summary.json')
    && prodReadinessPackage.includes('current clean pushed HEAD')
    && prodReadinessPackage.includes('Upstream synced')
    && prodReadinessPackage.includes('Re-deploy previous Worker commit')
    && !prodReadinessPackage.includes('GitHub Release created'));

assert('prod evidence runner is status-only and release-gated',
  prodEvidenceRunner.includes('WebDev Gate R evidence runner')
    && prodEvidenceRunner.includes('Default mode is plan-only')
    && prodEvidenceRunner.includes('--run')
    && prodEvidenceRunner.includes('--allow-unpushed')
    && prodEvidenceRunner.includes('webdev-gate-r-evidence-summary.json')
    && prodEvidenceRunner.includes('upstream_synced')
    && prodEvidenceRunner.includes('HEAD does not match upstream')
    && prodEvidenceRunner.includes('needsShell')
    && prodEvidenceRunner.includes('error_code')
    && prodEvidenceRunner.includes('Raw command output is not stored')
    && prodEvidenceRunner.includes('release_boundary')
    && prodEvidenceRunner.includes('forbiddenCommandFragments')
    && prodEvidenceRunner.includes('webdev:prod:acceptance')
    && prodEvidenceRunner.includes('webdev:preview:acceptance')
    && prodEvidenceRunner.includes('webdev:completion:audit')
    && !prodEvidenceRunner.includes("command: 'git', args: ['push"));

assert('prod evidence summary check validates fresh status-only evidence',
  prodEvidenceSummaryCheck.includes('WebDev Gate R evidence summary check')
    && prodEvidenceSummaryCheck.includes('webdev-gate-r-evidence-summary.json')
    && prodEvidenceSummaryCheck.includes('timewhere-webdev-gate-r-evidence-v1')
    && prodEvidenceSummaryCheck.includes('origin/WebDev')
    && prodEvidenceSummaryCheck.includes('upstream_synced')
    && prodEvidenceSummaryCheck.includes('changed_files_sensitive_scan')
    && prodEvidenceSummaryCheck.includes('expectedCommandIds')
    && prodEvidenceSummaryCheck.includes('forbiddenRawOutputKeys')
    && prodEvidenceSummaryCheck.includes('Raw command output is not stored')
    && prodEvidenceSummaryCheck.includes('release_boundary')
    && prodEvidenceSummaryCheck.includes('Regenerate evidence on the current clean, pushed WebDev HEAD')
    && !prodEvidenceSummaryCheck.includes('wrangler deploy')
    && !prodEvidenceSummaryCheck.includes('pages deploy')
    && !prodEvidenceSummaryCheck.includes('gh release')
    && !prodEvidenceSummaryCheck.includes('git push'));

assert('completion audit is readiness-only and gate-aware',
  completionAudit.includes('WebDev completion audit')
    && completionAudit.includes('readiness_complete_pending_approval_gates')
    && completionAudit.includes('does not approve prod, replay, desktop distribution, CWS, tag, merge, or release')
    && !completionAudit.includes('wrangler deploy')
    && !completionAudit.includes('pages deploy'));

assert('local secret files and generated Cloudflare state stay ignored',
  gitignore.includes('.wrangler/')
    && gitignore.includes('workers/.wrangler/')
    && gitignore.includes('pages/.wrangler/')
    && gitignore.includes('workers/.dev.vars')
    && gitignore.includes('pages/.env.local')
    && gitignore.includes('.env.local'));

assert('env examples keep placeholders only',
  workerEnvExample.includes('GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && pagesEnvExample.includes('VITE_GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && !workerEnvExample.includes('client_secret')
    && !pagesEnvExample.includes('client_secret'));

assert('Pages security headers and cache policy are ready for preview/prod',
  pagesHeaders.includes('Content-Security-Policy:')
    && pagesHeaders.includes("frame-ancestors 'none'")
    && pagesHeaders.includes('X-Content-Type-Options: nosniff')
    && pagesHeaders.includes('Referrer-Policy: strict-origin-when-cross-origin')
    && pagesHeaders.includes('https://accounts.google.com')
    && pagesHeaders.includes('https://*.workers.dev')
    && pagesHeaders.includes('Cache-Control: public, max-age=31536000, immutable')
    && pagesHeaders.includes('/index.html')
    && pagesHeaders.includes('/\n  Cache-Control: no-store')
    && prodChecklist.includes('pages/public/_headers'));

assertNoObviousSecrets('prod readiness scanned files contain no obvious secrets',
  [
    prodChecklist,
    previewRunbook,
    completionChecklist,
    browserExtensionGateD,
    desktopRuntimeGateE,
    observabilityRunbook,
    projectMaster,
    taskBoard,
    wrangler,
    workerEnvExample,
    pagesEnvExample,
    pagesHeaders,
    extensionReadinessCheck,
    desktopReadinessCheck,
    taskReplayGateB,
    taskReplayGateBCheck,
    nonTaskReplayGateC,
    nonTaskReplayGateCCheck,
    observabilityReadinessCheck,
    prodReadinessPackage,
    prodEvidenceRunner,
    prodEvidenceSummaryCheck,
    prodProvision,
    prodDeploy,
    prodSsoSmoke,
    prodSmoke,
    prodCoreSmoke,
    prodUiSmoke,
    prodDataHygieneSmoke,
    completionAudit,
    gitignore
  ].join('\n'));

if (failed > 0) {
  console.error(`\n${failed} WebDev prod readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('==================================');
console.log(`All ${passed} WebDev prod readiness checks passed.`);
console.log('This is internal prod verification readiness evidence. The check itself created no prod resource, deployed nothing, and did not release, tag, or publish.');
