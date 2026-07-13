/**
 * WebDev Cloudflare / Web App scaffold tests.
 * Run: node tests/webdev-scaffold.test.js
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    passed++;
    console.log(`  PASS ${desc}`);
  } else {
    failed++;
    console.log(`  FAIL ${desc}`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(__dirname, '..', relativePath));
}

console.log('WebDev scaffold tests');

const requiredFiles = [
  'workers/README.md',
  'workers/wrangler.toml',
  'workers/.dev.vars.example',
  'workers/package.json',
  'workers/package-lock.json',
  'workers/tsconfig.json',
  'workers/migrations/0001_initial.sql',
  'workers/migrations/0002_task_parity_fields.sql',
  'workers/migrations/0003_sync_changes.sql',
  'workers/migrations/0004_sync_conflicts.sql',
  'workers/migrations/0005_sync_mutation_outcomes.sql',
  'workers/scripts/clear-local-d1-state.mjs',
  'workers/scripts/create-local-seed-sql.mjs',
  'workers/scripts/run-local-d1-file.mjs',
  'workers/scripts/run-local-d1-migrations.mjs',
  'workers/src/index.ts',
  'workers/src/auth.ts',
  'workers/src/migration.ts',
  'workers/src/offlineMutations.ts',
  'workers/src/repositories.ts',
  'workers/src/sync.ts',
  'workers/src/syncConflicts.ts',
  'workers/src/syncMutationOutcomes.ts',
  'workers/src/syncMutationDryRun.ts',
  'workers/src/syncReplayEnablementSimulation.ts',
  'workers/src/syncReplayReadiness.ts',
  'workers/src/syncReplaySafety.ts',
  'workers/src/taskReplayTransaction.ts',
  'pages/README.md',
  'pages/public/_headers',
  'pages/.env.example',
  'pages/package.json',
  'pages/package-lock.json',
  'pages/vite.config.js',
  'pages/index.html',
  'pages/src/App.jsx',
  'pages/src/api/client.js',
  'pages/src/auth/googleSso.js',
  'pages/src/domain/dailySettleProjection.js',
  'pages/src/domain/calendarDateProjection.js',
  'pages/src/domain/reminderState.js',
  'pages/src/migration/legacyIndexedDbSnapshotAdapter.js',
  'pages/src/repositories/offlineMutationQueue.js',
  'pages/src/repositories/taskRepository.js',
  'pages/src/repositories/calendarRepository.js',
  'pages/src/repositories/structureRepository.js',
  'pages/src/repositories/settingsRepository.js',
  'pages/src/repositories/migrationRepository.js',
  'pages/src/platform/browserPlatform.js',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md',
  'docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md',
  'docs/WEBDEV_PROD_READINESS_CHECKLIST.md',
  'docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md',
  'docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md',
  'docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md',
  'docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md',
  'docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md',
  'scripts/webdev/verify-plan-state.mjs',
  'scripts/webdev/preview-preflight.mjs',
  'scripts/webdev/provision-cloudflare.mjs',
  'scripts/webdev/deploy-cloudflare-preview.mjs',
  'scripts/webdev/preview-headers-smoke.mjs',
  'scripts/webdev/preview-smoke.mjs',
  'scripts/webdev/preview-core-smoke.mjs',
  'scripts/webdev/preview-ui-smoke.mjs',
  'scripts/webdev/preview-data-hygiene-smoke.mjs',
  'scripts/webdev/prod-readiness-check.mjs',
  'scripts/webdev/prod-readiness-package.mjs',
  'scripts/webdev/completion-audit.mjs',
  'scripts/webdev/ui-walkthrough.mjs',
  'scripts/webdev/browser-extension-readiness-check.mjs',
  'scripts/webdev/desktop-runtime-readiness-check.mjs',
  'scripts/webdev/task-replay-gate-b-readiness-check.mjs',
  'scripts/webdev/non-task-replay-gate-c-readiness-check.mjs',
  'scripts/webdev/observability-backup-readiness-check.mjs',
  'scripts/webdev/desktop-runtime-smoke.mjs'
];

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const wrangler = read('workers/wrangler.toml');
assert('wrangler uses TimeWhere dev Worker name', wrangler.includes('name = "timewhere-dev-api"'));
assert('wrangler declares preview Worker name', wrangler.includes('name = "timewhere-preview-api"'));
assert('wrangler declares prod Worker name', wrangler.includes('name = "timewhere-api"'));
assert('wrangler uses DB binding', wrangler.includes('binding = "DB"'));
assert('wrangler uses SNAPSHOTS binding', wrangler.includes('binding = "SNAPSHOTS"'));
assert('wrangler uses APP_CACHE binding', wrangler.includes('binding = "APP_CACHE"'));
assert('wrangler does not contain real Cloudflare UUIDs', !/database_id\s*=\s*"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"/i.test(wrangler));
assert('wrangler defaults replay kill switch on and local dev replay disabled',
  wrangler.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"') && wrangler.includes('TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"'));
const workerDevVarsExample = read('workers/.dev.vars.example');
const pagesEnvExample = read('pages/.env.example');
const pagesHeaders = read('pages/public/_headers');
const completionChecklist = read('docs/WEBDEV_COMPLETION_CHECKLIST.md');
const businessParityChecklist = read('docs/WEBDEV_BUSINESS_PARITY_CHECKLIST.md');
const previewRunbook = read('docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md');
const prodReadinessChecklist = read('docs/WEBDEV_PROD_READINESS_CHECKLIST.md');
const browserExtensionGateDPacket = read('docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md');
const desktopRuntimeGateEPacket = read('docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md');
const observabilityBackupRunbook = read('docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md');
const taskReplayGateBPacket = read('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md');
const nonTaskReplayGateCPacket = read('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md');
const obviousSecretPattern = new RegExp([
  'GOC' + 'SPX-',
  'ya29\\.',
  'AIza[0-9A-Za-z_-]{20,}',
  'database_id\\s*=\\s*"[a-f0-9-]{36}"'
].join('|'), 'i');
assert('Worker env example documents Google SSO public client id without secrets',
  workerDevVarsExample.includes('GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && !/client_secret|token|cookie/i.test(workerDevVarsExample));
assert('Pages env example documents Worker API and Google SSO public client id without secrets',
  pagesEnvExample.includes('VITE_WORKER_API_BASE_URL=http://127.0.0.1:8787')
    && pagesEnvExample.includes('VITE_GOOGLE_OIDC_CLIENT_ID=your-web-client-id.apps.googleusercontent.com')
    && !/client_secret|token|cookie/i.test(pagesEnvExample));
assert('Pages headers define CSP and security headers for preview/prod readiness',
  pagesHeaders.includes('Content-Security-Policy:')
    && pagesHeaders.includes("frame-ancestors 'none'")
    && pagesHeaders.includes('X-Content-Type-Options: nosniff')
    && pagesHeaders.includes('Referrer-Policy: strict-origin-when-cross-origin')
    && pagesHeaders.includes('Permissions-Policy:')
    && pagesHeaders.includes('https://accounts.google.com')
    && pagesHeaders.includes('https://*.workers.dev')
    && pagesHeaders.includes('Cache-Control: public, max-age=31536000, immutable')
    && pagesHeaders.includes('/index.html')
    && pagesHeaders.includes('/\n  Cache-Control: no-store'));
assert('WebDev completion checklist records phases and approval gates',
  completionChecklist.includes('Phase 0')
    && completionChecklist.includes('Phase 10')
    && completionChecklist.includes('Gate A')
    && completionChecklist.includes('Gate R')
    && completionChecklist.includes('当前明确未批准'));
assert('WebDev business parity checklist records implemented and gated capabilities',
  businessParityChecklist.includes('Tasks CRUD')
    && businessParityChecklist.includes('Daily Settle projection')
    && businessParityChecklist.includes('Automatic migration')
    && businessParityChecklist.includes('Desktop Runtime')
    && businessParityChecklist.includes('Gate B')
    && businessParityChecklist.includes('Phase 5 完成定义'));
assert('WebDev preview runbook records Gate A acceptance evidence and stop conditions',
  previewRunbook.includes('Gate A readiness runbook')
    && previewRunbook.includes('Preview Acceptance Evidence')
    && previewRunbook.includes('Desktop Runtime Preview Smoke')
    && previewRunbook.includes('Stop Conditions')
    && !obviousSecretPattern.test(previewRunbook));
assert('WebDev preview runbook records risk register and rollback plan',
  previewRunbook.includes('Preview Risk Register')
    && previewRunbook.includes('Preview Rollback / Cleanup Plan')
    && previewRunbook.includes('migration import 产生重复或静默覆盖迹象'));
assert('WebDev prod readiness checklist records Gate R non-release boundary',
  prodReadinessChecklist.includes('Gate R readiness checklist')
    && prodReadinessChecklist.includes('不等于发布')
    && prodReadinessChecklist.includes('Prod Readiness Package')
    && prodReadinessChecklist.includes('WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md')
    && prodReadinessChecklist.includes('Release Risk Register')
    && prodReadinessChecklist.includes('Rollback plan')
    && prodReadinessChecklist.includes('Security / Privacy Readiness')
    && !obviousSecretPattern.test(prodReadinessChecklist));
assert('WebDev Browser Extension Gate D packet records readiness-only boundary',
  browserExtensionGateDPacket.includes('Gate D readiness packet')
    && browserExtensionGateDPacket.includes('不批准、不开启、不实现 Browser Extension WebDev replay')
    && browserExtensionGateDPacket.includes('不提交 CWS')
    && browserExtensionGateDPacket.includes('Extension IndexedDB 不作为 canonical data source')
    && browserExtensionGateDPacket.includes('npm.cmd run webdev:extension:readiness')
    && !obviousSecretPattern.test(browserExtensionGateDPacket));
assert('WebDev Desktop Runtime Gate E packet records readiness-only boundary',
  desktopRuntimeGateEPacket.includes('Gate E readiness packet')
    && desktopRuntimeGateEPacket.includes('不批准、不开启、不执行 Desktop internal package')
    && desktopRuntimeGateEPacket.includes('不签名、不公证、不 staple')
    && desktopRuntimeGateEPacket.includes('Desktop preload 不暴露 Task / Calendar / Migration 业务 API')
    && desktopRuntimeGateEPacket.includes('npm.cmd run webdev:desktop:readiness')
    && !obviousSecretPattern.test(desktopRuntimeGateEPacket));
assert('WebDev observability backup runbook records Gate R readiness-only boundary',
  observabilityBackupRunbook.includes('Gate R readiness runbook')
    && observabilityBackupRunbook.includes('D1 schema-only export rehearsal')
    && observabilityBackupRunbook.includes('R2 migration snapshot')
    && observabilityBackupRunbook.includes('日志和 evidence 禁止记录')
    && observabilityBackupRunbook.includes('npm run webdev:observability:readiness')
    && !obviousSecretPattern.test(observabilityBackupRunbook));
assert('WebDev Task replay Gate B packet records readiness-only boundary',
  taskReplayGateBPacket.includes('Gate B readiness packet')
    && taskReplayGateBPacket.includes('不批准、不开启、不发布')
    && taskReplayGateBPacket.includes('Task delete 继续保持用户侧阻断')
    && taskReplayGateBPacket.includes('Calendar / Container / Settings replay 不包含在 Gate B')
    && taskReplayGateBPacket.includes('npm.cmd run webdev:gate-b:readiness')
    && !obviousSecretPattern.test(taskReplayGateBPacket));
assert('WebDev non-Task replay Gate C packet records readiness-only boundary',
  nonTaskReplayGateCPacket.includes('Gate C readiness packet')
    && nonTaskReplayGateCPacket.includes('不批准、不开启、不实现 Calendar / Container / Settings replay')
    && nonTaskReplayGateCPacket.includes('C1 Calendar')
    && nonTaskReplayGateCPacket.includes('C2 Structure')
    && nonTaskReplayGateCPacket.includes('C3 Settings')
    && nonTaskReplayGateCPacket.includes('npm.cmd run webdev:gate-c:readiness')
    && !obviousSecretPattern.test(nonTaskReplayGateCPacket));

const sql = read('workers/migrations/0001_initial.sql');
const taskParityMigration = read('workers/migrations/0002_task_parity_fields.sql');
const syncChangesMigration = read('workers/migrations/0003_sync_changes.sql');
const syncConflictsMigration = read('workers/migrations/0004_sync_conflicts.sql');
const syncMutationOutcomesMigration = read('workers/migrations/0005_sync_mutation_outcomes.sql');
for (const table of [
  'accounts',
  'account_sessions',
  'plans',
  'buckets',
  'labels',
  'tasks',
  'containers',
  'calendar_events',
  'product_settings',
  'migration_runs',
  'migration_conflicts'
]) {
  assert(`D1 schema creates ${table}`, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(sql));
}
assert('D1 account table stores Google SSO display fields', sql.includes('email TEXT') && sql.includes('display_name TEXT') && sql.includes('picture_url TEXT'));
assert('D1 task parity fields live in versioned migration after 0001',
  !sql.includes('recurrence_series_id') && taskParityMigration.includes('ALTER TABLE tasks ADD COLUMN recurrence_series_id') && taskParityMigration.includes('managebac_subject') && taskParityMigration.includes('readonly INTEGER'));
assert('D1 sync changes live in versioned migration after 0002',
  syncChangesMigration.includes('CREATE TABLE IF NOT EXISTS sync_changes') && syncChangesMigration.includes('sequence INTEGER PRIMARY KEY AUTOINCREMENT') && syncChangesMigration.includes('idx_sync_changes_account_sequence') && !sql.includes('sync_changes'));
assert('D1 sync conflicts live in versioned migration after 0003',
  syncConflictsMigration.includes('CREATE TABLE IF NOT EXISTS sync_conflicts') && syncConflictsMigration.includes('mutation_id TEXT') && syncConflictsMigration.includes('idx_sync_conflicts_account_status_created') && !sql.includes('sync_conflicts'));
assert('D1 sync mutation outcomes live in versioned migration after 0004',
  syncMutationOutcomesMigration.includes('CREATE TABLE IF NOT EXISTS sync_mutation_outcomes') && syncMutationOutcomesMigration.includes('task_gate_json TEXT') && syncMutationOutcomesMigration.includes('idx_sync_mutation_outcomes_account_mutation') && !sql.includes('sync_mutation_outcomes'));

const workerIndex = read('workers/src/index.ts');
for (const [route, pattern] of [
  ['/auth/google', /auth\\\/google/],
  ['/auth/session/refresh', /auth\\\/session\\\/refresh/],
  ['/auth/session', /auth\\\/session/],
  ['/account/me', /account\\\/me/],
  ['/account/profile', /account\\\/profile/],
  ['/account/status', /account\\\/status/],
  ['/tasks', /\/tasks/],
  ['/calendar/events', /calendar\\\/events/],
  ['/plans', /\/plans/],
  ['/buckets', /\/buckets/],
  ['/labels', /\/labels/],
  ['/containers', /\/containers/],
  ['/settings', /\/settings/],
  ['/migration/runs', /migration\\\/runs/],
  ['/migration/conflicts', /migration\\\/conflicts/],
  ['/sync/bootstrap', /sync\\\/bootstrap/],
  ['/sync/changes', /sync\\\/changes/],
  ['/sync/mutations', /sync\\\/mutations/],
  ['/sync/mutations/dry-run', /sync\\\/mutations\\\/dry-run/],
  ['/sync/mutations/enablement-simulation', /sync\\\/mutations\\\/enablement-simulation/],
  ['/sync/mutations/readiness-summary', /sync\\\/mutations\\\/readiness-summary/],
  ['/sync/replay-safety', /sync\\\/replay-safety/],
  ['/sync/mutations/:id', /sync\\\/mutations\\\/\(\[\^\/\]\+\)/],
  ['/sync/conflicts', /sync\\\/conflicts/],
  ['/sync/conflicts/:id/resolve', /sync\\\/conflicts\\\/\(\[\^\/\]\+\)\\\/resolve/],
  ['/sync/status', /sync\\\/status/]
]) {
  assert(`Worker route includes ${route}`, pattern.test(workerIndex));
}
assert('Worker sync status documents offline blocked v1', workerIndex.includes("offline_writes: 'blocked_v1'"));
assert('Worker sync status exposes change feed foundation', workerIndex.includes("change_feed: 'available'") && workerIndex.includes('handleListSyncChanges'));
assert('Worker exposes read-only Cloud bootstrap snapshot for local cache setup',
  workerIndex.includes('handleSyncBootstrap')
    && workerIndex.includes("schema: 'timewhere-cloud-bootstrap-v1'")
    && workerIndex.includes("offline_write_policy: 'blocked_v1'")
    && workerIndex.includes('getLatestSyncCursor'));
assert('Worker sync status keeps mutation replay disabled', workerIndex.includes("mutation_replay: 'disabled_v1'") && workerIndex.includes("task_replay_gate: 'defined_disabled_v1'") && workerIndex.includes("task_replay_transaction: 'internal_disabled_v1'") && workerIndex.includes("mutation_dry_run: 'internal_disabled_v1'") && workerIndex.includes("replay_enablement_simulation: 'internal_disabled_v1'") && workerIndex.includes("replay_readiness_summary: 'internal_disabled_v1'") && workerIndex.includes("replay_preview_hardening: 'phase9_internal_readiness_only'") && workerIndex.includes('replay_safety_gate') && workerIndex.includes("mutation_outcomes: 'metadata_only_disabled_v1'") && workerIndex.includes('handleSyncMutations'));
assert('Worker sync status exposes conflict record scaffold', workerIndex.includes("conflict_records: 'scaffolded'") && workerIndex.includes('handleListSyncConflicts') && workerIndex.includes('handleGetSyncConflict'));
assert('Worker supports local Cloud session disconnect and refresh',
  workerIndex.includes('handleDeleteSession')
    && workerIndex.includes('handleRefreshSession')
    && workerIndex.includes('revokeSession')
    && workerIndex.includes('refreshSession'));
assert('Worker exposes account profile and safe runtime status without Google tokens',
  workerIndex.includes('handleAccountStatus')
    && workerIndex.includes('handleUpdateAccountProfile')
    && workerIndex.includes('google_tokens_stored_by_worker: false')
    && workerIndex.includes("data_authority: 'cloud_d1_canonical'")
    && workerIndex.includes('task_replay_writes_enabled: false'));

const migration = read('workers/src/migration.ts');
assert('migration stores raw snapshot in R2', migration.includes('SNAPSHOTS.put'));
assert('migration validates private data keys', migration.includes('snapshot_contains_private_data'));
assert('migration is idempotent by snapshot hash', migration.includes('snapshot_hash = ?'));
assert('migration conflict review APIs are implemented',
  migration.includes('listMigrationConflicts') && migration.includes('resolveMigrationConflict') && workerIndex.includes('handleListMigrationConflicts') && workerIndex.includes('handleResolveMigrationConflict'));
assert('migration detects changed cloud records and skips overwrite',
  migration.includes('detectMigrationConflicts') && migration.includes('cloud_record_changed_since_snapshot') && migration.includes('skipLegacyIds.has') && migration.includes("counts.conflicts") && migration.includes("finalStatus = counts.conflicts > 0 ? 'conflict' : 'completed'"));
assert('migration conflict use_local applies local row before closing conflict',
  migration.includes('applyLocalConflict') && migration.includes("resolution === 'use_local'") && migration.includes('applied_local'));
assert('migration preserves canonical foreign key references',
  migration.includes('function referenceId') && migration.includes("text.startsWith(`${prefix}_`)") && migration.includes("referenceId('plan', task.plan_id)") && migration.includes("referenceId('container', event.container_id)"));
assert('migration imports recurrence and ManageBac source task fields',
  migration.includes('recurrence_series_id') && migration.includes('recurrence_anchor_due_date') && migration.includes('managebac_subject') && migration.includes('readonly = excluded.readonly'));

const workersReadme = read('workers/README.md');
assert('Workers README documents dev preview prod environments',
  workersReadme.includes('dev') && workersReadme.includes('preview') && workersReadme.includes('prod'));
assert('Workers README forbids committed Cloudflare secrets',
  workersReadme.includes('不提交真实 Cloudflare resource id') && workersReadme.includes('不记录 token'));
assert('Workers README documents local D1 prepare command',
  workersReadme.includes('webdev:local:prepare') && workersReadme.includes('timewhere-local-dev-session'));
assert('Workers README documents TimeWhere session refresh boundary',
  workersReadme.includes('/auth/session/refresh') && workersReadme.includes('不接触 Google token'));
assert('Workers README documents account profile and runtime status endpoints',
  workersReadme.includes('/account/profile') && workersReadme.includes('/account/status') && workersReadme.includes('workspace/profile'));

const workerRepository = read('workers/src/repositories.ts');
const workerSync = read('workers/src/sync.ts');
const workerOfflineMutations = read('workers/src/offlineMutations.ts');
const workerSyncConflicts = read('workers/src/syncConflicts.ts');
const workerSyncMutationDryRun = read('workers/src/syncMutationDryRun.ts');
const workerSyncMutationOutcomes = read('workers/src/syncMutationOutcomes.ts');
const workerSyncReplayEnablementSimulation = read('workers/src/syncReplayEnablementSimulation.ts');
const workerSyncReplayReadiness = read('workers/src/syncReplayReadiness.ts');
const workerSyncReplaySafety = read('workers/src/syncReplaySafety.ts');
const workerSyncReplayDependencies = read('workers/src/syncReplayDependencies.ts');
const workerTaskReplayTransaction = read('workers/src/taskReplayTransaction.ts');
assert('Worker sync change feed records idempotent cursor rows',
  workerSync.includes('recordSyncChange') && workerSync.includes('listSyncChanges') && workerSync.includes('getLatestSyncCursor') && workerSync.includes('next_cursor') && workerSync.includes('entity_revision'));
assert('Worker offline mutation replay skeleton validates but remains disabled',
  workerOfflineMutations.includes('validateOfflineMutationReplay') && workerOfflineMutations.includes("replay_status: 'disabled_v1'") && workerOfflineMutations.includes("accepted: false") && workerOfflineMutations.includes('offline_replay_disabled_v1'));
assert('Worker offline mutation replay rejects private fields',
  workerOfflineMutations.includes('offline_mutation_private_data') && workerOfflineMutations.includes('PRIVATE_KEY_PATTERN'));
assert('Worker offline mutation replay defines task-only activation gate while disabled',
  workerOfflineMutations.includes("activation_gate: 'task_only_replay_defined_but_disabled_v1'") && workerOfflineMutations.includes('evaluateTaskReplayGate') && workerOfflineMutations.includes("status: 'task_replay_gate_ready_but_disabled'"));
assert('Worker offline mutation replay includes field-level conflict preview',
  workerOfflineMutations.includes('evaluateFieldConflict') && workerOfflineMutations.includes("'would_conflict'") && workerOfflineMutations.includes("'would_auto_merge'") && workerOfflineMutations.includes('cloud_values_required'));
assert('Worker offline mutation replay preserves ManageBac source edit boundary',
  workerOfflineMutations.includes('MANAGEBAC_LOCAL_EXECUTION_FIELDS') && workerOfflineMutations.includes('MANAGEBAC_SOURCE_CONTROLLED_FIELDS') && workerOfflineMutations.includes('managebac_local_execution_fields'));
assert('Worker test-only Task replay is blocked outside local/dev/test environments',
  workerIndex.includes('assertTestOnlyTaskReplayAllowed(env)')
    && workerIndex.includes('test_only_task_replay_not_available')
    && workerIndex.includes("['dev', 'local', 'test'].includes(envName)"));
assert('Worker sync conflict scaffold can create and list sanitized records',
  workerSyncConflicts.includes('createSyncConflictRecord') && workerSyncConflicts.includes('listSyncConflicts') && workerSyncConflicts.includes('getSyncConflict') && workerSyncConflicts.includes('sync_conflict_private_data') && workerSyncConflicts.includes('PRIVATE_KEY_PATTERN'));
assert('Worker sync conflict resolution is limited to single Task keep-cloud discard-local later',
  workerIndex.includes('handleResolveSyncConflict')
    && workerIndex.includes('/sync\\/conflicts\\/([^/]+)\\/resolve')
    && workerSyncConflicts.includes('resolveSyncConflict')
    && workerSyncConflicts.includes('sync_conflict_resolution_scope_blocked')
    && workerSyncConflicts.includes("'keep_cloud'")
    && workerSyncConflicts.includes("'discard_local'")
    && workerSyncConflicts.includes("'later'")
    && workerSyncConflicts.includes('writes_cloud_data: false')
    && workerSyncConflicts.includes('applies_local_data: false'));
assert('Worker sync mutation outcome scaffold persists metadata only',
  workerSyncMutationOutcomes.includes('recordSyncMutationOutcomes') && workerSyncMutationOutcomes.includes('listSyncMutationOutcomes') && workerSyncMutationOutcomes.includes('getSyncMutationOutcome') && workerSyncMutationOutcomes.includes("mode: 'disabled_v1_metadata_only'") && workerSyncMutationOutcomes.includes('task_gate_json'));
assert('Worker sync mutation outcome scaffold does not persist raw mutation payloads',
  !workerSyncMutationOutcomes.includes('patch_json') && !workerSyncMutationOutcomes.includes('base_values_json') && !workerSyncMutationOutcomes.includes('cloud_values_json'));
assert('Worker task replay transaction skeleton stays internally disabled',
  workerTaskReplayTransaction.includes('attachTaskReplayTransactionSkeleton') && workerTaskReplayTransaction.includes("mode: 'internal_disabled_v1'") && workerTaskReplayTransaction.includes('writes_enabled: false') && workerTaskReplayTransaction.includes('applies_user_data: false'));
assert('Worker task replay transaction skeleton defines future branches',
  workerTaskReplayTransaction.includes("'apply_candidate'") && workerTaskReplayTransaction.includes("'conflict_candidate'") && workerTaskReplayTransaction.includes("'reject_candidate'") && workerTaskReplayTransaction.includes('begin_d1_transaction') && workerIndex.includes('attachTaskReplayTransactionSkeleton'));
assert('Worker sync mutation dry-run remains internally disabled and read-only',
  workerSyncMutationDryRun.includes('buildSyncMutationDryRun') && workerSyncMutationDryRun.includes("mode: 'internal_disabled_v1'") && workerSyncMutationDryRun.includes('writes_enabled: false') && workerSyncMutationDryRun.includes('applies_user_data: false') && !workerSyncMutationDryRun.includes('createSyncConflictRecord') && !workerSyncMutationDryRun.includes('recordSyncMutationOutcomes'));
assert('Worker sync mutation dry-run joins existing outcomes and conflict records',
  workerSyncMutationDryRun.includes('findSyncMutationOutcome') && workerSyncMutationDryRun.includes('findSyncConflictByMutation') && workerSyncMutationOutcomes.includes('findSyncMutationOutcome') && workerSyncConflicts.includes('findSyncConflictByMutation'));
assert('Worker sync mutation dry-run previews conflict record shape without persisting it',
  workerSyncMutationDryRun.includes('conflict_preview') && workerSyncMutationDryRun.includes('would_persist: false') && workerSyncMutationDryRun.includes("reason: 'field_conflict'") && workerSyncMutationDryRun.includes('local: pickFields') && workerSyncMutationDryRun.includes('cloud: pickFields'));
assert('Worker sync mutation dry-run previews apply plan without persisting it',
  workerSyncMutationDryRun.includes('apply_plan') && workerSyncMutationDryRun.includes('buildApplyPlanPreview') && workerSyncMutationDryRun.includes('patch_fields') && workerSyncMutationDryRun.includes('patch: pickFields') && workerSyncMutationDryRun.includes('d1_transaction_steps'));
assert('Worker sync replay readiness aggregates dry-run counts without enabling writes',
  workerSyncReplayReadiness.includes('buildSyncReplayReadinessSummary') && workerSyncReplayReadiness.includes('buildSyncMutationDryRun') && workerSyncReplayReadiness.includes("replay_enablement: 'not_approved'") && workerSyncReplayReadiness.includes('blocked_reasons') && workerSyncReplayReadiness.includes('sample_results'));
assert('Worker sync replay readiness exposes Phase 9 preview hardening evidence',
  workerSyncReplayReadiness.includes('buildPreviewHardening')
    && workerSyncReplayReadiness.includes("mode: 'phase9_preview_readiness_hardening_v1'")
    && workerSyncReplayReadiness.includes('evidence_gaps')
    && workerSyncReplayReadiness.includes('approval_blockers')
    && workerSyncReplayReadiness.includes('required_evidence')
    && workerSyncReplayReadiness.includes('writes_enabled: false')
    && workerSyncReplayReadiness.includes('applies_user_data: false'));
assert('Worker sync replay dependency analysis stays read-only for Phase 7',
  workerSyncReplayDependencies.includes('buildSyncReplayDependencyAnalysis')
    && workerSyncReplayDependencies.includes("mode: 'phase7_dependency_analysis_v1'")
    && workerSyncReplayDependencies.includes('requires_cloud_relationship_validation')
    && workerSyncReplayDependencies.includes('same_batch_create_after_reference')
    && workerSyncReplayDependencies.includes('writes_enabled: false')
    && workerSyncReplayDependencies.includes('applies_user_data: false')
    && workerSyncReplayReadiness.includes('dependency_analysis')
    && workerIndex.includes("replay_dependency_analysis: 'phase7_internal_readiness_only'"));
assert('Worker sync replay enablement simulation evaluates gates without enabling writes',
  workerSyncReplayEnablementSimulation.includes('buildSyncReplayEnablementSimulation') && workerSyncReplayEnablementSimulation.includes('buildSyncReplayReadinessSummary') && workerSyncReplayEnablementSimulation.includes("replay_enablement: 'simulation_only'") && workerSyncReplayEnablementSimulation.includes('simulated_gate_pass') && workerSyncReplayEnablementSimulation.includes('can_enable_replay: false'));
assert('Worker sync replay safety gate exposes kill switch and blocks prod writes',
  workerSyncReplaySafety.includes('buildSyncReplaySafetyGate')
    && workerSyncReplaySafety.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH')
    && workerSyncReplaySafety.includes('TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED')
    && workerSyncReplaySafety.includes('prod_replay_allowed: false')
    && workerSyncReplaySafety.includes('writes_enabled: false')
    && workerSyncReplaySafety.includes('applies_user_data: false')
    && workerSyncReplaySafety.includes('can_run_replay: false'));
assert('Worker repositories record entity changes for future offline replay',
  workerRepository.includes("recordSyncChange(env, accountId, 'task'") && workerRepository.includes("recordSyncChange(env, accountId, 'calendar_event'") && workerRepository.includes("recordSyncChange(env, accountId, 'container'") && workerRepository.includes("recordSyncChange(env, accountId, 'product_setting'"));
assert('Worker task API returns DTO arrays',
  workerRepository.includes('function taskDto') && workerRepository.includes('checklist: parseJsonArray') && workerRepository.includes('labels: parseJsonArray'));
assert('Worker task API supports query filters',
  workerRepository.includes('includeCompleted') && workerRepository.includes('search') && workerIndex.includes('include_completed'));
assert('Worker task API normalizes completion timestamps',
  workerRepository.includes("patch.progress === 'completed'") && workerRepository.includes('completed_at = ?'));
assert('Worker calendar API supports event CRUD and query filters',
  workerRepository.includes('listCalendarEvents') && workerRepository.includes('createCalendarEvent') && workerRepository.includes('deleteCalendarEvent') && workerRepository.includes('dateFrom') && workerIndex.includes('/calendar\\/events'));
assert('Worker structure API supports plan label bucket and container CRUD',
  workerRepository.includes('listPlans') && workerRepository.includes('createPlan') && workerRepository.includes('deletePlan') && workerRepository.includes('listLabels') && workerRepository.includes('createLabel') && workerRepository.includes('deleteLabel') && workerRepository.includes('listBuckets') && workerRepository.includes('createBucket') && workerRepository.includes('deleteBucket') && workerRepository.includes('listContainers') && workerRepository.includes('createContainer') && workerRepository.includes('deleteContainer'));
assert('Worker structure API parses container days and enabled state',
  workerRepository.includes('days: parseJsonArray') && workerRepository.includes('normalizeEnabled'));

const googleSso = read('pages/src/auth/googleSso.js');
assert('Google SSO helper uses public client id env and GIS script',
  googleSso.includes('VITE_GOOGLE_OIDC_CLIENT_ID') && googleSso.includes('accounts.google.com/gsi/client') && googleSso.includes('renderGoogleSsoButton'));
assert('Google SSO helper does not reference client secrets',
  !googleSso.includes('client_secret') && !googleSso.includes('GOOGLE_CLIENT_SECRET'));
const pagesApiClient = read('pages/src/api/client.js');
assert('Pages API client uses configured Worker API base URL',
  pagesApiClient.includes('VITE_WORKER_API_BASE_URL') && pagesApiClient.includes('createApiClient({'));

const pagesPackage = JSON.parse(read('pages/package.json'));
assert('Pages package depends on React', Boolean(pagesPackage.dependencies.react));
assert('Pages package depends on Vite', Boolean(pagesPackage.dependencies.vite));
assert('Pages package depends on lucide-react', Boolean(pagesPackage.dependencies['lucide-react']));
const viteConfig = read('pages/vite.config.js');
assert('Pages dev proxy forwards Worker health checks',
  viteConfig.includes("'/health': 'http://127.0.0.1:8787'"));
assert('Pages dev proxy forwards structure APIs',
  viteConfig.includes("'/plans': 'http://127.0.0.1:8787'")
    && viteConfig.includes("'/buckets': 'http://127.0.0.1:8787'")
    && viteConfig.includes("'/labels': 'http://127.0.0.1:8787'"));

const taskRepository = read('pages/src/repositories/taskRepository.js');
const offlineQueue = read('pages/src/repositories/offlineMutationQueue.js');
assert('Offline mutation queue helper exists but defaults to disabled',
  offlineQueue.includes('timewhere.web.offline.mutations.v1') && offlineQueue.includes('offline_mutation_queue_disabled') && offlineQueue.includes('enabled = false'));
assert('Offline mutation queue rejects private fields',
  offlineQueue.includes('offline_mutation_private_data') && offlineQueue.includes('refresh_token') && offlineQueue.includes('access_token'));
assert('Offline mutation queue can remove selected queued mutations',
  offlineQueue.includes('removeQueuedMutations') && offlineQueue.includes('removed_count') && offlineQueue.includes('remaining_count'));
assert('Task repository persists local read cache',
  taskRepository.includes('timewhere.web.tasks.cache.v1') && taskRepository.includes('writeCachedTasks') && taskRepository.includes('getCachedTasks') && taskRepository.includes('hydrateCache'));
assert('Task repository can apply read-only Cloud task changes without overwriting pending tasks',
  taskRepository.includes('applyCloudTask')
    && taskRepository.includes('removeCloudTask')
    && taskRepository.includes('hasPendingTask')
    && taskRepository.includes('queuedTaskMutationsWithCache')
    && taskRepository.includes('return cachedTaskById(storage, task.id)')
    && taskRepository.includes('return cachedTaskById(storage, id)'));
assert('Task repository queues Task-only offline writes and still blocks offline delete',
  taskRepository.includes('createPendingOfflineTask') && taskRepository.includes('updatePendingOfflineTask') && taskRepository.includes('offline_write_blocked'));
assert('Task repository exposes queued pending offline queue state for Task writes',
  taskRepository.includes('createOfflineMutationQueue({ storage, enabled: true })') && taskRepository.includes('getOfflineMutationQueueState') && taskRepository.includes('__sync_status') && taskRepository.includes('listPendingTaskMutations') && taskRepository.includes('discardPendingTaskMutations'));
assert('Task repository bootstrap hydrate preserves local pending Task cache entries',
  taskRepository.includes('hydrateTaskCache') && taskRepository.includes('pendingTasks') && taskRepository.includes('clearPendingMarker'));
assert('Task repository supports complete reopen and delete',
  taskRepository.includes('completeTask') && taskRepository.includes('reopenTask') && taskRepository.includes('deleteTask'));

const calendarRepository = read('pages/src/repositories/calendarRepository.js');
assert('Calendar repository persists local read cache',
  calendarRepository.includes('timewhere.web.calendar.cache.v1') && calendarRepository.includes('writeCachedEvents') && calendarRepository.includes('getCachedEvents') && calendarRepository.includes('hydrateCache'));
assert('Calendar repository can apply read-only Cloud event changes',
  calendarRepository.includes('applyCloudEvent') && calendarRepository.includes('removeCloudEvent') && calendarRepository.includes('mergeEventIntoCache') && calendarRepository.includes('removeEventFromCache'));
assert('Calendar repository blocks offline writes',
  calendarRepository.includes('OfflineCalendarWriteBlockedError') && calendarRepository.includes('offline_write_blocked'));
assert('Calendar repository supports list create update delete',
  calendarRepository.includes('listEvents') && calendarRepository.includes('createEvent') && calendarRepository.includes('updateEvent') && calendarRepository.includes('deleteEvent'));

const structureRepository = read('pages/src/repositories/structureRepository.js');
assert('Structure repository persists local read cache',
  structureRepository.includes('timewhere.web.structure.cache.v1') && structureRepository.includes('getCachedStructure') && structureRepository.includes('writeCache') && structureRepository.includes('hydrateCache'));
assert('Structure repository can apply read-only Cloud structure changes',
  structureRepository.includes('collectionKeyForType') && structureRepository.includes('applyCloudItem') && structureRepository.includes('removeCloudItem') && structureRepository.includes("plan: 'plans'") && structureRepository.includes("container: 'containers'"));
assert('Structure repository blocks offline writes',
  structureRepository.includes('OfflineStructureWriteBlockedError') && structureRepository.includes('offline_write_blocked'));
assert('Structure repository supports plan label bucket and container CRUD',
  structureRepository.includes('createPlan') && structureRepository.includes('deletePlan') && structureRepository.includes('createLabel') && structureRepository.includes('deleteLabel') && structureRepository.includes('createBucket') && structureRepository.includes('deleteBucket') && structureRepository.includes('createContainer') && structureRepository.includes('deleteContainer'));

const settingsRepository = read('pages/src/repositories/settingsRepository.js');
assert('Settings repository persists local read cache',
  settingsRepository.includes('timewhere.web.settings.cache.v1') && settingsRepository.includes('getCachedSettings') && settingsRepository.includes('writeCachedSettings') && settingsRepository.includes('hydrateCache'));
assert('Settings repository blocks offline writes',
  settingsRepository.includes('OfflineSettingsWriteBlockedError') && settingsRepository.includes('offline_write_blocked'));
assert('Settings repository supports get and update settings',
  settingsRepository.includes('getSettings') && settingsRepository.includes('updateSettings') && settingsRepository.includes('/settings'));

const projection = read('pages/src/domain/dailySettleProjection.js');
assert('Dashboard projection helper computes active container and sorted current tasks',
  projection.includes('computeDashboardProjection') && projection.includes('assignTasksToContainers') && projection.includes('displayTasks') && projection.includes('assignedContainers'));
assert('Dashboard projection helper is read-only and does not persist mutations',
  !projection.includes('localStorage') && !projection.includes('apiClient.request') && !projection.includes('fetch('));
const calendarProjection = read('pages/src/domain/calendarDateProjection.js');
assert('Calendar date projection helper combines containers events and tasks',
  calendarProjection.includes('computeCalendarDateProjection') && calendarProjection.includes('timedItems') && calendarProjection.includes('containerItems') && calendarProjection.includes('unassignedTasks'));
const reminderState = read('pages/src/domain/reminderState.js');
assert('Reminder state helper exposes due idle and disabled states',
  reminderState.includes('computeReminderState') && reminderState.includes("status: 'due'") && reminderState.includes("status: 'idle'") && reminderState.includes("status: 'disabled'"));
assert('Reminder state helper exposes work reminder session state machine',
  reminderState.includes('advanceReminderSession') && reminderState.includes('notification_closed') && reminderState.includes('execution_check_scheduled') && reminderState.includes('execution_check_due'));

const app = read('pages/src/App.jsx');
const pagesStyles = read('pages/src/styles.css');
const apiClient = read('pages/src/api/client.js');
for (const label of ['Dashboard', 'Tasks', 'Calendar', 'Settings']) {
  assert(`Web App exposes ${label}`, app.includes(label));
}
assert('Web App supports hash/query view routing for Desktop Runtime',
  app.includes('function getInitialActiveView')
    && app.includes('window.location.hash')
    && app.includes("new URLSearchParams(window.location.search).get('view')")
    && app.includes('function navigateToView')
    && app.includes('window.history.pushState'));
assert('Web App exposes Task-only queued pending while non-Task writes remain blocked',
  app.includes('Queue task locally') && app.includes('Pending sync') && app.includes('offline_write_blocked'));
assert('Web App includes migration preview', app.includes('Run migration preview'));
assert('Web App exposes Task CRUD controls',
  app.includes('Save to Cloud') && app.includes('Queue task locally') && app.includes('Complete task') && app.includes('Reopen task') && app.includes('Delete task'));
assert('Dashboard uses Daily Settle projection helper',
  app.includes('computeDashboardProjection') && app.includes('Today projection') && app.includes('Projected current work') && app.includes('Current container'));
assert('Web App exposes Task detail first version',
  app.includes('TaskDetailPanel') && app.includes('Save task detail') && app.includes('Checklist') && app.includes('Plan') && app.includes('Bucket'));
assert('Web App exposes task recurrence fields in create and detail flows',
  app.includes('recurrence_frequency') && app.includes('Repeat count') && app.includes('Weekly') && app.includes('Monthly'));
assert('Web App enforces ManageBac source task edit boundary in task detail',
  app.includes('isManageBacSourceTask') && app.includes('ManageBac source task') && app.includes('!isManageBac') && app.includes('disabled={!canWrite || isManageBac}'));
assert('Web App exposes Calendar date projection first version',
  app.includes('CalendarProjectionPanel') && app.includes('Date projection') && app.includes('computeCalendarDateProjection'));
assert('Web App exposes Reminder state UI first version',
  app.includes('ReminderStatePanel') && app.includes('computeReminderState') && app.includes('advanceReminderSession') && app.includes('Mark clicked'));
assert('Web App exposes Migration conflict review first version',
  app.includes('MigrationConflictReviewPanel') && app.includes('refreshMigrationConflicts') && app.includes('resolveMigrationConflict'));
assert('Web App exposes disabled sync replay diagnostics in Settings',
  app.includes('SyncReplayDiagnosticsPanel') && app.includes('Sync replay diagnostics') && app.includes('Refresh outcomes') && app.includes('Inspect gate') && app.includes('Offline mutation replay is still disabled'));
assert('Web App exposes disabled replay readiness summary in Settings',
  app.includes('SyncReplayReadinessPanel') && app.includes('Replay readiness summary') && app.includes('Preview readiness') && app.includes('blocked reasons') && app.includes('buildReplayReadinessPreviewBody'));
assert('Web App exposes Phase 9 preview readiness hardening in Settings',
  app.includes('Evidence gaps') && app.includes('Dependency blockers') && app.includes('Cloud validation') && app.includes('preview_hardening'));
assert('Web App exposes disabled replay enablement simulation in Settings',
  app.includes('SyncReplayEnablementSimulationPanel') && app.includes('Replay enablement simulation') && app.includes('Run simulation') && app.includes('buildReplayEnablementSimulationPreviewBody'));
assert('Web App exposes Phase 4 replay safety gate in Settings',
  app.includes('SyncReplaySafetyPanel') && app.includes('Replay safety gate') && app.includes('Refresh safety') && app.includes('kill switch') && app.includes('cannot enable production replay'));
assert('Web App exposes Phase 5 pending Task queue retry preview and discard UX',
  app.includes('PendingTaskQueuePanel') && app.includes('Pending Task queue') && app.includes('Retry preview') && app.includes('Discard local pending') && app.includes('previewPendingTaskRetry') && app.includes('discardPendingTask'));
assert('Web App hardens Phase 8 Task pending UX without enabling full offline-first',
  app.includes('TaskPendingBanner')
    && app.includes('Open pending queue')
    && app.includes("selectedTask?.__sync_status !== 'pending'")
    && app.includes('Resolve local pending sync in Settings before direct Cloud edits.')
    && app.includes('pending-detail-note')
    && app.includes('Discard local pending in Settings before deleting')
    && pagesStyles.includes('task-pending-banner')
    && pagesStyles.includes('task-row.pending-sync'));
assert('Pages API client can read sync replay outcome diagnostics',
  apiClient.includes('listSyncMutationOutcomes') && apiClient.includes('getSyncMutationOutcome') && apiClient.includes('getSyncReplayReadinessSummary') && apiClient.includes('getSyncReplayEnablementSimulation') && apiClient.includes('getSyncReplaySafety') && apiClient.includes('getSyncBootstrap') && apiClient.includes('/sync/bootstrap') && apiClient.includes('/sync/mutations/readiness-summary') && apiClient.includes('/sync/mutations/enablement-simulation') && apiClient.includes('/sync/replay-safety') && apiClient.includes('/sync/mutations') && apiClient.includes('encodeURIComponent(mutationId)'));
assert('Pages API client can read sync changes by cursor',
  apiClient.includes('listSyncChanges') && apiClient.includes('/sync/changes') && apiClient.includes('cursor') && apiClient.includes('limit'));
assert('Pages API client can refresh TimeWhere Cloud session without Google secrets',
  apiClient.includes('refreshSession') && apiClient.includes('/auth/session/refresh') && !apiClient.includes('client_secret'));
assert('Pages API client can read safe account status and update workspace profile',
  apiClient.includes('getAccountStatus') && apiClient.includes('/account/status') && apiClient.includes('updateAccountProfile') && apiClient.includes('/account/profile'));
assert('Web App exposes Phase 3 Task sync conflict review in Settings',
  app.includes('SyncConflictDiagnosticsPanel') && app.includes('Task sync conflicts') && app.includes('Refresh conflicts') && app.includes('Inspect') && app.includes('Keep cloud') && app.includes('Discard local') && app.includes('Later'));
assert('Web App exposes Phase 3 Task sync conflict actions without apply-local overwrite',
  app.includes('cannot overwrite Cloud with local data') && !app.includes('Apply local'));
assert('Pages API client can read and resolve Task sync conflicts',
  apiClient.includes('listSyncConflicts') && apiClient.includes('getSyncConflict') && apiClient.includes('resolveSyncConflict') && apiClient.includes('/sync/conflicts') && apiClient.includes('/resolve') && apiClient.includes('encodeURIComponent(conflictId)'));
assert('Web App uses legacy IndexedDB snapshot adapter for migration preview',
  app.includes('buildLegacyIndexedDbSnapshot') && app.includes("deviceId: 'web-preview'"));
assert('Web App exposes Calendar event CRUD controls',
  app.includes('Create calendar event') && app.includes('Save event to Cloud') && app.includes('Search calendar events') && app.includes('CalendarEventDetailPanel') && app.includes('Save calendar event detail') && app.includes('Edit event') && app.includes('calendarRepository.updateEvent') && app.includes('Delete event'));
assert('Web App exposes Calendar event recurrence fields without changing D1 schema',
  app.includes('Repeat days') && app.includes('active_start_date') && app.includes('parseRepeatDaysText') && app.includes('payload: {') && app.includes('repeat_days'));
assert('Web App exposes Structure management controls',
  app.includes('Add plan') && app.includes('Add bucket') && app.includes('Add label') && app.includes('Add container') && app.includes('Search buckets and containers') && app.includes('StructureDetailPanel') && app.includes('Save structure detail') && app.includes('Edit plan') && app.includes('Edit container') && app.includes('Enabled') && app.includes('structureRepository.updatePlan') && app.includes('structureRepository.updateContainer') && app.includes('Google SSO session required before creating Cloud plans') && app.includes('Google SSO session required before creating Cloud buckets') && app.includes('Google SSO session required before creating Cloud labels'));
assert('Web App exposes Cloud settings controls',
  app.includes('Default duration') && app.includes('Default priority') && app.includes('Start week on') && app.includes('Theme') && app.includes('Background') && app.includes('Avatar') && app.includes('Enable notifications') && app.includes('Reminder before') && app.includes('Arrange trigger') && app.includes('Defensive threshold') && app.includes('Heal time') && app.includes('default_duration') && app.includes('appearance_background') && app.includes('Save settings'));
assert('Web App requires Google SSO session for writes and Task queueing',
  app.includes('Google SSO session required before creating or queueing tasks') && app.includes('Google SSO session required before editing or queueing tasks') && app.includes('Google SSO session required before creating Cloud calendar events'));
assert('Web App renders real Google SSO account entry',
  app.includes('renderGoogleSsoButton') && app.includes('googleButtonRef') && app.includes('Disconnect session') && !app.includes('<button disabled>Connect Google SSO</button>'));
assert('Web App exposes TimeWhere session refresh control',
  app.includes('refreshTimeWhereSession') && app.includes('Refresh session') && app.includes('TimeWhere Cloud session refreshed.'));
assert('Web App Settings can refresh real Cloud account and sync status',
  app.includes('refreshCloudSessionStatus') && app.includes('Refresh account status') && app.includes('apiClient.getSyncStatus') && app.includes('apiClient.getAccountStatus') && apiClient.includes('/sync/status'));
assert('Web App Settings exposes editable TimeWhere workspace profile and safe gate status',
  app.includes('Workspace profile')
    && app.includes('Save workspace')
    && app.includes('saveAccountProfile')
    && app.includes('task_replay_writes_enabled')
    && app.includes('prod_release_enabled'));
assert('Web App hydrates read cache from read-only sync bootstrap',
  app.includes('refreshFromBootstrap')
    && app.includes('apiClient.getSyncBootstrap')
    && app.includes('taskRepository.hydrateCache')
    && app.includes('calendarRepository.hydrateCache')
    && app.includes('structureRepository.hydrateCache')
    && app.includes('settingsRepository.hydrateCache')
    && app.includes('Cloud bootstrap loaded'));
assert('Web App can refresh read cache from read-only sync changes cursor',
  app.includes('SYNC_CURSOR_KEY')
    && app.includes('refreshIncrementalChanges')
    && app.includes('applyReadOnlyCloudChange')
    && app.includes('apiClient.listSyncChanges')
    && app.includes('Read cache cursor')
    && app.includes('Refresh changes')
    && app.includes('taskRepository.applyCloudTask')
    && app.includes('taskRepository.removeCloudTask')
    && app.includes('calendarRepository.applyCloudEvent')
    && app.includes('calendarRepository.removeCloudEvent')
    && app.includes('structureRepository.applyCloudItem')
    && app.includes('structureRepository.removeCloudItem'));

const pagesReadme = read('pages/README.md');
assert('Pages README documents Task-only queued pending and non-Task offline write block',
  pagesReadme.includes('Task-only queued pending') && pagesReadme.includes('Pending sync') && pagesReadme.includes('offline_write_blocked'));
assert('Pages README documents Worker proxy',
  pagesReadme.includes('127.0.0.1:4173') && pagesReadme.includes('127.0.0.1:8787'));
assert('Pages README documents Cloudflare Pages security headers and cache policy',
  pagesReadme.includes('pages/public/_headers')
    && pagesReadme.includes('Content-Security-Policy')
    && pagesReadme.includes('Cache-Control'));
assert('Pages README documents Google SSO client id configuration',
  pagesReadme.includes('VITE_GOOGLE_OIDC_CLIENT_ID') && pagesReadme.includes('GOOGLE_OIDC_CLIENT_ID') && pagesReadme.includes('不需要也不能配置 client secret'));
assert('Pages README documents TimeWhere session refresh without Google token',
  pagesReadme.includes('有效 session 的本地刷新') && pagesReadme.includes('不保存 Google token'));
assert('Pages README documents account workspace profile and runtime status',
  pagesReadme.includes('workspace/profile') && pagesReadme.includes('/account/status'));
assert('Pages README documents read-only sync bootstrap and incremental change refresh',
  pagesReadme.includes('/sync/bootstrap') && pagesReadme.includes('/sync/changes') && pagesReadme.includes('cursor') && pagesReadme.includes('不应用 mutation'));
assert('Pages README documents Tasks and Calendar migration v1',
  pagesReadme.includes('Tasks 已进入 WebDev Task-only queued pending 阶段') && pagesReadme.includes('Calendar Events 已进入第一版 WebDev 迁移实现'));
assert('Pages README documents Structure migration v1',
  pagesReadme.includes('Buckets / Containers 已进入第一版 WebDev 迁移实现'));
assert('Pages README documents Settings migration v1',
  pagesReadme.includes('Settings 已进入第一版 WebDev 迁移实现'));
assert('Pages README documents core business migration first versions',
  pagesReadme.includes('Task detail') && pagesReadme.includes('Calendar date projection') && pagesReadme.includes('Reminder state UI') && pagesReadme.includes('Migration conflict review'));

const rootPackage = JSON.parse(read('package.json'));
const workerPackage = JSON.parse(read('workers/package.json'));
assert('root package has webdev:check script', rootPackage.scripts['webdev:check'] === 'node tests/webdev-scaffold.test.js');
assert('root package has webdev:verify script', rootPackage.scripts['webdev:verify']?.includes('npm --prefix pages run build') && rootPackage.scripts['webdev:verify']?.includes('npm --prefix workers run typecheck'));
assert('root package has WebDev preview preflight script', rootPackage.scripts['webdev:preview:preflight'] === 'node scripts/webdev/preview-preflight.mjs');
const webdevPreviewPreflight = read('scripts/webdev/preview-preflight.mjs');
assert('WebDev preview preflight is read-only and gate-aware',
  webdevPreviewPreflight.includes('Gate A')
    && webdevPreviewPreflight.includes('REPLACE_WITH_PREVIEW_D1_ID')
    && webdevPreviewPreflight.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"')
    && !webdevPreviewPreflight.includes('wrangler deploy')
    && !webdevPreviewPreflight.includes('d1 create')
    && !webdevPreviewPreflight.includes('r2 bucket create')
    && !webdevPreviewPreflight.includes('kv namespace create'));
assert('root package has Gate A Cloudflare provision/deploy scripts',
  rootPackage.scripts['webdev:cloudflare:provision'] === 'node scripts/webdev/provision-cloudflare.mjs'
    && rootPackage.scripts['webdev:preview:deploy'] === 'node scripts/webdev/deploy-cloudflare-preview.mjs');
assert('root package has Gate A preview smoke script',
  rootPackage.scripts['webdev:preview:smoke'] === 'node scripts/webdev/preview-smoke.mjs');
assert('root package has Gate A preview headers smoke script',
  rootPackage.scripts['webdev:preview:headers-smoke'] === 'node scripts/webdev/preview-headers-smoke.mjs');
assert('root package has Gate A preview core smoke script',
  rootPackage.scripts['webdev:preview:core-smoke'] === 'node scripts/webdev/preview-core-smoke.mjs');
assert('root package has Gate A preview UI smoke script',
  rootPackage.scripts['webdev:preview:ui-smoke'] === 'node scripts/webdev/preview-ui-smoke.mjs');
assert('root package has Gate A preview data hygiene smoke script',
  rootPackage.scripts['webdev:preview:data-hygiene-smoke'] === 'node scripts/webdev/preview-data-hygiene-smoke.mjs');
assert('root package has Gate A preview acceptance aggregate script',
  rootPackage.scripts['webdev:preview:acceptance']?.includes('npm run webdev:preview:headers-smoke')
    && rootPackage.scripts['webdev:preview:acceptance']?.includes('npm run webdev:preview:smoke')
    && rootPackage.scripts['webdev:preview:acceptance']?.includes('npm run webdev:preview:core-smoke')
    && rootPackage.scripts['webdev:preview:acceptance']?.includes('npm run webdev:preview:ui-smoke')
    && rootPackage.scripts['webdev:preview:acceptance']?.includes('npm run webdev:preview:data-hygiene-smoke'));
assert('root package has Gate R readiness-only script',
  rootPackage.scripts['webdev:prod:readiness'] === 'node scripts/webdev/prod-readiness-check.mjs'
    && rootPackage.scripts['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs'
    && rootPackage.scripts['webdev:prod:package'] === 'node scripts/webdev/prod-readiness-package.mjs');
assert('root package has WebDev completion audit script',
  rootPackage.scripts['webdev:completion:audit'] === 'node scripts/webdev/completion-audit.mjs');
const cloudflareProvision = read('scripts/webdev/provision-cloudflare.mjs');
const previewDeploy = read('scripts/webdev/deploy-cloudflare-preview.mjs');
const previewHeadersSmoke = read('scripts/webdev/preview-headers-smoke.mjs');
const previewSmoke = read('scripts/webdev/preview-smoke.mjs');
const previewCoreSmoke = read('scripts/webdev/preview-core-smoke.mjs');
const previewUiSmoke = read('scripts/webdev/preview-ui-smoke.mjs');
const previewDataHygieneSmoke = read('scripts/webdev/preview-data-hygiene-smoke.mjs');
const prodReadinessCheck = read('scripts/webdev/prod-readiness-check.mjs');
const prodReadinessPackage = read('scripts/webdev/prod-readiness-package.mjs');
const completionAudit = read('scripts/webdev/completion-audit.mjs');
const browserExtensionReadinessCheck = read('scripts/webdev/browser-extension-readiness-check.mjs');
const desktopRuntimeReadinessCheck = read('scripts/webdev/desktop-runtime-readiness-check.mjs');
const observabilityBackupReadinessCheck = read('scripts/webdev/observability-backup-readiness-check.mjs');
assert('Cloudflare preview/provision scripts redact emails and local user paths in command output',
  [cloudflareProvision, previewDeploy, previewSmoke, previewCoreSmoke, previewUiSmoke, previewDataHygieneSmoke].every(script =>
    script.includes('<email>')
      && script.includes('<user-home>')
      && script.includes('replaceAll(root, \'<workspace>\')')));
assert('Cloudflare provision script targets dev and preview only',
  cloudflareProvision.includes('timewhere-dev-api')
    && cloudflareProvision.includes('timewhere-preview-api')
    && cloudflareProvision.includes('timewhere-dev-web')
    && cloudflareProvision.includes('timewhere-preview-web')
    && !cloudflareProvision.includes('timewhere-api"')
    && !cloudflareProvision.includes('timewhere-web"'));
assert('Cloudflare provision script writes resource ids only to ignored local state',
  cloudflareProvision.includes('.wrangler')
    && cloudflareProvision.includes('timewhere-cloudflare-resources.local.json')
    && cloudflareProvision.includes('timewhere-webdev.generated.wrangler.toml'));
assert('preview deploy script uses generated local config and preview environment',
  previewDeploy.includes('timewhere-cloudflare-resources.local.json')
    && previewDeploy.includes('timewhere-webdev.generated.wrangler.toml')
    && previewDeploy.includes("'--env', 'preview'")
    && previewDeploy.includes("'--branch',")
    && previewDeploy.includes("'WebDev'")
    && previewDeploy.includes('canonicalPagesUrl'));
assert('preview headers smoke checks CSP and cache headers without Cloudflare auth',
  previewHeadersSmoke.includes('content-security-policy')
    && previewHeadersSmoke.includes("frame-ancestors 'none'")
    && previewHeadersSmoke.includes('cache-control')
    && previewHeadersSmoke.includes('no-store')
    && previewHeadersSmoke.includes('public, max-age=31536000, immutable')
    && !previewHeadersSmoke.includes('wrangler'));
assert('preview smoke script is Gate A only and refuses non-preview resources',
  previewSmoke.includes('timewhere-preview-api')
    && previewSmoke.includes('timewhere-preview-web')
    && previewSmoke.includes('Preview smoke refuses to run against a non-preview'));
assert('preview smoke script checks Worker Pages D1 R2 and KV without prod',
  previewSmoke.includes('/health')
    && previewSmoke.includes('sqlite_master')
    && previewSmoke.includes("'r2'")
    && previewSmoke.includes("'kv'")
    && !previewSmoke.includes('timewhere-api"'));
assert('preview smoke scripts retry transient Wrangler API failures',
  [previewSmoke, previewCoreSmoke, previewUiSmoke, previewDataHygieneSmoke].every(script =>
    script.includes('isRetryableWranglerFailure')
      && script.includes('Authentication error\\s+\\[code:\\s*10000\\]')
      && script.includes('Wrangler transient failure')));
assert('preview core smoke script uses temporary smoke account and cleans up',
  previewCoreSmoke.includes('preview-smoke-')
    && previewCoreSmoke.includes('cleanupSmokeAccounts')
    && previewCoreSmoke.includes('deleteSmokeSnapshot')
    && previewCoreSmoke.includes('No prod resources were touched')
    && previewCoreSmoke.includes('no Google session, token, account email, or Cloudflare id was printed'));
assert('preview core smoke script covers core Worker APIs without replay enablement',
  previewCoreSmoke.includes('/account/status')
    && previewCoreSmoke.includes('/tasks')
    && previewCoreSmoke.includes('/calendar/events')
    && previewCoreSmoke.includes('/settings')
    && previewCoreSmoke.includes('/sync/bootstrap')
    && previewCoreSmoke.includes('/sync/changes')
    && previewCoreSmoke.includes('/migration/runs')
    && previewCoreSmoke.includes('/migration/conflicts?status=open')
    && previewCoreSmoke.includes('idempotent retry')
    && !previewCoreSmoke.includes('writes_enabled=true'));
assert('preview UI smoke script uses stable preview Pages and temporary smoke account',
  previewUiSmoke.includes('timewhere-preview-web.pages.dev')
    && previewUiSmoke.includes('preview-ui-smoke-')
    && previewUiSmoke.includes('cleanupSmokeAccounts')
    && previewUiSmoke.includes('No prod resources were touched'));
assert('preview UI smoke script covers core Web App views without Google browser session',
  previewUiSmoke.includes('Today projection')
    && previewUiSmoke.includes('/tasks')
    && previewUiSmoke.includes('/calendar/events')
    && previewUiSmoke.includes('Automatic migration')
    && previewUiSmoke.includes('Replay safety gate')
    && previewUiSmoke.includes('no Google session, token, account email, or Cloudflare id was printed')
    && !previewUiSmoke.includes('writes_enabled=true'));
assert('preview data hygiene smoke checks temporary smoke cleanup without prod',
  previewDataHygieneSmoke.includes('preview D1 has no smoke account/entity/migration references')
    && previewDataHygieneSmoke.includes("const prefixes = ['preview-smoke', 'preview-smoke:'];")
    && previewDataHygieneSmoke.includes('preview KV has no ${prefix} temporary keys')
    && previewDataHygieneSmoke.includes('local .wrangler has no preview smoke temp files')
    && previewDataHygieneSmoke.includes('timewhere-preview-api')
    && previewDataHygieneSmoke.includes('timewhere-preview-cache')
    && !previewDataHygieneSmoke.includes('timewhere-api"'));
assert('prod readiness script is static and release-gated',
  prodReadinessCheck.includes('WebDev prod readiness static check')
    && prodReadinessCheck.includes('No prod resource was created')
    && prodReadinessCheck.includes("!packageJson.scripts?.['webdev:prod:deploy']")
    && prodReadinessCheck.includes('REPLACE_WITH_PROD_D1_ID')
    && prodReadinessCheck.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH = \"on\"'));
assert('prod readiness package script is evidence-only and release-gated',
  prodReadinessPackage.includes('WebDev Prod Readiness Package Draft')
    && prodReadinessPackage.includes('readiness-only')
    && prodReadinessPackage.includes('Gate R: not approved')
    && prodReadinessPackage.includes('Required Evidence Commands Available')
    && prodReadinessPackage.includes('they do not prove the command was rerun for this commit')
    && prodReadinessPackage.includes('Execution Evidence To Attach Before Gate R')
    && prodReadinessPackage.includes('webdev:preview:acceptance')
    && prodReadinessPackage.includes('Latest preview acceptance recheck is recorded')
    && prodReadinessPackage.includes('webdev:extension:readiness')
    && prodReadinessPackage.includes('webdev:desktop:readiness')
    && prodReadinessPackage.includes('webdev:observability:readiness')
    && prodReadinessPackage.includes('webdev:prod:readiness')
    && prodReadinessPackage.includes('Re-deploy previous Worker commit')
    && prodReadinessPackage.includes('sanitize(output)')
    && !prodReadinessPackage.includes('wrangler deploy')
    && !prodReadinessPackage.includes('pages deploy'));
assert('completion audit script classifies readiness without approving gated work',
  completionAudit.includes('WebDev completion audit')
    && completionAudit.includes('readiness_complete_pending_approval_gates')
    && completionAudit.includes('WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md')
    && completionAudit.includes('Target architecture status baseline is current')
    && completionAudit.includes('does not approve prod, replay, desktop distribution, CWS, tag, merge, or release')
    && completionAudit.includes('webdev:completion:audit')
    && !completionAudit.includes('wrangler deploy')
    && !completionAudit.includes('pages deploy'));
assert('root package has webdev integration script', rootPackage.scripts['webdev:integration'] === 'node tests/webdev-integration.test.js');
assert('root package has WebDev UI walkthrough script', rootPackage.scripts['webdev:ui:walkthrough'] === 'node scripts/webdev/ui-walkthrough.mjs');
const webdevUiWalkthrough = read('scripts/webdev/ui-walkthrough.mjs');
assert('WebDev UI walkthrough exercises read cache change refresh',
  /getByRole\('button', \{ name: 'Refresh changes' \}\)\.click/.test(webdevUiWalkthrough)
    && webdevUiWalkthrough.includes('Settings refreshes read cache changes by cursor')
    && /Applied \\d\+ updated/.test(webdevUiWalkthrough)
    && webdevUiWalkthrough.includes('requestWorker')
    && webdevUiWalkthrough.includes("POST', '/tasks'")
    && webdevUiWalkthrough.includes('Tasks view receives incremental Cloud task from sync changes'));
const webdevDesktopRuntimeSmoke = read('scripts/webdev/desktop-runtime-smoke.mjs');
assert('root package has WebDev Browser Extension readiness script',
  rootPackage.scripts['webdev:extension:readiness'] === 'node scripts/webdev/browser-extension-readiness-check.mjs');
assert('root package has WebDev Task replay Gate B readiness script',
  rootPackage.scripts['webdev:gate-b:readiness'] === 'node scripts/webdev/task-replay-gate-b-readiness-check.mjs'
    && rootPackage.scripts['webdev:verify']?.includes('npm run webdev:gate-b:readiness'));
assert('root package has WebDev non-Task replay Gate C readiness script',
  rootPackage.scripts['webdev:gate-c:readiness'] === 'node scripts/webdev/non-task-replay-gate-c-readiness-check.mjs'
    && rootPackage.scripts['webdev:verify']?.includes('npm run webdev:gate-c:readiness'));
assert('root package has WebDev observability backup readiness script',
  rootPackage.scripts['webdev:observability:readiness'] === 'node scripts/webdev/observability-backup-readiness-check.mjs');
assert('root package has WebDev Desktop Runtime smoke script', rootPackage.scripts['webdev:desktop:smoke'] === 'node scripts/webdev/desktop-runtime-smoke.mjs');
assert('root package has WebDev Desktop Runtime readiness script',
  rootPackage.scripts['webdev:desktop:readiness'] === 'node scripts/webdev/desktop-runtime-readiness-check.mjs');
assert('root package has local WebDev acceptance script',
  rootPackage.scripts['webdev:acceptance:local']?.includes('npm run webdev:verify')
    && rootPackage.scripts['webdev:acceptance:local']?.includes('npm run webdev:ui:walkthrough')
    && rootPackage.scripts['webdev:acceptance:local']?.includes('npm run webdev:extension:readiness')
    && rootPackage.scripts['webdev:acceptance:local']?.includes('npm run webdev:desktop:readiness')
    && rootPackage.scripts['webdev:acceptance:local']?.includes('npm run webdev:desktop:smoke'));
assert('WebDev Browser Extension readiness check preserves Gate D boundary',
  browserExtensionReadinessCheck.includes('WebDev Browser Extension readiness static check')
    && browserExtensionReadinessCheck.includes('Browser Extension remains explicitly deferred')
    && browserExtensionReadinessCheck.includes('Gate D packet is approval-only')
    && browserExtensionReadinessCheck.includes('current Extension runtime has no WebDev replay endpoint integration')
    && browserExtensionReadinessCheck.includes('Gate D')
    && browserExtensionReadinessCheck.includes("!packageJson.scripts?.['webdev:extension:deploy']")
    && browserExtensionReadinessCheck.includes('No Extension replay, CWS submission, release, or deployment was performed'));
assert('WebDev observability backup readiness check covers error envelope, migration, and no prod action boundary',
  observabilityBackupReadinessCheck.includes('WebDev observability / backup readiness static check')
    && observabilityBackupReadinessCheck.includes('Worker API uses structured success and error envelopes')
    && observabilityBackupReadinessCheck.includes('migration import stores auditable R2 snapshots and D1 run state')
    && observabilityBackupReadinessCheck.includes('sync conflict records reject private fields')
    && observabilityBackupReadinessCheck.includes('prod storage bindings remain placeholders until Gate R')
    && observabilityBackupReadinessCheck.includes('No D1 export, R2 read, Wrangler command, prod resource, deploy, or release was performed')
    && !observabilityBackupReadinessCheck.includes('child_process'));
assert('WebDev Desktop Runtime readiness check preserves runtime-only boundary',
  desktopRuntimeReadinessCheck.includes('WebDev Desktop Runtime readiness static check')
    && desktopRuntimeReadinessCheck.includes('business_logic_owner')
    && desktopRuntimeReadinessCheck.includes('installWebDevNavigationGuards')
    && desktopRuntimeReadinessCheck.includes('Desktop preload exposes native bridge only')
    && desktopRuntimeReadinessCheck.includes('Gate E')
    && desktopRuntimeReadinessCheck.includes('Gate E packet is approval-only')
    && desktopRuntimeReadinessCheck.includes('No desktop package was built, signed, notarized, or distributed')
    && desktopRuntimeReadinessCheck.includes("!desktopSmoke.includes('package:win')")
    && desktopRuntimeReadinessCheck.includes("!desktopSmoke.includes('electron-builder')"));
assert('WebDev Desktop Runtime smoke loads local Pages through Electron without packaging',
  webdevDesktopRuntimeSmoke.includes('TIMEWHERE_ELECTRON_SMOKE')
    && webdevDesktopRuntimeSmoke.includes('TIMEWHERE_DESKTOP_RUNTIME_MODE')
    && webdevDesktopRuntimeSmoke.includes('TIMEWHERE_WEB_APP_URL')
    && webdevDesktopRuntimeSmoke.includes('Electron loaded WebDev Runtime mode')
    && webdevDesktopRuntimeSmoke.includes('platforms/desktop-electron')
    && !webdevDesktopRuntimeSmoke.includes('package:win')
    && !webdevDesktopRuntimeSmoke.includes('package:mac'));
assert('root package webdev verify runs local integration', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-integration.test.js'));
assert('root package webdev verify runs migration adapter tests', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-migration-adapter.test.js'));
assert('root package webdev verify runs business parity tests', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-business-parity.test.js'));
assert('root package webdev verify runs offline queue tests', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-offline-queue.test.js'));
assert('root package webdev verify runs preview preflight', rootPackage.scripts['webdev:verify']?.includes('npm run webdev:preview:preflight'));
assert('root package exposes local WebDev prepare script', rootPackage.scripts['webdev:local:prepare']?.includes('db:local:prepare'));
assert('root package exposes local WebDev reset script', rootPackage.scripts['webdev:local:reset']?.includes('db:local:reset'));
assert('root package has workers:typecheck script', rootPackage.scripts['workers:typecheck'] === 'npm --prefix workers run typecheck');
assert('worker package exposes local D1 migrate script', workerPackage.scripts['db:local:migrate']?.includes('run-local-d1-migrations.mjs'));
assert('worker package exposes local D1 seed script', workerPackage.scripts['db:local:seed']?.includes('create-local-seed-sql.mjs'));
assert('worker package local D1 runner supports isolated persist state', read('workers/scripts/run-local-d1-file.mjs').includes('TIMEWHERE_WRANGLER_PERSIST_TO'));
assert('worker package local D1 migrations runner supports isolated persist state', read('workers/scripts/run-local-d1-migrations.mjs').includes('TIMEWHERE_WRANGLER_PERSIST_TO'));
assert('worker package exposes local D1 reset script', workerPackage.scripts['db:local:reset']?.includes('clear-local-d1-state.mjs'));
assert('root test includes webdev scaffold test', rootPackage.scripts.test.includes('tests/webdev-scaffold.test.js'));
assert('root test includes webdev migration adapter test', rootPackage.scripts.test.includes('tests/webdev-migration-adapter.test.js'));
assert('root test includes webdev business parity test', rootPackage.scripts.test.includes('tests/webdev-business-parity.test.js'));
assert('root test includes webdev offline queue test', rootPackage.scripts.test.includes('tests/webdev-offline-queue.test.js'));

if (failed > 0) {
  console.error(`\n${failed} WebDev scaffold checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log(`\nAll ${passed} WebDev scaffold checks passed.`);
