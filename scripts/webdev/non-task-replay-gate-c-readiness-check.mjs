import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const requiredFiles = [
  'docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md',
  'docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md',
  'docs/WEBDEV_COMPLETION_CHECKLIST.md',
  'PROJECT_MASTER.md',
  'TASK_BOARD.md',
  'workers/src/offlineMutations.ts',
  'workers/src/syncMutationTaskReplay.ts',
  'workers/src/syncReplayReadiness.ts',
  'pages/src/App.jsx',
  'pages/src/repositories/calendarRepository.js',
  'pages/src/repositories/structureRepository.js',
  'pages/src/repositories/settingsRepository.js',
  'tests/webdev-integration.test.js',
  'tests/webdev-offline-queue.test.js',
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

console.log('WebDev non-Task replay Gate C readiness static check');
console.log('====================================================');

for (const file of requiredFiles) {
  assert(`${file} exists`, exists(file));
}

const gateCPacket = exists('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md') ? read('docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md') : '';
const offlineDesign = exists('docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md') ? read('docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md') : '';
const completionChecklist = exists('docs/WEBDEV_COMPLETION_CHECKLIST.md') ? read('docs/WEBDEV_COMPLETION_CHECKLIST.md') : '';
const projectMaster = exists('PROJECT_MASTER.md') ? read('PROJECT_MASTER.md') : '';
const taskBoard = exists('TASK_BOARD.md') ? read('TASK_BOARD.md') : '';
const offlineMutations = exists('workers/src/offlineMutations.ts') ? read('workers/src/offlineMutations.ts') : '';
const taskReplay = exists('workers/src/syncMutationTaskReplay.ts') ? read('workers/src/syncMutationTaskReplay.ts') : '';
const replayReadiness = exists('workers/src/syncReplayReadiness.ts') ? read('workers/src/syncReplayReadiness.ts') : '';
const app = exists('pages/src/App.jsx') ? read('pages/src/App.jsx') : '';
const calendarRepository = exists('pages/src/repositories/calendarRepository.js') ? read('pages/src/repositories/calendarRepository.js') : '';
const structureRepository = exists('pages/src/repositories/structureRepository.js') ? read('pages/src/repositories/structureRepository.js') : '';
const settingsRepository = exists('pages/src/repositories/settingsRepository.js') ? read('pages/src/repositories/settingsRepository.js') : '';
const integrationTest = exists('tests/webdev-integration.test.js') ? read('tests/webdev-integration.test.js') : '';
const offlineQueueTest = exists('tests/webdev-offline-queue.test.js') ? read('tests/webdev-offline-queue.test.js') : '';
const packageJson = exists('package.json') ? JSON.parse(read('package.json')) : { scripts: {} };

assert('root package exposes Gate C readiness script',
  packageJson.scripts?.['webdev:gate-c:readiness'] === 'node scripts/webdev/non-task-replay-gate-c-readiness-check.mjs');

assert('Gate C packet is approval-only and split by entity family',
  gateCPacket.includes('Gate C readiness packet')
    && gateCPacket.includes('不批准、不开启、不实现 Calendar / Container / Settings replay')
    && gateCPacket.includes('C1 Calendar')
    && gateCPacket.includes('C2 Structure')
    && gateCPacket.includes('C3 Settings')
    && gateCPacket.includes('npm.cmd run webdev:gate-c:readiness'));

assert('offline design records non-Task replay as design-only',
  offlineDesign.includes('Phase 6: Calendar / Container / Settings Replay Design Only')
    && offlineDesign.includes('Calendar / Container / Settings repositories must continue returning `offline_write_blocked`')
    && offlineDesign.includes('Worker replay gates must continue rejecting non-Task entities with `entity_not_enabled`')
    && offlineDesign.includes('Shared Non-Task Approval Gate'));

assert('Worker Task replay gate continues rejecting non-Task mutations',
  offlineMutations.includes("status: 'not_in_task_only_gate'")
    && offlineMutations.includes("reason: 'entity_replay_not_in_task_gate'")
    && taskReplay.includes("return rejectedResult(mutation, 'entity_replay_not_in_task_gate'")
    && taskReplay.includes('test_only: true')
    && replayReadiness.includes('writes_enabled: false')
    && replayReadiness.includes('can_enable_replay: false'));

assert('Calendar repository blocks offline writes and has no mutation enqueue path',
  calendarRepository.includes('OfflineCalendarWriteBlockedError')
    && calendarRepository.includes('offline_write_blocked: reconnect before editing current calendar data.')
    && calendarRepository.includes('assertOnline(isOnline)')
    && !calendarRepository.includes('enqueueMutation'));

assert('Structure repository blocks offline writes and has no mutation enqueue path',
  structureRepository.includes('OfflineStructureWriteBlockedError')
    && structureRepository.includes('offline_write_blocked: reconnect before editing structure data.')
    && structureRepository.includes('assertOnline(isOnline)')
    && !structureRepository.includes('enqueueMutation'));

assert('Settings repository blocks offline writes and has no mutation enqueue path',
  settingsRepository.includes('OfflineSettingsWriteBlockedError')
    && settingsRepository.includes('offline_write_blocked: reconnect before editing settings.')
    && settingsRepository.includes('assertOnline(isOnline)')
    && !settingsRepository.includes('enqueueMutation'));

assert('Web App only exposes Task pending queue controls',
  app.includes('Pending Task edits are local-only')
    && app.includes('No local pending Task edits')
    && app.includes('Task replay writes')
    && !app.includes('Pending Calendar edits')
    && !app.includes('Pending Container edits')
    && !app.includes('Pending Settings edits'));

assert('tests cover non-Task replay rejection and offline write blocking',
  integrationTest.includes('nonTaskReplayPreview')
    && integrationTest.includes('entity_replay_not_in_task_gate')
    && integrationTest.includes('test-only replay keeps non-Task entities blocked')
    && offlineQueueTest.includes('queues Task-only pending writes while offline and still blocks delete'));

assert('completion/status docs keep Gate C unapproved',
  completionChecklist.includes('| C | 实现 Calendar / Container / Settings replay')
    && projectMaster.includes('no non-Task replay implementation is approved')
    && taskBoard.includes('Calendar/Container/Settings replay implementation')
    && taskBoard.includes('requiring separate approval before implementation'));

assert('Gate C readiness exposes no replay enable or release script',
  !packageJson.scripts?.['webdev:gate-c:enable']
    && !packageJson.scripts?.['webdev:non-task-replay:enable']
    && !packageJson.scripts?.['webdev:release']);

assertNoObviousSecrets('Gate C readiness scanned files contain no obvious secrets',
  [
    gateCPacket,
    offlineDesign,
    completionChecklist,
    projectMaster,
    taskBoard,
    offlineMutations,
    taskReplay,
    replayReadiness,
    app,
    calendarRepository,
    structureRepository,
    settingsRepository,
    integrationTest,
    offlineQueueTest
  ].join('\n'));

if (failed > 0) {
  console.error(`\n${failed} WebDev non-Task replay Gate C readiness checks failed; ${passed} passed.`);
  process.exit(1);
}

console.log('====================================================');
console.log(`All ${passed} WebDev non-Task replay Gate C readiness checks passed.`);
console.log('This is approval evidence only. No Calendar, Container, or Settings replay was implemented or enabled.');
