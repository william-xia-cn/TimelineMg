import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md',
  'docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md',
  'workers/wrangler.toml',
  'workers/src/index.ts',
  'workers/src/offlineMutations.ts',
  'workers/src/syncMutationTaskReplay.ts',
  'workers/src/syncReplayReadiness.ts',
  'workers/src/syncReplaySafety.ts',
  'workers/src/syncReplayEnablementSimulation.ts',
  'pages/src/App.jsx',
  'pages/src/repositories/taskRepository.js',
  'pages/src/repositories/calendarRepository.js',
  'pages/src/repositories/structureRepository.js',
  'pages/src/repositories/settingsRepository.js',
  'tests/webdev-offline-queue.test.js',
  'tests/webdev-integration.test.js',
  'package.json'
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

console.log('WebDev Task replay Gate B readiness static check');
console.log('================================================');

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const gateBPacket = exists('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md') ? read('docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md') : '';
const offlineDesign = exists('docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md') ? read('docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md') : '';
const completionChecklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md') ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md') : '';
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const wrangler = exists('workers/wrangler.toml') ? read('workers/wrangler.toml') : '';
const workerIndex = exists('workers/src/index.ts') ? read('workers/src/index.ts') : '';
const offlineMutations = exists('workers/src/offlineMutations.ts') ? read('workers/src/offlineMutations.ts') : '';
const taskReplay = exists('workers/src/syncMutationTaskReplay.ts') ? read('workers/src/syncMutationTaskReplay.ts') : '';
const replayReadiness = exists('workers/src/syncReplayReadiness.ts') ? read('workers/src/syncReplayReadiness.ts') : '';
const replaySafety = exists('workers/src/syncReplaySafety.ts') ? read('workers/src/syncReplaySafety.ts') : '';
const replaySimulation = exists('workers/src/syncReplayEnablementSimulation.ts') ? read('workers/src/syncReplayEnablementSimulation.ts') : '';
const app = exists('pages/src/App.jsx') ? read('pages/src/App.jsx') : '';
const taskRepository = exists('pages/src/repositories/taskRepository.js') ? read('pages/src/repositories/taskRepository.js') : '';
const calendarRepository = exists('pages/src/repositories/calendarRepository.js') ? read('pages/src/repositories/calendarRepository.js') : '';
const structureRepository = exists('pages/src/repositories/structureRepository.js') ? read('pages/src/repositories/structureRepository.js') : '';
const settingsRepository = exists('pages/src/repositories/settingsRepository.js') ? read('pages/src/repositories/settingsRepository.js') : '';
const offlineQueueTest = exists('tests/webdev-offline-queue.test.js') ? read('tests/webdev-offline-queue.test.js') : '';
const integrationTest = exists('tests/webdev-integration.test.js') ? read('tests/webdev-integration.test.js') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };

assert('root package exposes Gate B readiness script',
  packageJson.scripts?.['webdev:gate-b:readiness'] === 'node scripts/webdev/task-replay-gate-b-readiness-check.mjs');

assert('Gate B packet is approval-only and not enablement',
  gateBPacket.includes('Gate B readiness packet')
    && gateBPacket.includes('不批准、不开启、不发布')
    && gateBPacket.includes('是否允许 Web App 将本地 queued pending Task mutation 重放到 Cloud canonical D1')
    && gateBPacket.includes('Task delete 继续保持用户侧阻断')
    && gateBPacket.includes('Calendar / Container / Settings replay 不包含在 Gate B')
    && gateBPacket.includes('prod deployment'));

assert('offline design keeps Gate B separated from broader replay scope',
  offlineDesign.includes('Task-only replay must remain disabled')
    && offlineDesign.includes('Gate B: Readiness Evidence')
    && offlineDesign.includes('Approval to enable Task-only replay does not approve')
    && offlineDesign.includes('Calendar / Container / Settings replay')
    && offlineDesign.includes('local-over-cloud actions remain blocked'));

assert('Worker default sync mutation path remains disabled',
  workerIndex.includes('attachTaskReplayTransactionSkeleton(validateOfflineMutationReplay(body))')
    && offlineMutations.includes("replay_status: 'disabled_v1'")
    && offlineMutations.includes("activation_gate: 'task_only_replay_defined_but_disabled_v1'")
    && offlineMutations.includes('accepted: false')
    && replayReadiness.includes('writes_enabled: false')
    && replayReadiness.includes('applies_user_data: false')
    && replayReadiness.includes('can_enable_replay: false'));

