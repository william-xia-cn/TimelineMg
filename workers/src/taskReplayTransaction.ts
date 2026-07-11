type ReplayResult = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function fieldConflictStatus(result: ReplayResult): string {
  const gate = isRecord(result.task_replay_gate) ? result.task_replay_gate : {};
  const check = isRecord(gate.field_conflict_check) ? gate.field_conflict_check : {};
  return stringValue(check.status);
}

function branchFor(result: ReplayResult): string {
  const gate = isRecord(result.task_replay_gate) ? result.task_replay_gate : {};
  const gateStatus = stringValue(gate.status);
  if (gateStatus === 'not_in_task_only_gate') return 'not_in_task_gate';
  if (gateStatus === 'blocked_by_task_replay_gate') return 'reject_candidate';
  if (gateStatus !== 'task_replay_gate_ready_but_disabled') return 'reject_candidate';
  const conflictStatus = fieldConflictStatus(result);
  if (conflictStatus === 'would_auto_merge') return 'apply_candidate';
  if (conflictStatus === 'would_conflict') return 'conflict_candidate';
  if (conflictStatus === 'cloud_values_required') return 'requires_cloud_values';
  return 'validation_candidate';
}

function stepsForBranch(branch: string): string[] {
  if (branch === 'apply_candidate') {
    return [
      'begin_d1_transaction',
      'load_current_task_for_update',
      'verify_account_ownership',
      'verify_task_replay_gate',
      'verify_field_conflicts',
      'apply_task_patch',
      'record_sync_change',
      'record_mutation_outcome',
      'commit_d1_transaction'
    ];
  }
  if (branch === 'conflict_candidate') {
    return [
      'begin_d1_transaction',
      'load_current_task_for_update',
      'verify_account_ownership',
      'create_sync_conflict_record',
      'record_mutation_outcome',
      'commit_d1_transaction'
    ];
  }
  if (branch === 'requires_cloud_values') {
    return [
      'load_current_task_for_validation',
      'compute_field_conflicts',
      'choose_apply_or_conflict_branch',
      'record_mutation_outcome'
    ];
  }
  return [
    'validate_mutation_rejection',
    'record_mutation_outcome'
  ];
}

export function buildTaskReplayTransactionSkeleton(result: ReplayResult): Record<string, unknown> {
  const branch = branchFor(result);
  return {
    mode: 'internal_disabled_v1',
    enabled: false,
    writes_enabled: false,
    applies_user_data: false,
    branch,
    entity_type: result.entity_type || null,
    entity_id: result.entity_id || null,
    operation: result.operation || null,
    d1_transaction_steps: stepsForBranch(branch)
  };
}

export function attachTaskReplayTransactionSkeleton(replay: Record<string, unknown>): Record<string, unknown> {
  const results = Array.isArray(replay.results) ? replay.results : [];
  return {
    ...replay,
    transaction_skeleton: 'internal_disabled_v1',
    results: results.map(result => {
      if (!isRecord(result)) return result;
      return {
        ...result,
        transaction_skeleton: buildTaskReplayTransactionSkeleton(result)
      };
    })
  };
}
