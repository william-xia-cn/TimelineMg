import { newId, nowISO } from './crypto';
import { HttpError } from './http';
import { sanitizeJsonValue } from './schema';
import { recordSyncChange } from './sync';
import { createSyncConflictRecord } from './syncConflicts';
import { findSyncMutationOutcome } from './syncMutationOutcomes';
import { buildTaskReplayTransactionSkeleton } from './taskReplayTransaction';
import { evaluateTaskReplayGate, validateOfflineMutationBatch, type ValidatedMutation } from './offlineMutations';
import { deleteTask, getTask, updateTask } from './repositories';
import type { Env } from './types';

type ReplayResult = Record<string, unknown>;

type ApplySummary = {
  applied_count: number;
  conflict_count: number;
  rejected_count: number;
  idempotent_count: number;
};

const REPLAY_STATUS = 'test_only_task_replay_v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value.trim() || null : String(value);
}

function normalizeDuration(value: unknown): number {
  const numberValue = Number(value ?? 45);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 45;
  return Math.min(24 * 60, Math.round(numberValue));
}

function normalizeProgress(value: unknown): string {
  const progress = optionalString(value) || 'not_started';
  return ['not_started', 'in_progress', 'blocked', 'completed'].includes(progress) ? progress : 'not_started';
}

function normalizePriority(value: unknown): string {
  const priority = optionalString(value) || 'medium';
  return ['urgent', 'important', 'medium', 'low', 'P1', 'P2', 'P3', 'P4'].includes(priority) ? priority : 'medium';
}

function normalizeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return Math.max(1, Math.round(Number(value) || 1));
}

function pickFields(values: unknown, fields: string[]): Record<string, unknown> {
  const source = isRecord(values) ? values : {};
  return Object.fromEntries(fields.map(field => [field, source[field] ?? null]));
}

function conflictFieldsFromGate(gate: Record<string, unknown>): string[] {
  const check = isRecord(gate.field_conflict_check) ? gate.field_conflict_check : {};
  return Array.isArray(check.conflicting_fields)
    ? check.conflicting_fields.filter(field => typeof field === 'string' && field.trim()).map(String)
    : [];
}

function withTransaction(result: ReplayResult): ReplayResult {
  const skeleton = buildTaskReplayTransactionSkeleton(result);
  return {
    ...result,
    transaction_skeleton: {
      ...skeleton,
      mode: REPLAY_STATUS,
      enabled: true,
      writes_enabled: true,
      applies_user_data: true
    }
  };
}

