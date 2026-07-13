import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md',
  'workers/wrangler.toml',
  'workers/.dev.vars.example',
  'pages/.env.example',
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
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const workerEnvExample = exists('workers/.dev.vars.example') ? read('workers/.dev.vars.example') : '';
const pagesEnvExample = exists('pages/.env.example') ? read('pages/.env.example') : '';
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
    && previewRunbook.includes('npm run webdev:preview:core-smoke')
    && previewRunbook.includes('npm run webdev:preview:ui-smoke')
    && previewRunbook.includes('npm run webdev:preview:acceptance')
    && previewRunbook.includes('Migration import')
    && completionChecklist.includes('Preview UI smoke complete under Gate A')
    && completionChecklist.includes('Migration import / idempotent retry / conflict / resolution')
    && taskBoard.includes('webdev:preview:core-smoke'));

assert('local and preview scripts exist but prod deploy script is not exposed',
  packageJson.scripts?.['webdev:preview:smoke'] === 'node scripts/webdev/preview-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:core-smoke'] === 'node scripts/webdev/preview-core-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:ui-smoke'] === 'node scripts/webdev/preview-ui-smoke.mjs'
    && packageJson.scripts?.['webdev:preview:acceptance']?.includes('npm run webdev:preview:core-smoke')
    && packageJson.scripts?.['webdev:prod:readiness'] === 'node scripts/webdev/prod-readiness-check.mjs'
    && !packageJson.scripts?.['webdev:prod:deploy']
    && !packageJson.scripts?.['webdev:release']);

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

assertNoObviousSecrets('prod readiness scanned files contain no obvious secrets',
  [
    prodChecklist,
    previewRunbook,
    completionChecklist,
    projectMaster,
    taskBoard,
    wrangler,
    workerEnvExample,
    pagesEnvExample,
    gitignore
  ].join('\n'));

if (failed > 0) {
  console.error(`\n${failed} WebDev prod readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('==================================');
console.log(`All ${passed} WebDev prod readiness checks passed.`);
console.log('This is readiness evidence only. No prod resource was created, deployed, released, tagged, or published.');
