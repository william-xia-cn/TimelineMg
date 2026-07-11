import { HttpError } from './http';

const MAX_MUTATION_BATCH_SIZE = 50;
const PRIVATE_KEY_PATTERN = /token|secret|cookie|password|private_path|local_path/i;
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
const TASK_REPLAY_ALLOWED_OPERATIONS = new Set([
  'create',
  'update',
  'complete',
  'reopen',
  'delete'
]);
const TASK_USER_EDITABLE_FIELDS = new Set([
  'title',
  'notes',
  'description',
  'checklist',
  'labels',
  'plan_id',
  'bucket_id',
  'start_date',
  'due_date',
  'schedule_time',
  'duration',
  'recurrence_series_id',
  'recurrence_index',
  'recurrence_count',
  'recurrence_frequency',
  'recurrence_anchor_start_date',
  'recurrence_anchor_due_date',
  'priority',
  'status',
  'progress',
  'completed_at'
]);
const MANAGEBAC_LOCAL_EXECUTION_FIELDS = new Set([
  'progress',
  'status',
  'completed_at',
  'start_date',
  'priority',
  'notes',
  'description',
  'schedule_time',
  'duration',
  'checklist',
  'labels',
  'bucket_id'
]);
const MANAGEBAC_SOURCE_CONTROLLED_FIELDS = new Set([
  'title',
  'due_date',
  'deadline',
  'plan_id',
  'subject',
  'subject_in_matrixview',
  'source',
  'source_type',
  'source_uid',
  'source_url',
  'source_updated_at',
  'managebac_subject',
  'readonly',
  'recurrence_series_id',
  'recurrence_index',
  'recurrence_count',
  'recurrence_frequency',
  'recurrence_anchor_start_date',
  'recurrence_anchor_due_date'
]);

type OfflineMutationInput = Record<string, unknown>;
export type ValidatedMutation = {
  mutation_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  patch: Record<string, unknown>;
  base_values: Record<string, unknown>;
  cloud_values: Record<string, unknown> | null;
  field_paths: string[];
};

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

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => String(value).trim())));
}

