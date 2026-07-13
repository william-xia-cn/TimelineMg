import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md',
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'workers/src/http.ts',
  'workers/src/migration.ts',
  'workers/src/sync.ts',
  'workers/src/syncConflicts.ts',
  'workers/src/types.ts',
  'workers/migrations/0001_initial.sql',
  'workers/migrations/0003_sync_changes.sql',
  'workers/migrations/0004_sync_conflicts.sql',
  'workers/wrangler.toml',
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

function assertNoProdActions(description, text) {
  assert(description,
    !text.includes('child_' + 'process')
      && !text.includes('spawn' + 'Sync')
      && !text.includes('execFile' + 'Sync')
      && !text.includes('exec' + 'Sync')
      && !text.includes('.wrangler/' + 'timewhere-cloudflare-resources.local.json'));
}

console.log('WebDev observability / backup readiness static check');
console.log('====================================================');

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const runbook = exists('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') ? read('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md') : '';
const prodReadiness = exists('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') ? read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md') : '';
const http = exists('workers/src/http.ts') ? read('workers/src/http.ts') : '';
const migration = exists('workers/src/migration.ts') ? read('workers/src/migration.ts') : '';
const sync = exists('workers/src/sync.ts') ? read('workers/src/sync.ts') : '';
const syncConflicts = exists('workers/src/syncConflicts.ts') ? read('workers/src/syncConflicts.ts') : '';
const types = exists('workers/src/types.ts') ? read('workers/src/types.ts') : '';
const initialMigration = exists('workers/migrations/0001_initial.sql') ? read('workers/migrations/0001_initial.sql') : '';
const syncChangesMigration = exists('workers/migrations/0003_sync_changes.sql') ? read('workers/migrations/0003_sync_changes.sql') : '';
const syncConflictsMigration = exists('workers/migrations/0004_sync_conflicts.sql') ? read('workers/migrations/0004_sync_conflicts.sql') : '';
const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };

assert('root package exposes observability backup readiness script',
  packageJson.scripts?.['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs');

assert('runbook defines Gate R readiness and non-release boundary',
  runbook.includes('Gate R readiness runbook')
    && runbook.includes('不批准 prod resource creation')
    && runbook.includes('prod deployment')
    && runbook.includes('不批准') && runbook.includes('replay 写入')
    && runbook.includes('npm run webdev:observability:readiness'));

assert('Worker API uses structured success and error envelopes',
  http.includes("status: 'ok'")
    && http.includes("status: 'error'")
    && http.includes('server_time')
    && http.includes('error.code')
    && http.includes('retryable')
    && http.includes("code: 'internal_error'")
    && http.includes("message: 'Unexpected server error'"));

assert('migration import stores auditable R2 snapshots and D1 run state',
  types.includes('SNAPSHOTS: R2Bucket')
    && migration.includes('FORBIDDEN_KEYS')
    && migration.includes('snapshot_contains_private_data')
    && migration.includes('env.SNAPSHOTS.put')
    && migration.includes('snapshot_hash')
    && migration.includes('snapshot_r2_key')
    && migration.includes('migration_runs')
    && migration.includes('migration_conflicts'));

assert('sync conflict records reject private fields and expose review state',
  syncConflicts.includes('PRIVATE_KEY_PATTERN')
    && syncConflicts.includes('sync_conflict_private_data')
    && syncConflicts.includes('listSyncConflicts')
    && syncConflicts.includes('getSyncConflict')
    && syncConflicts.includes('resolveSyncConflict')
    && syncConflicts.includes('Only single Task sync conflicts can be resolved'));

assert('D1 migrations include migration and sync observability tables',
  initialMigration.includes('CREATE TABLE IF NOT EXISTS migration_runs')
    && initialMigration.includes('CREATE TABLE IF NOT EXISTS migration_conflicts')
    && syncChangesMigration.includes('CREATE TABLE IF NOT EXISTS sync_changes')
    && syncConflictsMigration.includes('CREATE TABLE IF NOT EXISTS sync_conflicts')
    && sync.includes('getLatestSyncCursor')
    && sync.includes('listSyncChanges'));

assert('prod storage bindings remain placeholders until Gate R',
  wrangler.includes('[env.prod]')
    && wrangler.includes('database_name = "timewhere-db"')
    && wrangler.includes('bucket_name = "timewhere-snapshots"')
    && wrangler.includes('REPLACE_WITH_PROD_D1_ID')
    && wrangler.includes('REPLACE_WITH_PROD_KV_ID'));

assert('runbook covers backup/restore, R2 snapshot, stop conditions, and privacy rules',
  runbook.includes('D1 schema-only export rehearsal')
    && runbook.includes('D1 full export rehearsal')
    && runbook.includes('Restore drill against non-prod database')
    && runbook.includes('R2 migration snapshot')
    && runbook.includes('Stop Conditions')
    && runbook.includes('日志和 evidence 禁止记录')
    && runbook.includes('Cloudflare account id / database id / namespace id'));

assert('prod readiness checklist points to observability backup runbook',
  prodReadiness.includes('WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md')
    && prodReadiness.includes('webdev:observability:readiness'));

assertNoProdActions('observability readiness script does not perform Cloudflare actions', read('scripts/webdev/observability-backup-readiness-check.mjs'));

if (failed > 0) {
  console.error(`\n${failed} WebDev observability / backup readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('====================================================');
console.log(`All ${passed} WebDev observability / backup readiness checks passed.`);
console.log('This is readiness evidence only. No D1 export, R2 read, Wrangler command, prod resource, deploy, or release was performed.');
