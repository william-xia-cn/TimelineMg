import { newId, nowISO } from './crypto';
import { HttpError } from './http';
import { sanitizeJsonValue } from './schema';
import type { Env } from './types';

type MutationOutcomeRow = {
  id: string;
  mutation_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  replay_status: string;
  outcome_status: string;
  reason: string | null;
  task_gate_json: string | null;
  conflict_id: string | null;
  attempt_count: number;
  first_seen_at: string;
  last_seen_at: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizedLimit(value: string | null): number {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(100, Math.floor(parsed));
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function outcomeDto(row: MutationOutcomeRow): Record<string, unknown> {
  return {
    id: row.id,
    mutation_id: row.mutation_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    replay_status: row.replay_status,
    outcome_status: row.outcome_status,
    reason: row.reason,
    task_replay_gate: parseJson(row.task_gate_json),
    conflict_id: row.conflict_id,
    attempt_count: row.attempt_count,
    first_seen_at: row.first_seen_at,
    last_seen_at: row.last_seen_at
  };
}

function outcomeRows(replay: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(replay.results) ? replay.results.filter(isRecord) : [];
}

export async function recordSyncMutationOutcomes(
  env: Env,
  accountId: string,
  replay: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const rows = outcomeRows(replay);
  const now = nowISO();
  const replayStatus = stringValue(replay.replay_status) || 'unknown';
  let recordedCount = 0;
  for (const result of rows) {
    const mutationId = stringValue(result.mutation_id);
    const entityType = stringValue(result.entity_type);
    const entityId = stringValue(result.entity_id);
    const operation = stringValue(result.operation);
    const outcomeStatus = stringValue(result.status) || 'unknown';
    if (!mutationId || !entityType || !entityId || !operation) continue;
    await env.DB.prepare(
      `INSERT INTO sync_mutation_outcomes (
        id, account_id, mutation_id, entity_type, entity_id, operation, replay_status,
        outcome_status, reason, task_gate_json, conflict_id, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, mutation_id) DO UPDATE SET
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        operation = excluded.operation,
        replay_status = excluded.replay_status,
        outcome_status = excluded.outcome_status,
        reason = excluded.reason,
        task_gate_json = excluded.task_gate_json,
        conflict_id = excluded.conflict_id,
        attempt_count = sync_mutation_outcomes.attempt_count + 1,
        last_seen_at = excluded.last_seen_at`
    ).bind(
      newId('mutation_outcome'),
      accountId,
      mutationId,
      entityType,
      entityId,
      operation,
      replayStatus,
      outcomeStatus,
      stringValue(result.reason) || null,
      sanitizeJsonValue(isRecord(result.task_replay_gate) ? result.task_replay_gate : null),
      stringValue(result.conflict_id) || null,
      now,
      now
    ).run();
    recordedCount++;
  }
  return {
    mode: 'disabled_v1_metadata_only',
    recorded_count: recordedCount
  };
}

export async function listSyncMutationOutcomes(
  env: Env,
  accountId: string,
  statusValue: string | null,
  limitValue: string | null
): Promise<Record<string, unknown>> {
  const limit = normalizedLimit(limitValue);
  const status = stringValue(statusValue);
  const sql = status
    ? `SELECT id, mutation_id, entity_type, entity_id, operation, replay_status, outcome_status, reason, task_gate_json, conflict_id, attempt_count, first_seen_at, last_seen_at
       FROM sync_mutation_outcomes
       WHERE account_id = ? AND outcome_status = ?
       ORDER BY last_seen_at DESC
       LIMIT ?`
    : `SELECT id, mutation_id, entity_type, entity_id, operation, replay_status, outcome_status, reason, task_gate_json, conflict_id, attempt_count, first_seen_at, last_seen_at
       FROM sync_mutation_outcomes
       WHERE account_id = ?
       ORDER BY last_seen_at DESC
       LIMIT ?`;
  const query = status
    ? env.DB.prepare(sql).bind(accountId, status, limit)
    : env.DB.prepare(sql).bind(accountId, limit);
  const result = await query.all<MutationOutcomeRow>();
  const outcomes = (result.results || []).map(outcomeDto);
  return {
    status: status || null,
    limit,
    count: outcomes.length,
    outcomes
  };
}

export async function getSyncMutationOutcome(
  env: Env,
  accountId: string,
  mutationId: string
): Promise<Record<string, unknown>> {
  const row = await env.DB.prepare(
    `SELECT id, mutation_id, entity_type, entity_id, operation, replay_status, outcome_status, reason, task_gate_json, conflict_id, attempt_count, first_seen_at, last_seen_at
     FROM sync_mutation_outcomes
     WHERE account_id = ? AND mutation_id = ?`
  ).bind(accountId, mutationId).first<MutationOutcomeRow>();
  if (!row) throw new HttpError(404, 'sync_mutation_outcome_not_found', 'Sync mutation outcome not found');
  return outcomeDto(row);
}
