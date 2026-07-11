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

export function createTaskRepository(apiClient, { storage = window.localStorage, isOnline = () => navigator.onLine, offlineQueue = createOfflineMutationQueue({ storage }) } = {}) {
  return {
    getOfflineMutationQueueState() {
      return offlineQueue.getState();
    },
    getCachedTasks() {
      return readCachedTasks(storage);
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
      assertOnline(isOnline);
      const data = await apiClient.request('/tasks', { method: 'POST', body: input });
      mergeTaskIntoCache(storage, data.task);
      return data.task;
    },
    async updateTask(id, patch) {
      assertOnline(isOnline);
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
