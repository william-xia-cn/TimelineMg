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
  'workers/package.json',
  'workers/package-lock.json',
  'workers/tsconfig.json',
  'workers/migrations/0001_initial.sql',
  'workers/migrations/0002_task_parity_fields.sql',
  'workers/migrations/0003_sync_changes.sql',
  'workers/scripts/clear-local-d1-state.mjs',
  'workers/scripts/create-local-seed-sql.mjs',
  'workers/scripts/run-local-d1-file.mjs',
  'workers/scripts/run-local-d1-migrations.mjs',
  'workers/src/index.ts',
  'workers/src/auth.ts',
  'workers/src/migration.ts',
  'workers/src/repositories.ts',
  'workers/src/sync.ts',
  'pages/README.md',
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
  'pages/src/platform/browserPlatform.js'
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

const sql = read('workers/migrations/0001_initial.sql');
const taskParityMigration = read('workers/migrations/0002_task_parity_fields.sql');
const syncChangesMigration = read('workers/migrations/0003_sync_changes.sql');
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

const workerIndex = read('workers/src/index.ts');
for (const [route, pattern] of [
  ['/auth/google', /auth\\\/google/],
  ['/auth/session', /auth\\\/session/],
  ['/account/me', /account\\\/me/],
  ['/tasks', /\/tasks/],
  ['/calendar/events', /calendar\\\/events/],
  ['/plans', /\/plans/],
  ['/buckets', /\/buckets/],
  ['/labels', /\/labels/],
  ['/containers', /\/containers/],
  ['/settings', /\/settings/],
  ['/migration/runs', /migration\\\/runs/],
  ['/migration/conflicts', /migration\\\/conflicts/],
  ['/sync/changes', /sync\\\/changes/],
  ['/sync/status', /sync\\\/status/]
]) {
  assert(`Worker route includes ${route}`, pattern.test(workerIndex));
}
assert('Worker sync status documents offline blocked v1', workerIndex.includes("offline_writes: 'blocked_v1'"));
assert('Worker sync status exposes change feed foundation', workerIndex.includes("change_feed: 'available'") && workerIndex.includes('handleListSyncChanges'));
assert('Worker supports local Cloud session disconnect', workerIndex.includes('handleDeleteSession') && workerIndex.includes('revokeSession'));

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

const workerRepository = read('workers/src/repositories.ts');
const workerSync = read('workers/src/sync.ts');
assert('Worker sync change feed records idempotent cursor rows',
  workerSync.includes('recordSyncChange') && workerSync.includes('listSyncChanges') && workerSync.includes('next_cursor') && workerSync.includes('entity_revision'));
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

const pagesPackage = JSON.parse(read('pages/package.json'));
assert('Pages package depends on React', Boolean(pagesPackage.dependencies.react));
assert('Pages package depends on Vite', Boolean(pagesPackage.dependencies.vite));
assert('Pages package depends on lucide-react', Boolean(pagesPackage.dependencies['lucide-react']));
const viteConfig = read('pages/vite.config.js');
assert('Pages dev proxy forwards Worker health checks',
  viteConfig.includes("'/health': 'http://127.0.0.1:8787'"));

const taskRepository = read('pages/src/repositories/taskRepository.js');
const offlineQueue = read('pages/src/repositories/offlineMutationQueue.js');
assert('Offline mutation queue helper exists but defaults to disabled',
  offlineQueue.includes('timewhere.web.offline.mutations.v1') && offlineQueue.includes('offline_mutation_queue_disabled') && offlineQueue.includes('enabled = false'));
assert('Offline mutation queue rejects private fields',
  offlineQueue.includes('offline_mutation_private_data') && offlineQueue.includes('refresh_token') && offlineQueue.includes('access_token'));
assert('Task repository persists local read cache',
  taskRepository.includes('timewhere.web.tasks.cache.v1') && taskRepository.includes('writeCachedTasks') && taskRepository.includes('getCachedTasks'));
assert('Task repository blocks offline writes',
  taskRepository.includes('OfflineWriteBlockedError') && taskRepository.includes('offline_write_blocked'));
assert('Task repository exposes disabled offline queue state without enabling writes',
  taskRepository.includes('createOfflineMutationQueue') && taskRepository.includes('getOfflineMutationQueueState'));
assert('Task repository supports complete reopen and delete',
  taskRepository.includes('completeTask') && taskRepository.includes('reopenTask') && taskRepository.includes('deleteTask'));

const calendarRepository = read('pages/src/repositories/calendarRepository.js');
assert('Calendar repository persists local read cache',
  calendarRepository.includes('timewhere.web.calendar.cache.v1') && calendarRepository.includes('writeCachedEvents') && calendarRepository.includes('getCachedEvents'));
assert('Calendar repository blocks offline writes',
  calendarRepository.includes('OfflineCalendarWriteBlockedError') && calendarRepository.includes('offline_write_blocked'));
