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

export async function buildSyncMutationDryRun(
  env: Env,
  accountId: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const replay = attachTaskReplayTransactionSkeleton(validateOfflineMutationReplay(body));
  const results = Array.isArray(replay.results) ? replay.results.filter(isRecord) : [];
  let storedOutcomeCount = 0;
  let storedConflictCount = 0;
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
    if (storedOutcome) storedOutcomeCount++;
    if (storedConflict) storedConflictCount++;
    joinedResults.push({
      ...result,
      stored_outcome: storedOutcome,
      stored_conflict: storedConflict,
      dry_run: {
        mode: 'internal_disabled_v1',
        writes_enabled: false,
        applies_user_data: false,
        would_apply: false,
        would_create_conflict: false,
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
      stored_conflict_count: storedConflictCount
    }
  };
}