assert('test-only Task replay is constrained away from preview and prod',
  workerIndex.includes('assertTestOnlyTaskReplayAllowed(env)')
    && workerIndex.includes("test_only_task_replay_not_available")
    && workerIndex.includes("['dev', 'local', 'test'].includes(envName)")
    && taskReplay.includes("replay_status: REPLAY_STATUS")
    && taskReplay.includes('test_only: true')
    && taskReplay.includes('writes_enabled: true'));

assert('replay safety and enablement simulation never enable writes',
  replaySafety.includes('prod_replay_allowed: false')
    && replaySafety.includes('writes_enabled: false')
    && replaySafety.includes('applies_user_data: false')
    && replaySafety.includes('can_run_replay: false')
    && replaySimulation.includes('replay_enablement: ')
    && replaySimulation.includes('simulation_only')
    && replaySimulation.includes('writes_enabled: false')
    && replaySimulation.includes('can_enable_replay: false'));

assert('wrangler keeps replay kill switches off for user-facing writes',
  wrangler.includes('TIMEWHERE_TASK_REPLAY_KILL_SWITCH = "on"')
    && wrangler.includes('TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED = "false"')
    && wrangler.includes('[env.prod.vars]')
    && wrangler.includes('REPLACE_WITH_PROD_D1_ID')
    && wrangler.includes('REPLACE_WITH_PROD_KV_ID'));

assert('Pages queues Task-only pending edits while keeping Cloud success explicit',
  taskRepository.includes('__sync_status: ')
    && taskRepository.includes('__pending_operation')
    && taskRepository.includes('enqueueMutation')
    && taskRepository.includes("operation: 'create'")
    && taskRepository.includes("return 'update'")
    && taskRepository.includes("patch?.progress === 'completed'")
    && taskRepository.includes("patch?.progress === 'not_started'")
    && taskRepository.includes('deleteTask(id)')
    && taskRepository.includes('offline_write_blocked'));

assert('non-Task repositories continue blocking offline writes',
  calendarRepository.includes('OfflineCalendarWriteBlockedError')
    && calendarRepository.includes('offline_write_blocked')
    && structureRepository.includes('OfflineStructureWriteBlockedError')
    && structureRepository.includes('offline_write_blocked')
    && settingsRepository.includes('OfflineSettingsWriteBlockedError')
    && settingsRepository.includes('offline_write_blocked'));

assert('Settings UI exposes preview/discard only, not replay apply',
  app.includes('Pending Task edits are local-only until Worker replay is explicitly enabled')
    && app.includes('Retry preview runs dry-run/readiness only')
    && app.includes('Discard local pending')
    && app.includes('Cloud data was not changed')
    && app.includes('This phase can keep Cloud data or discard the local pending change; it cannot overwrite Cloud with local data.'));

assert('tests cover pending preservation, idempotency, conflict, and non-Task blocking',
  offlineQueueTest.includes('queues Task-only pending writes while offline and still blocks delete')
    && offlineQueueTest.includes('bootstrap cache hydrate preserves local pending Task values')
    && offlineQueueTest.includes('incremental Cloud changes do not overwrite local pending Task values')
    && integrationTest.includes('test_only_task_replay_enabled')
    && integrationTest.includes('idempotent_replay_already_applied')
    && integrationTest.includes('field_conflict')
    && integrationTest.includes('test-only replay keeps non-Task entities blocked'));

assert('completion/status docs keep Gate B unapproved',
  completionChecklist.includes('| B | 启用用户可见 Task replay 写 Cloud')
    && projectMaster.includes('Task replay remains gated')
    && taskBoard.includes('Product Owner approved Phase 1 Task-only test replay server write implementation')
    && taskBoard.toLowerCase().includes('user-facing')
    && taskBoard.toLowerCase().includes('remain blocked'));

assert('no prod or release script is exposed by Gate B readiness',
  !packageJson.scripts?.['webdev:prod:deploy']
    && !packageJson.scripts?.['webdev:release']
    && !packageJson.scripts?.['webdev:task-replay:enable']);

assertNoObviousSecrets('Gate B readiness scanned files contain no obvious secrets',
  [
    gateBPacket,
    offlineDesign,
    completionChecklist,
    projectMaster,
    taskBoard,
    wrangler,
    workerIndex,
    offlineMutations,
    taskReplay,
    replayReadiness,
    replaySafety,
    replaySimulation,
    app,
    taskRepository,
    calendarRepository,
    structureRepository,
    settingsRepository,
    offlineQueueTest,
    integrationTest
  ].join('\n'));

if (failed > 0) {
  console.error(`\n${failed} WebDev Task replay Gate B readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('================================================');
console.log(`All ${passed} WebDev Task replay Gate B readiness checks passed.`);
console.log('This is approval evidence only. No replay write path was enabled for users, preview, or prod.');