assert('Calendar repository supports list create update delete',
  calendarRepository.includes('listEvents') && calendarRepository.includes('createEvent') && calendarRepository.includes('updateEvent') && calendarRepository.includes('deleteEvent'));

const structureRepository = read('pages/src/repositories/structureRepository.js');
assert('Structure repository persists local read cache',
  structureRepository.includes('timewhere.web.structure.cache.v1') && structureRepository.includes('getCachedStructure') && structureRepository.includes('writeCache'));
assert('Structure repository blocks offline writes',
  structureRepository.includes('OfflineStructureWriteBlockedError') && structureRepository.includes('offline_write_blocked'));
assert('Structure repository supports plan label bucket and container CRUD',
  structureRepository.includes('createPlan') && structureRepository.includes('deletePlan') && structureRepository.includes('createLabel') && structureRepository.includes('deleteLabel') && structureRepository.includes('createBucket') && structureRepository.includes('deleteBucket') && structureRepository.includes('createContainer') && structureRepository.includes('deleteContainer'));

const settingsRepository = read('pages/src/repositories/settingsRepository.js');
assert('Settings repository persists local read cache',
  settingsRepository.includes('timewhere.web.settings.cache.v1') && settingsRepository.includes('getCachedSettings') && settingsRepository.includes('writeCachedSettings'));
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
for (const label of ['Dashboard', 'Tasks', 'Calendar', 'Settings']) {
  assert(`Web App exposes ${label}`, app.includes(label));
}
assert('Web App blocks offline writes', app.includes('offline_write_blocked'));
assert('Web App includes migration preview', app.includes('Run migration preview'));
assert('Web App exposes Task CRUD controls',
  app.includes('Save to Cloud') && app.includes('Complete task') && app.includes('Reopen task') && app.includes('Delete task'));
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
assert('Web App uses legacy IndexedDB snapshot adapter for migration preview',
  app.includes('buildLegacyIndexedDbSnapshot') && app.includes("deviceId: 'web-preview'"));
assert('Web App exposes Calendar event CRUD controls',
  app.includes('Create calendar event') && app.includes('Save event to Cloud') && app.includes('Search calendar events') && app.includes('Delete event'));
assert('Web App exposes Structure management controls',
  app.includes('Add plan') && app.includes('Add bucket') && app.includes('Add label') && app.includes('Add container') && app.includes('Search buckets and containers') && app.includes('Google SSO session required before creating Cloud plans') && app.includes('Google SSO session required before creating Cloud buckets') && app.includes('Google SSO session required before creating Cloud labels'));
assert('Web App exposes Cloud settings controls',
  app.includes('Default duration') && app.includes('Default priority') && app.includes('Enable reminders') && app.includes('Save settings'));
assert('Web App requires Google SSO session for writes',
  app.includes('Google SSO session required before creating Cloud tasks') && app.includes('Google SSO session required before editing Cloud tasks') && app.includes('Google SSO session required before creating Cloud calendar events'));
assert('Web App renders real Google SSO account entry',
  app.includes('renderGoogleSsoButton') && app.includes('googleButtonRef') && app.includes('Disconnect session') && !app.includes('<button disabled>Connect Google SSO</button>'));
assert('Web App Settings can refresh real Cloud account and sync status',
  app.includes('refreshCloudSessionStatus') && app.includes('Refresh account status') && app.includes('apiClient.getSyncStatus') && read('pages/src/api/client.js').includes('/sync/status'));

const pagesReadme = read('pages/README.md');
assert('Pages README documents offline write block',
  pagesReadme.includes('离线时禁止修改当前数据') && pagesReadme.includes('offline_write_blocked'));
assert('Pages README documents Worker proxy',
  pagesReadme.includes('127.0.0.1:4173') && pagesReadme.includes('127.0.0.1:8787'));
assert('Pages README documents Google SSO client id configuration',
  pagesReadme.includes('VITE_GOOGLE_OIDC_CLIENT_ID') && pagesReadme.includes('GOOGLE_OIDC_CLIENT_ID') && pagesReadme.includes('不需要也不能配置 client secret'));
assert('Pages README documents Tasks and Calendar migration v1',
  pagesReadme.includes('Tasks 已进入第一版 WebDev 迁移实现') && pagesReadme.includes('Calendar Events 已进入第一版 WebDev 迁移实现'));
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
assert('root package has webdev integration script', rootPackage.scripts['webdev:integration'] === 'node tests/webdev-integration.test.js');
assert('root package webdev verify runs local integration', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-integration.test.js'));
assert('root package webdev verify runs migration adapter tests', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-migration-adapter.test.js'));
assert('root package webdev verify runs business parity tests', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-business-parity.test.js'));
assert('root package webdev verify runs offline queue tests', rootPackage.scripts['webdev:verify']?.includes('node tests/webdev-offline-queue.test.js'));
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




