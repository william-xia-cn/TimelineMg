import { buildSyncReplayReadinessSummary } from './syncReplayReadiness';
import type { Env } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function bool(value: unknown): boolean {
  return value === true;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim()).map(String)
    : [];
}

function gate(id: string, label: string, passed: boolean, evidence: Record<string, unknown>, missing: string[] = []): Record<string, unknown> {
  return {
    id,
    label,
    passed,
    missing,
    evidence
  };
}

export async function buildSyncReplayEnablementSimulation(
  env: Env,
  accountId: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const input = isRecord(body) ? body : {};
  const policy = isRecord(input.policy) ? input.policy : {};
  const evidenceInput = isRecord(input.evidence) ? input.evidence : {};
  const readinessSummary = await buildSyncReplayReadinessSummary(env, accountId, body);
  const readiness = isRecord(readinessSummary.readiness) ? readinessSummary.readiness : {};
  const candidateCounts = isRecord(readiness.candidate_counts) ? readiness.candidate_counts : {};
  const previewCounts = isRecord(readiness.preview_counts) ? readiness.preview_counts : {};
  const sampleResults = Array.isArray(readiness.sample_results) ? readiness.sample_results.filter(isRecord) : [];
  const entityTypes = Array.from(new Set(sampleResults.map(result => result.entity_type).filter(Boolean).map(String))).sort();
  const requiredTests = stringArray(evidenceInput.required_tests);

  const scopeMissing = [];
  if (!entityTypes.length) scopeMissing.push('representative task mutation samples');
  if (entityTypes.some(type => type !== 'task')) scopeMissing.push('task-only sample scope');
  if (!bool(policy.task_only_scope_locked)) scopeMissing.push('policy.task_only_scope_locked');
  if (!bool(policy.managebac_source_fields_blocked)) scopeMissing.push('policy.managebac_source_fields_blocked');

  const readinessMissing = [];
  if (!Number(candidateCounts.apply || 0)) readinessMissing.push('apply candidates');
  if (!Number(candidateCounts.conflict || 0)) readinessMissing.push('conflict candidates');
  if (!Number(previewCounts.apply_plan || 0)) readinessMissing.push('apply plan previews');
  if (!Number(previewCounts.conflict_record || 0)) readinessMissing.push('conflict record previews');

  const conflictMissing = [];
  if (!bool(policy.same_field_conflicts_create_records)) conflictMissing.push('policy.same_field_conflicts_create_records');
  if (!bool(policy.delete_update_conflicts_blocked)) conflictMissing.push('policy.delete_update_conflicts_blocked');
  if (!bool(policy.rejected_mutations_stop_retrying)) conflictMissing.push('policy.rejected_mutations_stop_retrying');
  if (!bool(policy.private_data_excluded_from_conflicts)) conflictMissing.push('policy.private_data_excluded_from_conflicts');

  const uxMode = typeof policy.offline_write_mode === 'string' ? policy.offline_write_mode : '';
  const uxMissing = [];
  if (!['blocked', 'queued_pending', 'draft'].includes(uxMode)) uxMissing.push('policy.offline_write_mode');
  if (!bool(policy.cloud_success_after_worker_confirm)) uxMissing.push('policy.cloud_success_after_worker_confirm');
  if (uxMode !== 'blocked' && !bool(policy.pending_edits_visible)) uxMissing.push('policy.pending_edits_visible');
  if (!bool(policy.failed_replay_has_user_path)) uxMissing.push('policy.failed_replay_has_user_path');

  const testMissing = [];
  for (const required of ['npm run webdev:verify', 'npm test', 'sensitive scan']) {
    if (!requiredTests.includes(required)) testMissing.push(required);
  }

  const gates = [
    gate('A', 'Scope lock', scopeMissing.length === 0, { entity_types: entityTypes }, scopeMissing),
    gate('B', 'Readiness evidence', readinessMissing.length === 0, { candidate_counts: candidateCounts, preview_counts: previewCounts }, readinessMissing),
    gate('C', 'Conflict policy', conflictMissing.length === 0, { policy }, conflictMissing),
    gate('D', 'UX and offline write semantics', uxMissing.length === 0, { offline_write_mode: uxMode || null }, uxMissing),
    gate('E', 'Test and safety bar', testMissing.length === 0, { required_tests: requiredTests }, testMissing)
  ];

  return {
    mode: 'internal_disabled_v1',
    replay_enablement: 'simulation_only',
    writes_enabled: false,
    applies_user_data: false,
    can_enable_replay: false,
    simulated_gate_pass: gates.every(item => item.passed === true),
    gates,
    readiness_summary: readinessSummary,
    recommendation: 'Use this simulation as review evidence only. A separate Product Owner approval and implementation change are required before any replay write path can be enabled.'
  };
}