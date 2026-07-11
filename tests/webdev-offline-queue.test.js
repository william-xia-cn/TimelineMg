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

  const removal = enabledQueue.removeQueuedMutations(['mut_test']);
  assert.equal(removal.removed_count, 1);
  assert.equal(removal.remaining_count, 0);
  assert.equal(enabledQueue.listQueuedMutations().length, 0);
  console.log('  PASS queue removes selected queued mutations');

  const repositoryStorage = new MemoryStorage();
  const repositoryQueue = queueModule.createOfflineMutationQueue({
    storage: repositoryStorage,
    enabled: true,
    now: () => '2026-07-11T01:00:00.000Z',
    createId: () => `mut_repo_${repositoryQueue.getState().queued_count + 1}`
  });
  const taskRepository = taskRepositoryModule.createTaskRepository({
    request: async () => {
      throw new Error('API must not be called while offline');
    }
  }, {
    storage: repositoryStorage,
    isOnline: () => false,
    offlineQueue: repositoryQueue
  });
  assert.equal(taskRepository.getOfflineMutationQueueState().enabled, true);
  const createdOffline = await taskRepository.createTask({ title: 'Offline queued', priority: 'important' });
  assert.equal(createdOffline.__sync_status, 'pending');
  assert.equal(createdOffline.__pending_operation, 'create');
  assert.equal(repositoryQueue.getState().queued_count, 1);
  assert.equal(repositoryQueue.listQueuedMutations()[0].operation, 'create');
  assert.equal(taskRepository.getCachedTasks()[0].title, 'Offline queued');
  const updatedOffline = await taskRepository.updateTask(createdOffline.id, { notes: 'Offline note', priority: 'urgent' });
  assert.equal(updatedOffline.__sync_status, 'pending');
  assert.equal(updatedOffline.__pending_operation, 'update');
  assert.equal(updatedOffline.notes, 'Offline note');
  assert.equal(repositoryQueue.getState().queued_count, 2);
  const completedOffline = await taskRepository.completeTask(createdOffline.id);
  assert.equal(completedOffline.__pending_operation, 'complete');
  assert.equal(completedOffline.progress, 'completed');
  assert(completedOffline.completed_at);
  const reopenedOffline = await taskRepository.reopenTask(createdOffline.id);
  assert.equal(reopenedOffline.__pending_operation, 'reopen');
  assert.equal(reopenedOffline.progress, 'not_started');
  assert.equal(reopenedOffline.completed_at, null);
  assert.equal(repositoryQueue.getState().queued_count, 4);
  await assert.rejects(() => taskRepository.deleteTask(createdOffline.id), error => error.code === 'offline_write_blocked');
  assert.equal(repositoryQueue.getState().queued_count, 4);
  console.log('  PASS task repository queues Task-only pending writes while offline and still blocks delete');

  assert.equal(taskRepository.listPendingTaskMutations().length, 4);
  const discarded = taskRepository.discardPendingTaskMutations(createdOffline.id);
  assert.equal(discarded.removed_count, 4);
  assert.equal(discarded.removed_task, true);
  assert.equal(repositoryQueue.getState().queued_count, 0);
  assert.equal(taskRepository.getCachedTasks().length, 0);
  console.log('  PASS task repository can discard local pending Task mutations');

  console.log('=====================================');
  console.log('All WebDev offline mutation queue checks passed.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
