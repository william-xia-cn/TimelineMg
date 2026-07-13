import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md',
  'workers/wrangler.toml',
  'workers/.dev.vars.example',
  'pages/.env.example',
  'pages/public/_headers',
  'scripts/webdev/browser-extension-readiness-check.mjs',
  'scripts/webdev/desktop-runtime-readiness-check.mjs',
  'scripts/webdev/observability-backup-readiness-check.mjs',
  'scripts/webdev/prod-readiness-package.mjs',
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
const observabilityRunbook = exists('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') ? read('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') : '';
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const workerEnvExample = exists('workers/.dev.vars.example') ? read('workers/.dev.vars.example') : '';
const pagesEnvExample = exists('pages/.env.example') ? read('pages/.env.example') : '';
const pagesHeaders = exists('pages/public/_headers') ? read('pages/public/_headers') : '';
const extensionReadinessCheck = exists('scripts/webdev/browser-extension-readiness-check.mjs') ? read('scripts/webdev/browser-extension-readiness-check.mjs') : '';
const desktopReadinessCheck = exists('scripts/webdev/desktop-runtime-readiness-check.mjs') ? read('scripts/webdev/desktop-runtime-readiness-check.mjs') : '';
const observabilityReadinessCheck = exists('scripts/webdev/observability-backup-readiness-check.mjs') ? read('scripts/webdev/observability-backup-readiness-check.mjs') : '';
const prodReadinessPackage = exists('scripts/webdev/prod-readiness-package.mjs') ? read('scripts/webdev/prod-readiness-package.mjs') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };
const gitignore = exists('.gitignore') ? read('.gitignore') : '';

assert('prod readiness explicitly says it is not release',
  prodChecklist.includes('不等于发布')
    && prodChecklist.includes('不批准 prod deployment')
    && prodChecklist.includes('GitHub Release')
    && prodChecklist.includes('tag')
    && prodChecklist.includes('CWS'));

assert('Gate R remains required for prod actions',
  prodChecklist.includes('Gate R')
    && prodChecklist.includes('Approve prod resource creation?')
    && prodChecklist.includes('Approve prod deployment?')
    && completionChecklist.includes('| R | prod deployment')
    && projectMaster.includes('Prod deploy/release remains unapproved'));

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

assert('local and preview scripts exist but prod deploy script is not exposed',
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
    && packageJson.scripts?.['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs'
    && packageJson.scripts?.['webdev:prod:readiness'] === 'node scripts/webdev/prod-readiness-check.mjs'
    && packageJson.scripts?.['webdev:prod:package'] === 'node scripts/webdev/prod-readiness-package.mjs'
    && !packageJson.scripts?.['webdev:prod:deploy']
    && !packageJson.scripts?.['webdev:release']);

assert('Browser Extension readiness stays Gate D only',
  extensionReadinessCheck.includes('WebDev Browser Extension readiness static check')
    && extensionReadinessCheck.includes('Gate D')
    && extensionReadinessCheck.includes('Browser Extension remains explicitly deferred')
    && extensionReadinessCheck.includes('no WebDev replay endpoint integration')
    && extensionReadinessCheck.includes('No Extension replay, CWS submission, release, or deployment was performed')
    && extensionReadinessCheck.includes("!packageJson.scripts?.['webdev:extension:deploy']"));

assert('Desktop Runtime readiness stays Gate E only',
  desktopReadinessCheck.includes('WebDev Desktop Runtime readiness static check')
    && desktopReadinessCheck.includes('Gate E')
    && desktopReadinessCheck.includes('No desktop package was built, signed, notarized, or distributed')
    && desktopReadinessCheck.includes('business_logic_owner')
    && desktopReadinessCheck.includes('installWebDevNavigationGuards')
    && desktopReadinessCheck.includes("!desktopSmoke.includes('electron-builder')"));

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
    && prodReadinessPackage.includes('readiness-only')
    && prodReadinessPackage.includes('Gate R: not approved')
    && prodReadinessPackage.includes('webdev:preview:acceptance')
    && prodReadinessPackage.includes('webdev:extension:readiness')
    && prodReadinessPackage.includes('webdev:desktop:readiness')
    && prodReadinessPackage.includes('webdev:observability:readiness')
    && prodReadinessPackage.includes('webdev:prod:readiness')
    && prodReadinessPackage.includes('Re-deploy previous Worker commit')
    && !prodReadinessPackage.includes('wrangler deploy')
    && !prodReadinessPackage.includes('pages deploy'));

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
    observabilityRunbook,
    projectMaster,
    taskBoard,
    wrangler,
    workerEnvExample,
    pagesEnvExample,
    pagesHeaders,
    extensionReadinessCheck,
    desktopReadinessCheck,
    observabilityReadinessCheck,
    prodReadinessPackage,
    gitignore
  ].join('\n'));

if (failed > 0) {
  console.error(`\n${failed} WebDev prod readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('==================================');
console.log(`All ${passed} WebDev prod readiness checks passed.`);
console.log('This is readiness evidence only. No prod resource was created, deployed, released, tagged, or published.');
