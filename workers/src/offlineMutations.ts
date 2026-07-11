import { HttpError } from './http';

const MAX_MUTATION_BATCH_SIZE = 50;
const PRIVATE_KEY_PATTERN = /token|secret|cookie|password|private_path/i;
const ALLOWED_ENTITY_TYPES = new Set([
  'task',
  'calendar_event',
  'container',
  'plan',
  'bucket',
  'label',
  'product_setting'
]);
const ALLOWED_OPERATIONS = new Set([
  'create',
  'update',
  'delete',
  'complete',
  'reopen'
]);

type OfflineMutationInput = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoPrivateData(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach(assertNoPrivateData);
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    if (PRIVATE_KEY_PATTERN.test(key)) {
      throw new HttpError(400, 'offline_mutation_private_data', 'Offline mutation contains private fields');
    }
    assertNoPrivateData(nestedValue);
  }
}

function requireString(input: OfflineMutationInput, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'invalid_offline_mutation', `Offline mutation requires ${key}`);
  }
  return value.trim();
}

function validateMutation(input: unknown): Record<string, unknown> {
  if (!isPlainObject(input)) {
    throw new HttpError(400, 'invalid_offline_mutation', 'Offline mutation must be an object');
  }
  const mutationId = requireString(input, 'mutation_id');
  const entityType = requireString(input, 'entity_type');
  const entityId = requireString(input, 'entity_id');
  const operation = requireString(input, 'operation');
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    throw new HttpError(400, 'invalid_offline_mutation_entity', 'Offline mutation entity type is not supported');
  }
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw new HttpError(400, 'invalid_offline_mutation_operation', 'Offline mutation operation is not supported');
  }
  const patch = isPlainObject(input.patch) ? input.patch : {};
  const baseValues = isPlainObject(input.base_values) ? input.base_values : {};
  assertNoPrivateData(patch);
  assertNoPrivateData(baseValues);
  return {
    mutation_id: mutationId,
    entity_type: entityType,
    entity_id: entityId,
    operation
  };
}

export function validateOfflineMutationReplay(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body) || !Array.isArray(body.mutations)) {
    throw new HttpError(400, 'invalid_offline_mutation_batch', 'Offline mutation replay requires a mutations array');
  }
  if (body.mutations.length < 1) {
    throw new HttpError(400, 'empty_offline_mutation_batch', 'Offline mutation replay requires at least one mutation');
  }
  if (body.mutations.length > MAX_MUTATION_BATCH_SIZE) {
    throw new HttpError(400, 'offline_mutation_batch_too_large', 'Offline mutation replay batch is too large');
  }
  const mutations = body.mutations.map(validateMutation);
  return {
    replay_status: 'disabled_v1',
    accepted: false,
    validated_count: mutations.length,
    results: mutations.map(mutation => ({
      mutation_id: mutation.mutation_id,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      operation: mutation.operation,
      status: 'rejected',
      reason: 'offline_replay_disabled_v1'
    }))
  };
}