async function findTask(env: Env, accountId: string, id: string): Promise<Record<string, unknown> | null> {
  try {
    return await getTask(env, accountId, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

function mutationWithCloudValues(mutation: ValidatedMutation, cloudValues: Record<string, unknown> | null): ValidatedMutation {
  return {
    ...mutation,
    cloud_values: cloudValues
  };
}

function appliedIdempotentResult(mutation: ValidatedMutation): ReplayResult {
  return withTransaction({
    mutation_id: mutation.mutation_id,
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    operation: mutation.operation,
    status: 'applied',
    reason: 'idempotent_replay_already_applied',
    idempotent: true,
    task_replay_gate: {
      status: 'already_applied',
      eligible_when_enabled: true
    }
  });
}

function rejectedResult(mutation: ValidatedMutation, reason: string, taskGate: Record<string, unknown>): ReplayResult {
  return withTransaction({
    mutation_id: mutation.mutation_id,
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    operation: mutation.operation,
    status: 'rejected',
    reason,
    task_replay_gate: taskGate
  });
}

async function createTaskWithReplayId(env: Env, accountId: string, mutation: ValidatedMutation): Promise<Record<string, unknown>> {
  const patch = mutation.patch;
  const title = stringValue(patch.title);
  if (!title) throw new HttpError(400, 'missing_task_title', 'Task title is required');
  const now = nowISO();
  const progress = normalizeProgress(patch.progress);
  await env.DB.prepare(
    `INSERT INTO tasks (
      id, account_id, plan_id, bucket_id, legacy_id, title, notes, description, checklist_json, labels_json,
      start_date, due_date, schedule_time, duration, recurrence_series_id, recurrence_index, recurrence_count,
      recurrence_frequency, recurrence_anchor_start_date, recurrence_anchor_due_date, priority, progress, completed_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    mutation.entity_id,
    accountId,
    patch.plan_id || null,
    patch.bucket_id || null,
    patch.legacy_id || null,
    title,
    optionalString(patch.notes),
    optionalString(patch.description),
    sanitizeJsonValue(Array.isArray(patch.checklist) ? patch.checklist : []),
    sanitizeJsonValue(Array.isArray(patch.labels) ? patch.labels : []),
    optionalString(patch.start_date),
    optionalString(patch.due_date),
    optionalString(patch.schedule_time),
    normalizeDuration(patch.duration),
    optionalString(patch.recurrence_series_id),
    normalizeInteger(patch.recurrence_index),
    normalizeInteger(patch.recurrence_count),
    optionalString(patch.recurrence_frequency),
    optionalString(patch.recurrence_anchor_start_date),
    optionalString(patch.recurrence_anchor_due_date),
    normalizePriority(patch.priority),
    progress,
    progress === 'completed' ? optionalString(patch.completed_at) || now : optionalString(patch.completed_at),
    now,
    now
  ).run();
  await recordSyncChange(env, accountId, 'task', mutation.entity_id, 'created', 1);
  return await getTask(env, accountId, mutation.entity_id);
}

async function applyMutation(env: Env, accountId: string, mutation: ValidatedMutation): Promise<Record<string, unknown> | null> {
  if (mutation.operation === 'create') return await createTaskWithReplayId(env, accountId, mutation);
  if (mutation.operation === 'delete') {
    await deleteTask(env, accountId, mutation.entity_id);
    return null;
  }
  if (mutation.operation === 'complete') {
    return await updateTask(env, accountId, mutation.entity_id, {
      ...mutation.patch,
      progress: 'completed',
      completed_at: mutation.patch.completed_at || nowISO()
    });
  }
  if (mutation.operation === 'reopen') {
    return await updateTask(env, accountId, mutation.entity_id, {
      ...mutation.patch,
      progress: 'not_started',
      completed_at: null
    });
  }
  return await updateTask(env, accountId, mutation.entity_id, mutation.patch);
}

async function replayOne(env: Env, accountId: string, mutation: ValidatedMutation): Promise<ReplayResult> {
  const previous = await findSyncMutationOutcome(env, accountId, mutation.mutation_id);
  if (previous?.outcome_status === 'applied') return appliedIdempotentResult(mutation);
  if (mutation.entity_type !== 'task') {
    return rejectedResult(mutation, 'entity_replay_not_in_task_gate', evaluateTaskReplayGate(mutation));
  }

  const existingTask = await findTask(env, accountId, mutation.entity_id);
  if (mutation.operation === 'create' && existingTask) {
    return rejectedResult(
      mutationWithCloudValues(mutation, existingTask),
      'task_create_entity_exists',
      evaluateTaskReplayGate(mutationWithCloudValues(mutation, existingTask))
    );
  }
  if (mutation.operation !== 'create' && !existingTask) {
    return rejectedResult(mutation, 'task_not_found', evaluateTaskReplayGate(mutation));
  }

  const gateMutation = mutation.operation === 'create'
    ? mutationWithCloudValues(mutation, mutation.base_values)
    : mutationWithCloudValues(mutation, existingTask);
  const taskGate = evaluateTaskReplayGate(gateMutation);
  if (taskGate.status !== 'task_replay_gate_ready_but_disabled') {
    return rejectedResult(gateMutation, stringValue(taskGate.reason) || 'task_replay_gate_blocked', taskGate);
  }

  const conflictingFields = conflictFieldsFromGate(taskGate);
  if (conflictingFields.length) {
    const conflict = await createSyncConflictRecord(env, accountId, {
      mutation_id: mutation.mutation_id,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      reason: 'field_conflict',
      local: pickFields(mutation.patch, conflictingFields),
      cloud: pickFields(existingTask, conflictingFields),
      status: 'open'
    });
    return withTransaction({
      mutation_id: mutation.mutation_id,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      operation: mutation.operation,
      status: 'conflict',
      reason: 'field_conflict',
      conflict_id: conflict.id,
      task_replay_gate: taskGate
    });
  }

  const appliedTask = await applyMutation(env, accountId, mutation);
  return withTransaction({
    mutation_id: mutation.mutation_id,
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    operation: mutation.operation,
    status: 'applied',
    reason: 'task_replay_applied',
    task_replay_gate: taskGate,
    applied_revision: isRecord(appliedTask) ? appliedTask.revision ?? null : null
  });
}

export async function applyTaskReplayTestOnly(
  env: Env,
  accountId: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const mutations = validateOfflineMutationBatch(body);
  const summary: ApplySummary = {
    applied_count: 0,
    conflict_count: 0,
    rejected_count: 0,
    idempotent_count: 0
  };
  const results: ReplayResult[] = [];
  for (const mutation of mutations) {
    const result = await replayOne(env, accountId, mutation);
    if (result.status === 'applied') summary.applied_count++;
    if (result.status === 'conflict') summary.conflict_count++;
    if (result.status === 'rejected') summary.rejected_count++;
    if (result.idempotent === true) summary.idempotent_count++;
    results.push(result);
  }
  return {
    replay_status: REPLAY_STATUS,
    activation_gate: 'task_only_replay_test_only_v1',
    accepted: true,
    writes_enabled: true,
    applies_user_data: true,
    test_only: true,
    validated_count: mutations.length,
    transaction_skeleton: REPLAY_STATUS,
    summary,
    results
  };
}
