import { validateOfflineMutationReplay } from './offlineMutations';
import { findSyncConflictByMutation } from './syncConflicts';
import { findSyncMutationOutcome } from './syncMutationOutcomes';
import { attachTaskReplayTransactionSkeleton } from './taskReplayTransaction';
import type { Env } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function transactionBranch(result: Record<string, unknown>): string {
  const skeleton = isRecord(result.transaction_skeleton) ? result.transaction_skeleton : {};
  return stringValue(skeleton.branch);
}

function mutationInputsById(body: unknown): Map<string, Record<string, unknown>> {
  const mutations = isRecord(body) && Array.isArray(body.mutations) ? body.mutations : [];
  const mapped = new Map<string, Record<string, unknown>>();
  for (const mutation of mutations) {
    if (!isRecord(mutation)) continue;
    const mutationId = stringValue(mutation.mutation_id);
    if (mutationId) mapped.set(mutationId, mutation);
  }
  return mapped;
}

function pickFields(values: unknown, fields: string[]): Record<string, unknown> {
  const source = isRecord(values) ? values : {};
  return Object.fromEntries(fields.map(field => [field, source[field] ?? null]));
}

function conflictFields(result: Record<string, unknown>): string[] {
  const gate = isRecord(result.task_replay_gate) ? result.task_replay_gate : {};
  const check = isRecord(gate.field_conflict_check) ? gate.field_conflict_check : {};
  return Array.isArray(check.conflicting_fields)
    ? check.conflicting_fields.filter(field => typeof field === 'string' && field.trim()).map(String)
    : [];
}

function buildConflictPreview(
  result: Record<string, unknown>,
  mutation: Record<string, unknown> | undefined,
  branch: string
): Record<string, unknown> | null {
  const fields = conflictFields(result);
  if (branch !== 'conflict_candidate' || !mutation || !fields.length) return null;
  return {
    mode: 'internal_disabled_v1',
    would_persist: false,
    record: {
      id: null,
      mutation_id: result.mutation_id,
      entity_type: result.entity_type,
      entity_id: result.entity_id,
      reason: 'field_conflict',
      status: 'open',
      created_at: null,
      resolved_at: null,
      local: pickFields(mutation.patch, fields),
      cloud: pickFields(mutation.cloud_values, fields)
    }
  };
}

export async function buildSyncMutationDryRun(
  env: Env,
  accountId: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const replay = attachTaskReplayTransactionSkeleton(validateOfflineMutationReplay(body));
  const mutationInputs = mutationInputsById(body);
  const results = Array.isArray(replay.results) ? replay.results.filter(isRecord) : [];
  let storedOutcomeCount = 0;
  let storedConflictCount = 0;
  let conflictPreviewCount = 0;
  let applyCandidateCount = 0;
  let conflictCandidateCount = 0;
  let rejectCandidateCount = 0;

  const joinedResults = [];
  for (const result of results) {
    const mutationId = stringValue(result.mutation_id);
    const branch = transactionBranch(result);
    if (branch === 'apply_candidate') applyCandidateCount++;
    if (branch === 'conflict_candidate') conflictCandidateCount++;
    if (branch === 'reject_candidate' || branch === 'not_in_task_gate') rejectCandidateCount++;
    const storedOutcome = mutationId ? await findSyncMutationOutcome(env, accountId, mutationId) : null;
    const storedConflict = mutationId ? await findSyncConflictByMutation(env, accountId, mutationId) : null;
    const conflictPreview = buildConflictPreview(result, mutationInputs.get(mutationId), branch);
    if (storedOutcome) storedOutcomeCount++;
    if (storedConflict) storedConflictCount++;
    if (conflictPreview) conflictPreviewCount++;
    joinedResults.push({
      ...result,
      stored_outcome: storedOutcome,
      stored_conflict: storedConflict,
      conflict_preview: conflictPreview,
      dry_run: {
        mode: 'internal_disabled_v1',
        writes_enabled: false,
        applies_user_data: false,
        would_apply: false,
        would_create_conflict: Boolean(conflictPreview),
        branch
      }
    });
  }

  return {
    mode: 'internal_disabled_v1',
    accepted: false,
    writes_enabled: false,
    applies_user_data: false,
    replay: {
      ...replay,
      results: joinedResults
    },
    summary: {
      validated_count: joinedResults.length,
      apply_candidate_count: applyCandidateCount,
      conflict_candidate_count: conflictCandidateCount,
      reject_candidate_count: rejectCandidateCount,
      stored_outcome_count: storedOutcomeCount,
      stored_conflict_count: storedConflictCount,
      conflict_preview_count: conflictPreviewCount
    }
  };
}
