import { createOfflineMutationQueue } from './offlineMutationQueue.js';

const TASK_CACHE_KEY = 'timewhere.web.tasks.cache.v1';

export class OfflineWriteBlockedError extends Error {
  constructor(message = 'Editing requires a network connection') {
    super(message);
    this.code = 'offline_write_blocked';
  }
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

function readCachedTasks(storage) {
  if (!canUseStorage(storage)) return [];
  try {
    const payload = JSON.parse(storage.getItem(TASK_CACHE_KEY) || 'null');
    return Array.isArray(payload?.tasks) ? payload.tasks : [];
  } catch {
    return [];
  }
}

function writeCachedTasks(storage, tasks) {
  if (!canUseStorage(storage)) return;
  storage.setItem(TASK_CACHE_KEY, JSON.stringify({
    schema: 'timewhere-task-cache-v1',
    cached_at: new Date().toISOString(),
    tasks: Array.isArray(tasks) ? tasks : []
  }));
}

function assertOnline(isOnline) {
  if (!isOnline()) throw new OfflineWriteBlockedError('offline_write_blocked: reconnect before editing current data.');
}

function defaultTaskId() {
  if (globalThis.crypto?.randomUUID) return `task_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function nowISO() {
  return new Date().toISOString();
}

function normalizeTaskPatchForOffline(task, patch) {
  const nextPatch = { ...(patch || {}) };
  if (nextPatch.progress === 'completed' && !Object.prototype.hasOwnProperty.call(nextPatch, 'completed_at')) {
    nextPatch.completed_at = nowISO();
  }
  if (nextPatch.progress && nextPatch.progress !== 'completed' && !Object.prototype.hasOwnProperty.call(nextPatch, 'completed_at')) {
    nextPatch.completed_at = null;
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'duration')) {
    const duration = Number(nextPatch.duration || 45);
    nextPatch.duration = Number.isFinite(duration) && duration > 0 ? Math.min(24 * 60, Math.round(duration)) : 45;
  }
  return nextPatch;
}

function operationForPatch(patch) {
  if (patch?.progress === 'completed') return 'complete';
  if (patch?.progress === 'not_started' && patch?.completed_at === null) return 'reopen';
  return 'update';
}

function pickBaseValues(task, fields) {
  const source = task && typeof task === 'object' ? task : {};
  return Object.fromEntries(fields.map(field => [field, source[field] ?? null]));
}

function markPending(task, mutation, operation) {
  return {
    ...task,
    __sync_status: 'pending',
    __pending_mutation_id: mutation.mutation_id,
    __pending_operation: operation,
    __pending_at: mutation.created_at || nowISO()
  };
}

function clearPendingMarker(task) {
  if (!task) return task;
  const {
    __sync_status: _syncStatus,
    __pending_mutation_id: _pendingMutationId,
    __pending_operation: _pendingOperation,
    __pending_at: _pendingAt,
    ...rest
  } = task;
  return rest;
}

function mergeTaskIntoCache(storage, task) {
  if (!task?.id) return;
  const tasks = readCachedTasks(storage);
  const index = tasks.findIndex(item => item.id === task.id);
  if (index >= 0) tasks[index] = task;
  else tasks.unshift(task);
  writeCachedTasks(storage, tasks);
}

function removeTaskFromCache(storage, id) {
  writeCachedTasks(storage, readCachedTasks(storage).filter(task => task.id !== id));
}

function cachedTaskById(storage, id) {
  return readCachedTasks(storage).find(task => task.id === id) || null;
}

function createPendingOfflineTask(storage, offlineQueue, input) {
  const id = input.id || defaultTaskId();
  const createdAt = nowISO();
  const task = markPending({
    id,
    ...input,
    title: input.title || 'Untitled Task',
    progress: input.progress || 'not_started',
    priority: input.priority || 'medium',
    duration: Number(input.duration || 45),
    checklist: Array.isArray(input.checklist) ? input.checklist : [],
    labels: Array.isArray(input.labels) ? input.labels : [],
    created_at: createdAt,
    updated_at: createdAt,
    revision: input.revision || null
  }, offlineQueue.enqueueMutation({
    entity_type: 'task',
    entity_id: id,
    operation: 'create',
    base_revision: null,
    base_values: {},
    patch: input,
    field_paths: Object.keys(input || {})
  }), 'create');
  mergeTaskIntoCache(storage, task);
  return task;
}

function updatePendingOfflineTask(storage, offlineQueue, id, patch) {
  const existing = cachedTaskById(storage, id);
  if (!existing) {
    throw new OfflineWriteBlockedError('offline_write_blocked: task is not in local cache; reconnect before editing it.');
  }
  const normalizedPatch = normalizeTaskPatchForOffline(existing, patch);
  const operation = operationForPatch(normalizedPatch);
  const fields = Object.keys(normalizedPatch).sort();
  const mutation = offlineQueue.enqueueMutation({
    entity_type: 'task',
    entity_id: id,
    operation,
    base_revision: existing.revision ?? null,
    base_values: pickBaseValues(existing, fields),
    patch: normalizedPatch,
    field_paths: fields
  });
  const task = markPending({
    ...existing,
    ...normalizedPatch,
    updated_at: mutation.created_at || nowISO()
  }, mutation, operation);
  mergeTaskIntoCache(storage, task);
  return task;
}

function queuedTaskMutationsWithCache(storage, offlineQueue) {
  return offlineQueue.listQueuedMutations()
    .filter(mutation => mutation.entity_type === 'task')
    .map(mutation => ({
      ...mutation,
      task: cachedTaskById(storage, mutation.entity_id)
    }));
}

function restoreTaskAfterDiscard(task, mutations) {
  if (!task) return null;
  if (mutations.some(mutation => mutation.operation === 'create')) return null;
  const basePatch = {};
  const ordered = [...mutations].sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
  for (const mutation of ordered) {
    const baseValues = mutation.base_values && typeof mutation.base_values === 'object' ? mutation.base_values : {};
    for (const [field, value] of Object.entries(baseValues)) {
      if (!Object.prototype.hasOwnProperty.call(basePatch, field)) basePatch[field] = value;
    }
  }
  return {
    ...clearPendingMarker(task),
    ...basePatch,
    updated_at: nowISO()
  };
}

export function createTaskRepository(apiClient, { storage = window.localStorage, isOnline = () => navigator.onLine, offlineQueue = createOfflineMutationQueue({ storage, enabled: true }) } = {}) {
  return {
    getOfflineMutationQueueState() {
      return offlineQueue.getState();
    },
    getCachedTasks() {
      return readCachedTasks(storage);
    },
    listPendingTaskMutations() {
      return queuedTaskMutationsWithCache(storage, offlineQueue);
    },
    discardPendingTaskMutations(entityId) {
      const mutations = queuedTaskMutationsWithCache(storage, offlineQueue)
        .filter(mutation => mutation.entity_id === entityId);
      const mutationIds = mutations.map(mutation => mutation.mutation_id);
      const result = offlineQueue.removeQueuedMutations(mutationIds);
      const task = cachedTaskById(storage, entityId);
      const restored = restoreTaskAfterDiscard(task, mutations);
      if (restored) mergeTaskIntoCache(storage, restored);
      else removeTaskFromCache(storage, entityId);
      return {
        ...result,
        task: restored,
        removed_task: !restored,
        entity_id: entityId
      };
    },
    async listTasks({ includeCompleted = true, search = '' } = {}) {
      if (!isOnline()) return readCachedTasks(storage);
      const params = new URLSearchParams();
      if (includeCompleted) params.set('include_completed', 'true');
      if (search) params.set('search', search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const data = await apiClient.request(`/tasks${suffix}`, { method: 'GET' });
      const tasks = data.tasks || [];
      writeCachedTasks(storage, tasks);
      return tasks;
    },
    async createTask(input) {
      if (!isOnline()) return createPendingOfflineTask(storage, offlineQueue, input || {});
      const data = await apiClient.request('/tasks', { method: 'POST', body: input });
      mergeTaskIntoCache(storage, data.task);
      return data.task;
    },
    async updateTask(id, patch) {
      if (!isOnline()) return updatePendingOfflineTask(storage, offlineQueue, id, patch || {});
      const data = await apiClient.request(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      mergeTaskIntoCache(storage, data.task);
      return data.task;
    },
    async completeTask(id) {
      return this.updateTask(id, {
        progress: 'completed',
        completed_at: new Date().toISOString()
      });
    },
    async reopenTask(id) {
      return this.updateTask(id, {
        progress: 'not_started',
        completed_at: null
      });
    },
    async deleteTask(id) {
      assertOnline(isOnline);
      const result = await apiClient.request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      removeTaskFromCache(storage, id);
      return result;
    }
  };
}