function fieldPathsFor(input: OfflineMutationInput, operation: string, patch: Record<string, unknown>): string[] {
  const provided = Array.isArray(input.field_paths) ? uniqueStrings(input.field_paths) : [];
  if (provided.length) return provided;
  if (operation === 'complete' || operation === 'reopen') return ['progress', 'completed_at'];
  return Object.keys(patch).sort();
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function isManageBacSourceTask(values: Record<string, unknown> | null): boolean {
  if (!values) return false;
  return values.source === 'managebac'
    || values.source_type === 'managebac'
    || values.readonly === true
    || values.readonly === 1
    || typeof values.managebac_subject === 'string';
}

function evaluateFieldConflict(
  fieldPaths: string[],
  baseValues: Record<string, unknown>,
  cloudValues: Record<string, unknown> | null
): Record<string, unknown> {
  if (!fieldPaths.length) {
    return {
      mode: 'field_level_preview',
      status: 'no_field_paths',
      changed_cloud_fields: [],
      conflicting_fields: []
    };
  }
  if (!cloudValues) {
    return {
      mode: 'field_level_preview',
      status: 'cloud_values_required',
      changed_cloud_fields: [],
      conflicting_fields: []
    };
  }
  const changedCloudFields = fieldPaths.filter(field => !valuesEqual(baseValues[field], cloudValues[field]));
  return {
    mode: 'field_level_preview',
    status: changedCloudFields.length ? 'would_conflict' : 'would_auto_merge',
    changed_cloud_fields: changedCloudFields,
    conflicting_fields: changedCloudFields
  };
}

export function evaluateTaskReplayGate(mutation: ValidatedMutation): Record<string, unknown> {
  if (mutation.entity_type !== 'task') {
    return {
      status: 'not_in_task_only_gate',
      eligible_when_enabled: false,
      reason: 'entity_replay_not_in_task_gate',
      allowed_entity_type: 'task'
    };
  }
  const unsupportedFields = mutation.field_paths.filter(field => !TASK_USER_EDITABLE_FIELDS.has(field));
  const managebac = isManageBacSourceTask(mutation.base_values) || isManageBacSourceTask(mutation.cloud_values);
  const managebacBlockedFields = managebac
    ? mutation.field_paths.filter(field => MANAGEBAC_SOURCE_CONTROLLED_FIELDS.has(field) || !MANAGEBAC_LOCAL_EXECUTION_FIELDS.has(field))
    : [];
  const operationBlocked = !TASK_REPLAY_ALLOWED_OPERATIONS.has(mutation.operation)
    || (managebac && mutation.operation === 'delete');
  if (unsupportedFields.length || managebacBlockedFields.length || operationBlocked) {
    return {
      status: 'blocked_by_task_replay_gate',
      eligible_when_enabled: false,
      reason: operationBlocked ? 'task_operation_not_allowed' : 'task_fields_not_allowed',
      is_managebac_source: managebac,
      unsupported_fields: unsupportedFields,
      source_controlled_fields: managebacBlockedFields,
      field_conflict_check: evaluateFieldConflict(mutation.field_paths, mutation.base_values, mutation.cloud_values)
    };
  }
  return {
    status: 'task_replay_gate_ready_but_disabled',
    eligible_when_enabled: true,
    is_managebac_source: managebac,
    allowed_scope: managebac ? 'managebac_local_execution_fields' : 'task_user_editable_fields',
    field_paths: mutation.field_paths,
    field_conflict_check: evaluateFieldConflict(mutation.field_paths, mutation.base_values, mutation.cloud_values)
  };
}

function validateMutation(input: unknown): ValidatedMutation {
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
  const cloudValues = isPlainObject(input.cloud_values) ? input.cloud_values : null;
  assertNoPrivateData(patch);
  assertNoPrivateData(baseValues);
  assertNoPrivateData(cloudValues);
  const fieldPaths = fieldPathsFor(input, operation, patch);
  return {
    mutation_id: mutationId,
    entity_type: entityType,
    entity_id: entityId,
    operation,
    patch,
    base_values: baseValues,
    cloud_values: cloudValues,
    field_paths: fieldPaths
  };
}

export function validateOfflineMutationBatch(body: unknown): ValidatedMutation[] {
  if (!isPlainObject(body) || !Array.isArray(body.mutations)) {
    throw new HttpError(400, 'invalid_offline_mutation_batch', 'Offline mutation replay requires a mutations array');
  }
  if (body.mutations.length < 1) {
    throw new HttpError(400, 'empty_offline_mutation_batch', 'Offline mutation replay requires at least one mutation');
  }
  if (body.mutations.length > MAX_MUTATION_BATCH_SIZE) {
    throw new HttpError(400, 'offline_mutation_batch_too_large', 'Offline mutation replay batch is too large');
  }
  return body.mutations.map(validateMutation);
}

export function validateOfflineMutationReplay(body: unknown): Record<string, unknown> {
  const mutations = validateOfflineMutationBatch(body);
  return {
    replay_status: 'disabled_v1',
    activation_gate: 'task_only_replay_defined_but_disabled_v1',
    accepted: false,
    validated_count: mutations.length,
    results: mutations.map(mutation => {
      const taskGate = evaluateTaskReplayGate(mutation);
      const gateReady = taskGate.status === 'task_replay_gate_ready_but_disabled';
      return {
        mutation_id: mutation.mutation_id,
        entity_type: mutation.entity_type,
        entity_id: mutation.entity_id,
        operation: mutation.operation,
        status: 'rejected',
        reason: gateReady ? 'offline_replay_disabled_v1' : taskGate.reason,
        task_replay_gate: taskGate
      };
    })
  };
}
