import { createOfflineMutationQueue } from './offlineMutationQueue.js';

const STRUCTURE_CACHE_KEY = 'timewhere.web.structure.cache.v1';

export class OfflineStructureWriteBlockedError extends Error {
  constructor(message = 'Editing structure requires a network connection') {
    super(message);
    this.code = 'offline_write_blocked';
  }
}

function emptyStructure() {
  return { plans: [], buckets: [], labels: [], containers: [] };
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

function readCache(storage) {
  if (!canUseStorage(storage)) return emptyStructure();
  try {
    const payload = JSON.parse(storage.getItem(STRUCTURE_CACHE_KEY) || 'null');
    return {
      plans: Array.isArray(payload?.plans) ? payload.plans : [],
      buckets: Array.isArray(payload?.buckets) ? payload.buckets : [],
      labels: Array.isArray(payload?.labels) ? payload.labels : [],
      containers: Array.isArray(payload?.containers) ? payload.containers : []
    };
  } catch {
    return emptyStructure();
  }
}

function writeCache(storage, next) {
  if (!canUseStorage(storage)) return;
  storage.setItem(STRUCTURE_CACHE_KEY, JSON.stringify({
    schema: 'timewhere-structure-cache-v1',
    cached_at: new Date().toISOString(),
    plans: Array.isArray(next.plans) ? next.plans : [],
    buckets: Array.isArray(next.buckets) ? next.buckets : [],
    labels: Array.isArray(next.labels) ? next.labels : [],
    containers: Array.isArray(next.containers) ? next.containers : []
  }));
}

function assertOnline(isOnline) {
  if (!isOnline()) throw new OfflineStructureWriteBlockedError('offline_write_blocked: reconnect before editing structure data.');
}

function mergeById(items, item) {
  if (!item?.id) return items;
  const next = [...items];
  const index = next.findIndex(existing => existing.id === item.id);
  if (index >= 0) next[index] = item;
  else next.unshift(item);
  return next;
}

function removeById(items, id) {
  return items.filter(item => item.id !== id);
}

export function createStructureRepository(apiClient, { storage = window.localStorage, isOnline = () => navigator.onLine, offlineQueue = createOfflineMutationQueue({ storage }) } = {}) {
  return {
    getOfflineMutationQueueState() {
      return offlineQueue.getState();
    },
    getCachedStructure() {
      return readCache(storage);
    },
    async listStructure({ search = '' } = {}) {
      if (!isOnline()) return readCache(storage);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const [planData, bucketData, labelData, containerData] = await Promise.all([
        apiClient.request(`/plans${suffix}`, { method: 'GET' }),
        apiClient.request(`/buckets${suffix}`, { method: 'GET' }),
        apiClient.request(`/labels${suffix}`, { method: 'GET' }),
        apiClient.request(`/containers${suffix}`, { method: 'GET' })
      ]);
      const structure = {
        plans: planData.plans || [],
        buckets: bucketData.buckets || [],
        labels: labelData.labels || [],
        containers: containerData.containers || []
      };
      writeCache(storage, structure);
      return structure;
    },
    async createPlan(input) {
      assertOnline(isOnline);
      const data = await apiClient.request('/plans', { method: 'POST', body: input });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, plans: mergeById(cache.plans, data.plan) });
      return data.plan;
    },
    async updatePlan(id, patch) {
      assertOnline(isOnline);
      const data = await apiClient.request(`/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, plans: mergeById(cache.plans, data.plan) });
      return data.plan;
    },
    async deletePlan(id) {
      assertOnline(isOnline);
      const result = await apiClient.request(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, plans: removeById(cache.plans, id) });
      return result;
    },
    async createBucket(input) {
      assertOnline(isOnline);
      const data = await apiClient.request('/buckets', { method: 'POST', body: input });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, buckets: mergeById(cache.buckets, data.bucket) });
      return data.bucket;
    },
    async updateBucket(id, patch) {
      assertOnline(isOnline);
      const data = await apiClient.request(`/buckets/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, buckets: mergeById(cache.buckets, data.bucket) });
      return data.bucket;
    },
    async deleteBucket(id) {
      assertOnline(isOnline);
      const result = await apiClient.request(`/buckets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, buckets: removeById(cache.buckets, id) });
      return result;
    },
    async createLabel(input) {
      assertOnline(isOnline);
      const data = await apiClient.request('/labels', { method: 'POST', body: input });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, labels: mergeById(cache.labels, data.label) });
      return data.label;
    },
    async updateLabel(id, patch) {
      assertOnline(isOnline);
      const data = await apiClient.request(`/labels/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, labels: mergeById(cache.labels, data.label) });
      return data.label;
    },
    async deleteLabel(id) {
      assertOnline(isOnline);
      const result = await apiClient.request(`/labels/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, labels: removeById(cache.labels, id) });
      return result;
    },
    async createContainer(input) {
      assertOnline(isOnline);
      const data = await apiClient.request('/containers', { method: 'POST', body: input });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, containers: mergeById(cache.containers, data.container) });
      return data.container;
    },
    async updateContainer(id, patch) {
      assertOnline(isOnline);
      const data = await apiClient.request(`/containers/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, containers: mergeById(cache.containers, data.container) });
      return data.container;
    },
    async deleteContainer(id) {
      assertOnline(isOnline);
      const result = await apiClient.request(`/containers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const cache = readCache(storage);
      writeCache(storage, { ...cache, containers: removeById(cache.containers, id) });
      return result;
    }
  };
}
