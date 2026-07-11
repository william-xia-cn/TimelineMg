import { buildSyncMutationDryRun } from './syncMutationDryRun';
import type { Env } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function countReasons(results: Record<string, unknown>[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  for (const result of results) {
    const reason = stringValue(result.reason) || 'unknown';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

function previewRows(results: Record<string, unknown>[]): Record<string, unknown>[] {
  return results.slice(0, 10).map(result => {
    const dryRun = isRecord(result.dry_run) ? result.dry_run : {};
    return {
      mutation_id: result.mutation_id,
      entity_type: result.entity_type,
      entity_id: result.entity_id,
      operation: result.operation,
      branch: dryRun.branch || null,
      reason: result.reason || null,
      would_apply: dryRun.would_apply === true,
      would_create_conflict: dryRun.would_create_conflict === true
    };
  });
}

export async function buildSyncReplayReadinessSummary(
  env: Env,
  accountId: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const dryRun = await buildSyncMutationDryRun(env, accountId, body);
  const replay = isRecord(dryRun.replay) ? dryRun.replay : {};
  const results = Array.isArray(replay.results) ? replay.results.filter(isRecord) : [];
  const summary = isRecord(dryRun.summary) ? dryRun.summary : {};
  const blockedReasons = countReasons(results);

  return {
    mode: 'internal_disabled_v1',
    replay_enablement: 'not_approved',
    writes_enabled: false,
    applies_user_data: false,
    summary: {
      ...summary,
      blocked_reason_count: blockedReasons.length
    },
    readiness: {
      state: 'blocked_until_product_owner_approval',
      can_enable_replay: false,
      candidate_counts: {
        apply: summary.apply_candidate_count || 0,
        conflict: summary.conflict_candidate_count || 0,
        reject: summary.reject_candidate_count || 0
      },
      preview_counts: {
        apply_plan: summary.apply_plan_preview_count || 0,
        conflict_record: summary.conflict_preview_count || 0,
        stored_outcome: summary.stored_outcome_count || 0,
        stored_conflict: summary.stored_conflict_count || 0
      },
      blocked_reasons: blockedReasons,
      sample_results: previewRows(results)
    },
    recommendations: [
      'Keep offline replay disabled until Product Owner approval.',
      'Review apply candidates, conflict previews, and rejected reasons before enabling any write path.',
      'Resolve blocked reasons and conflict handling policy before turning on Task replay.'
    ]
  };
}
