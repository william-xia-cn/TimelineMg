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

function assertNoForbiddenContent(description, text) {
  const forbiddenPatterns = [
    /AIza[0-9A-Za-z_-]{20,}/,
    /ya29\.[0-9A-Za-z_-]+/,
    new RegExp('GOC' + 'SPX-[0-9A-Za-z_-]+'),
    new RegExp('cloudflare_' + 'api_token|' + 'CF_API_' + 'TOKEN', 'i'),
    /client_secret\s*=/i,
    /database_id\s*=\s*"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/i,
    /id\s*=\s*"[a-f0-9]{32}"/i
  ];
  assert(description, forbiddenPatterns.every(pattern => !pattern.test(text)));
}

console.log('WebDev preview preflight');
console.log('========================');

const requiredFiles = [
  'workers/wrangler.toml',
  'workers/.dev.vars.example',
  'pages/.env.example',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'scripts/webdev/provision-cloudflare.mjs',
  'scripts/webdev/deploy-cloudflare-preview.mjs',
  'scripts/webdev/preview-smoke.mjs',
  'scripts/webdev/preview-core-smoke.mjs',
  'scripts/webdev/preview-ui-smoke.mjs',
  'scripts/webdev/ui-walkthrough.mjs',
  'scripts/webdev/desktop-runtime-smoke.mjs'
];

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const workerEnvExample = exists('workers/.dev.vars.example') ? read('workers/.dev.vars.example') : '';
const pagesEnvExample = exists('pages/.env.example') ? read('pages/.env.example') : '';
const previewRunbook = exists('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md')
  ? read('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md')
  : '';
const completionChecklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md')
  ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md')
  : '';
const prodReadiness = exists('docs/WEBDEV_PROD_READINESS_CHECKLIST.md')
  ? read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md')
  : '';
const gitignore = exists('.gitignore') ? read('.gitignore') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };

assert('wrangler separates dev preview and prod workers',
  wrangler.includes('name = "timewhere-dev-api"')
    && wrangler.includes('[env.preview]')
    && wrangler.includes('name = "timewhere-preview-api"')
    && wrangler.includes('[env.prod]')
    && wrangler.includes('name = "timewhere-api"'));
assert('wrangler uses environment-specific D1 names',
  wrangler.includes('database_name = "timewhere-dev-db"')
    && wrangler.includes('database_name = "timewhere-preview-db"')
    && wrangler.includes('database_name = "timewhere-db"'));
assert('wrangler uses environment-specific R2 bucket names',
  wrangler.includes('bucket_name = "timewhere-dev-snapshots"')
    && wrangler.includes('bucket_name = "timewhere-preview-snapshots"')
    && wrangler.includes('bucket_name = "timewhere-snapshots"'));
assert('wrangler keeps D1 and KV resource ids as placeholders',
  wrangler.includes('REPLACE_WITH_DEV_D1_ID')
    && wrangler.includes('REPLACE_WITH_PREVIEW_D1_ID')
    && wrangler.includes('REPLACE_WITH_PROD_D1_ID')
    && wrangler.includes('REPLACE_WITH_DEV_KV_ID')
    && wrangler.includes('REPLACE_WITH_PREVIEW_KV_ID')
    && wrangler.includes('REPLACE_WITH_PROD_KV_ID'));
assert('wrangler keeps replay writes disabled in every environment',
  (wrangler.match(/TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"/g) || []).length >= 3
    && (wrangler.match(/TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"/g) || []).length >= 3);
assert('committed wrangler does not embed Google OIDC client ids',
  (wrangler.match(/GOOGLE_OIDC_CLIENT_ID = ""/g) || []).length >= 3);

assert('worker env example documents local dev placeholders only',
  workerEnvExample.includes('GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && workerEnvExample.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH=on')
    && workerEnvExample.includes('TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED=false'));
assert('pages env example points local dev at local Worker and public OIDC client placeholder',
  pagesEnvExample.includes('VITE_WORKER_API_BASE_URL=http://127.0.0.1:8787')
    && pagesEnvExample.includes('VITE_GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com'));
assert('local secret-bearing env files are ignored',
  gitignore.includes('workers/.dev.vars')
    && gitignore.includes('pages/.env.local')
    && gitignore.includes('.env.local'));

assert('preview runbook records Gate A precondition and stop conditions',
  previewRunbook.includes('Gate A')
    && previewRunbook.includes('Stop Conditions')
    && previewRunbook.includes('Preview Acceptance Evidence'));
assert('preview runbook keeps Gate E and Gate R out of preview smoke',
  previewRunbook.includes('Gate E')
    && previewRunbook.includes('Gate R')
    && previewRunbook.includes('不生成安装包')
    && previewRunbook.includes('不签名'));
assert('completion checklist points to preview and prod readiness docs',
  completionChecklist.includes('WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md')
    && completionChecklist.includes('WEBDEV_PROD_READINESS_CHECKLIST.md'));
assert('prod readiness checklist says readiness is not release',
  prodReadiness.includes('Gate R')
    && prodReadiness.includes('不等于发布'));

assert('root package exposes preview preflight script',
  packageJson.scripts?.['webdev:preview:preflight'] === 'node scripts/webdev/preview-preflight.mjs');
assert('root package exposes Cloudflare provision and preview deploy scripts',
  packageJson.scripts?.['webdev:cloudflare:provision'] === 'node scripts/webdev/provision-cloudflare.mjs'
    && packageJson.scripts?.['webdev:preview:deploy'] === 'node scripts/webdev/deploy-cloudflare-preview.mjs');
assert('root package exposes preview smoke script',
  packageJson.scripts?.['webdev:preview:smoke'] === 'node scripts/webdev/preview-smoke.mjs');
assert('root package exposes preview core smoke script',
  packageJson.scripts?.['webdev:preview:core-smoke'] === 'node scripts/webdev/preview-core-smoke.mjs');
assert('root package exposes preview UI smoke script',
  packageJson.scripts?.['webdev:preview:ui-smoke'] === 'node scripts/webdev/preview-ui-smoke.mjs');
assert('root package exposes preview acceptance aggregate script',
  packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:smoke')
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:core-smoke')
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:ui-smoke'));
assert('webdev verify runs preview preflight',
  packageJson.scripts?.['webdev:verify']?.includes('npm run webdev:preview:preflight'));

assertNoForbiddenContent('preflight-scanned files do not contain obvious secrets or real ids',
  [
    wrangler,
    workerEnvExample,
    pagesEnvExample,
    previewRunbook,
    completionChecklist,
    prodReadiness
  ].join('\n'));

if (failed > 0) {
  console.error(`\n${failed} WebDev preview preflight checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nAll ${passed} WebDev preview preflight checks passed.`);
