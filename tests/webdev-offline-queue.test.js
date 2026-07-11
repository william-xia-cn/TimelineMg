const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

async function main() {
  console.log('WebDev offline mutation queue tests');
  console.log('=====================================');
  const rootDir = path.resolve(__dirname, '..');
  const queueModule = await import(pathToFileURL(path.join(rootDir, 'pages/src/repositories/offlineMutationQueue.js')).href);
  const taskRepositoryModule = await import(pathToFileURL(path.join(rootDir, 'pages/src/repositories/taskRepository.js')).href);

  const disabledStorage = new MemoryStorage();
  const disabledQueue = queueModule.createOfflineMutationQueue({ storage: disabledStorage, enabled: false });
  assert.equal(disabledQueue.getState().enabled, false);
  assert.equal(disabledQueue.getState().queued_count, 0);
  assert.throws(() => disabledQueue.enqueueMutation({
    entity_type: 'task',
    entity_id: 'task_1',
    operation: 'update',
    patch: { title: 'Offline title' }
  }), error => error.code === 'offline_mutation_queue_disabled');
  assert.equal(disabledQueue.listQueuedMutations().length, 0);
  console.log('  PASS disabled queue does not accept offline mutations');

  const enabledStorage = new MemoryStorage();
  const enabledQueue = queueModule.createOfflineMutationQueue({
    storage: enabledStorage,
    enabled: true,
    now: () => '2026-07-11T00:00:00.000Z',
    createId: () => 'mut_test'
  });
  const mutation = enabledQueue.enqueueMutation({
    account_id: 'acct_test',
    device_id: 'device_test',
    entity_type: 'task',
    entity_id: 'task_1',
    operation: 'update',
    base_revision: 2,
    base_values: { title: 'Old title' },
    patch: { title: 'New title' }
  });
  assert.equal(mutation.mutation_id, 'mut_test');
  assert.equal(mutation.status, 'queued');
  assert.equal(enabledQueue.getState().queued_count, 1);
  assert.equal(enabledQueue.listQueuedMutations()[0].field_paths[0], 'title');
  console.log('  PASS enabled internal queue writes mutation schema');

  const privatePatch = {};
  privatePatch['refresh' + '_token'] = 'do-not-store';
  assert.throws(() => enabledQueue.enqueueMutation({
    entity_type: 'task',
    entity_id: 'task_private',
    operation: 'update',
    patch: privatePatch
  }), error => error.code === 'offline_mutation_private_data');
  assert.equal(enabledQueue.getState().queued_count, 1);
  console.log('  PASS queue rejects private fields');

  const repositoryStorage = new MemoryStorage();
  const repositoryQueue = queueModule.createOfflineMutationQueue({ storage: repositoryStorage, enabled: false });
  const taskRepository = taskRepositoryModule.createTaskRepository({
    request: async () => {
      throw new Error('API must not be called while offline');
    }
  }, {
    storage: repositoryStorage,
    isOnline: () => false,
    offlineQueue: repositoryQueue
  });
  assert.equal(taskRepository.getOfflineMutationQueueState().enabled, false);
  await assert.rejects(() => taskRepository.createTask({ title: 'Offline blocked' }), error => error.code === 'offline_write_blocked');
  assert.equal(repositoryQueue.getState().queued_count, 0);
  console.log('  PASS task repository still blocks offline writes without queueing');

  console.log('=====================================');
  console.log('All WebDev offline mutation queue checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
