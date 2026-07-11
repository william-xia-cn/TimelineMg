const OFFLINE_MUTATION_QUEUE_KEY = 'timewhere.web.offline.mutations.v1';
const QUEUE_SCHEMA = 'timewhere-offline-mutation-queue-v1';
const PRIVATE_KEY_PATTERN = /token|secret|cookie|password|client_secret|refresh_token|access_token|private_path/i;

export class OfflineMutationQueueDisabledError extends Error {
  constructor(message = 'Offline mutation queue is disabled') {
    super(message);
    this.code = 'offline_mutation_queue_disabled';
  }
}

export class OfflineMutationQueuePrivateDataError extends Error {
  constructor(message = 'Offline mutation queue payload contains private data') {
    super(message);
    this.code = 'offline_mutation_private_data';
  }
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

function defaultId() {
  if (globalThis.crypto?.randomUUID) return `mut_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
  return `mut_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function readQueue(storage) {
  if (!canUseStorage(storage)) return { schema: QUEUE_SCHEMA, mutations: [] };
  try {
    const payload = JSON.parse(storage.getItem(OFFLINE_MUTATION_QUEUE_KEY) || 'null');
    return {
      schema: QUEUE_SCHEMA,
      updated_at: typeof payload?.updated_at === 'string' ? payload.updated_at : undefined,
      mutations: Array.isArray(payload?.mutations) ? payload.mutations : []
    };
  } catch {
    return { schema: QUEUE_SCHEMA, mutations: [] };
  }
}

function writeQueue(storage, queue) {
  if (!canUseStorage(storage)) return;
  storage.setItem(OFFLINE_MUTATION_QUEUE_KEY, JSON.stringify({
    schema: QUEUE_SCHEMA,
    updated_at: queue.updated_at,
    mutations: Array.isArray(queue.mutations) ? queue.mutations : []
  }));
}

function assertNoPrivateData(value, path = 'payload') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateData(item, `${path}.${index}`));
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (PRIVATE_KEY_PATTERN.test(key)) {
      throw new OfflineMutationQueuePrivateDataError(`Private field is not allowed in offline mutation: ${nextPath}`);
    }
    assertNoPrivateData(nestedValue, nextPath);
  }
}

function normalizeMutation(input, now, createId) {
  const patch = input.patch && typeof input.patch === 'object' ? input.patch : {};
  const baseValues = input.base_values && typeof input.base_values === 'object' ? input.base_values : {};
  assertNoPrivateData(patch, 'patch');
  assertNoPrivateData(baseValues, 'base_values');
  return {
    mutation_id: typeof input.mutation_id === 'string' && input.mutation_id ? input.mutation_id : createId(),
    account_id: input.account_id || null,
    device_id: input.device_id || null,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    operation: input.operation,
    base_revision: input.base_revision ?? null,
    base_values: baseValues,
    patch,
    field_paths: Array.isArray(input.field_paths) ? input.field_paths : Object.keys(patch),
    created_at: now(),
    attempt_count: 0,
    status: 'queued'
  };
}

export function createOfflineMutationQueue({
  storage = window.localStorage,
  enabled = false,
  now = () => new Date().toISOString(),
  createId = defaultId
} = {}) {
  return {
    isEnabled() {
      return enabled === true;
    },
    getState() {
      const queue = readQueue(storage);
      return {
        schema: QUEUE_SCHEMA,
        enabled: enabled === true,
        queued_count: queue.mutations.filter(item => item.status === 'queued').length,
        updated_at: queue.updated_at || null
      };
    },
    listQueuedMutations() {
      return readQueue(storage).mutations.filter(item => item.status === 'queued');
    },
    enqueueMutation(input) {
      if (enabled !== true) {
        throw new OfflineMutationQueueDisabledError('offline_mutation_queue_disabled: offline writes are still blocked in WebDev v1.');
      }
      const mutation = normalizeMutation(input || {}, now, createId);
      const queue = readQueue(storage);
      const nextQueue = {
        schema: QUEUE_SCHEMA,
        updated_at: now(),
        mutations: [...queue.mutations, mutation]
      };
      writeQueue(storage, nextQueue);
      return mutation;
    },
    clearQueue() {
      writeQueue(storage, { schema: QUEUE_SCHEMA, updated_at: now(), mutations: [] });
    }
  };
}

export const OFFLINE_MUTATION_QUEUE_SCHEMA = QUEUE_SCHEMA;
